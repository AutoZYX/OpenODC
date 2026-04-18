import {
  loadCatalog, loadDocument, loadManifest,
  buildElementIndex,
  requirementLabel, exitBehaviorLabel, adsLevelLabel, reviewStatusLabel,
  el, downloadBlob, getQueryParam
} from './common.js'

const STORAGE_KEY = 'openodc-editor-draft-v1'

let catalog = null
let elementIndex = null

const state = {
  meta: {
    vendor: '', vendor_en: '', model: '', model_en: '',
    function_name: '', function_name_en: '',
    ads_level: 2, software_version: '', hardware_config: '',
    effective_date: new Date().toISOString().slice(0, 10),
    submitted_by: '', review_status: 'draft', sources: ''
  },
  elements: new Map() // element_id -> { requirement, description, parameter_range, exit_behavior }
}

const treeContainer = document.getElementById('catalog-tree')
const treeSearch = document.getElementById('tree-search')
const selectedList = document.getElementById('selected-list')
const selectedCount = document.getElementById('selected-count')
const jsonPreview = document.getElementById('json-preview')

function bindMetaInputs() {
  const map = {
    'm-vendor': 'vendor', 'm-vendor_en': 'vendor_en',
    'm-model': 'model', 'm-model_en': 'model_en',
    'm-function_name': 'function_name', 'm-function_name_en': 'function_name_en',
    'm-ads_level': 'ads_level', 'm-software_version': 'software_version',
    'm-hardware_config': 'hardware_config', 'm-effective_date': 'effective_date',
    'm-submitted_by': 'submitted_by', 'm-review_status': 'review_status',
    'm-sources': 'sources'
  }
  for (const [domId, stateKey] of Object.entries(map)) {
    const el = document.getElementById(domId)
    el.value = state.meta[stateKey] ?? ''
    el.addEventListener('input', () => {
      state.meta[stateKey] = el.value
      renderPreview()
    })
  }
}

function renderTree(filter = '') {
  treeContainer.innerHTML = ''
  const q = filter.trim().toLowerCase()
  for (const cat of catalog.categories) {
    const catNode = el('div', { class: 'tree-cat' })
    catNode.appendChild(el('h4', { class: 'tree-cat-title' }, cat.name_zh + ' · §' + cat.spec_section))

    // Build a sub-tree for this category by parent_id relationships
    const byParent = new Map()
    for (const e of cat.elements) {
      const pid = e.parent_id || cat.category_id
      if (!byParent.has(pid)) byParent.set(pid, [])
      byParent.get(pid).push(e)
    }
    const ul = renderSubTree(cat.category_id, byParent, q, cat)
    if (ul && (!q || ul.children.length > 0)) {
      catNode.appendChild(ul)
      treeContainer.appendChild(catNode)
    }
  }
  if (treeContainer.children.length === 0) {
    treeContainer.appendChild(el('p', { class: 'empty-hint' }, '没有匹配元素'))
  }
}

function renderSubTree(parentId, byParent, q, cat) {
  const children = byParent.get(parentId) || []
  if (children.length === 0) return null
  const ul = el('ul', { class: 'tree-list' })
  for (const child of children) {
    const matches = !q || child.name_zh.toLowerCase().includes(q) || child.id.toLowerCase().includes(q)
    const subUl = renderSubTree(child.id, byParent, q, cat)
    if (!matches && (!subUl || subUl.children.length === 0)) continue
    const li = el('li', { class: 'tree-item' })
    const isSelected = state.elements.has(child.id)
    const isLeaf = !byParent.has(child.id)
    const label = el('span', {
      class: 'tree-label' + (isSelected ? ' is-selected' : '') + (isLeaf ? ' is-leaf' : ''),
      onclick: () => {
        if (isSelected) {
          state.elements.delete(child.id)
        } else {
          state.elements.set(child.id, {
            requirement: 'permitted',
            description: '',
            parameter_range: '',
            exit_behavior: null
          })
        }
        renderTree(treeSearch.value)
        renderSelected()
        renderPreview()
      }
    }, [
      el('span', { class: 'tree-marker' }, isSelected ? '✓' : '+'),
      el('span', { class: 'tree-name' }, child.name_zh),
      el('span', { class: 'tree-section' }, '§' + child.spec_section)
    ])
    li.appendChild(label)
    if (subUl) li.appendChild(subUl)
    ul.appendChild(li)
  }
  return ul
}

function renderSelected() {
  selectedCount.textContent = String(state.elements.size)
  selectedList.innerHTML = ''
  if (state.elements.size === 0) {
    selectedList.appendChild(el('p', { class: 'empty-hint' }, '还没有声明任何元素。从左侧层级树中点击元素加入。'))
    return
  }
  // Group by category
  const groups = new Map()
  for (const [id, val] of state.elements) {
    const meta = elementIndex.get(id)
    if (!meta) continue
    const key = meta.category_id
    if (!groups.has(key)) groups.set(key, { name: meta.category_name_zh, items: [] })
    groups.get(key).items.push({ id, meta, val })
  }
  for (const [_, g] of groups) {
    selectedList.appendChild(el('h4', { class: 'sel-cat-title' }, g.name))
    for (const item of g.items) {
      selectedList.appendChild(renderSelectedItem(item))
    }
  }
}

function renderSelectedItem({ id, meta, val }) {
  const card = el('div', { class: 'sel-item req-' + val.requirement })
  card.appendChild(el('div', { class: 'sel-item-header' }, [
    el('span', { class: 'sel-item-name' }, meta.name_zh),
    el('span', { class: 'sel-item-section' }, '§' + meta.spec_section),
    el('button', { class: 'sel-item-remove', onclick: () => {
      state.elements.delete(id)
      renderTree(treeSearch.value)
      renderSelected()
      renderPreview()
    } }, '×')
  ]))
  const reqRow = el('div', { class: 'sel-item-row' })
  for (const r of ['permitted', 'not_permitted']) {
    const radioId = `req-${id}-${r}`
    const wrapper = el('label', { class: 'req-radio req-radio-' + r + (val.requirement === r ? ' active' : '') })
    const input = el('input', { type: 'radio', name: `req-${id}`, value: r, id: radioId })
    if (val.requirement === r) input.checked = true
    input.addEventListener('change', () => {
      val.requirement = r
      if (r === 'permitted') val.exit_behavior = null
      else if (!val.exit_behavior) val.exit_behavior = 'suppress_and_exit'
      renderSelected()
      renderPreview()
    })
    wrapper.appendChild(input)
    wrapper.appendChild(document.createTextNode(requirementLabel(r)))
    reqRow.appendChild(wrapper)
  }
  card.appendChild(reqRow)

  // Description
  const descLabel = el('label', { class: 'sel-field' })
  descLabel.appendChild(el('span', {}, '说明'))
  const descInput = el('input', { type: 'text', value: val.description, placeholder: meta.description_zh ? meta.description_zh.slice(0, 60) : '可选' })
  descInput.addEventListener('input', () => { val.description = descInput.value; renderPreview() })
  descLabel.appendChild(descInput)
  card.appendChild(descLabel)

  // Parameter range (only if permitted)
  if (val.requirement === 'permitted') {
    const paramLabel = el('label', { class: 'sel-field' })
    paramLabel.appendChild(el('span', {}, '参数范围'))
    const placeholder = meta.requirement_template ? meta.requirement_template.slice(0, 60) : '如：曲率半径 ≥ 150 m'
    const paramInput = el('input', { type: 'text', value: val.parameter_range, placeholder })
    paramInput.addEventListener('input', () => { val.parameter_range = paramInput.value; renderPreview() })
    paramLabel.appendChild(paramInput)
    card.appendChild(paramLabel)
  }

  // Exit behavior (only if not_permitted)
  if (val.requirement === 'not_permitted') {
    const exitLabel = el('label', { class: 'sel-field' })
    exitLabel.appendChild(el('span', {}, '退出行为'))
    const exitSelect = el('select', {})
    for (const opt of ['suppress_activation', 'trigger_exit', 'suppress_and_exit']) {
      const o = el('option', { value: opt }, exitBehaviorLabel(opt))
      if (val.exit_behavior === opt) o.selected = true
      exitSelect.appendChild(o)
    }
    exitSelect.addEventListener('change', () => { val.exit_behavior = exitSelect.value; renderPreview() })
    exitLabel.appendChild(exitSelect)
    card.appendChild(exitLabel)
  }

  return card
}

function buildDocument() {
  const id = (state.meta.vendor + '-' + state.meta.model + '-' + state.meta.function_name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'untitled-odc'
  return {
    id,
    spec_version: '0.1.0',
    spec_source: 'GB/T 45312-2025',
    vendor: state.meta.vendor,
    vendor_en: state.meta.vendor_en || undefined,
    model: state.meta.model,
    model_en: state.meta.model_en || undefined,
    function_name: state.meta.function_name,
    function_name_en: state.meta.function_name_en || undefined,
    ads_level: parseInt(state.meta.ads_level, 10),
    software_version: state.meta.software_version || null,
    hardware_config: state.meta.hardware_config || null,
    effective_date: state.meta.effective_date,
    elements: [...state.elements].map(([element_id, v]) => {
      const out = { element_id, requirement: v.requirement }
      if (v.description) out.description = v.description
      if (v.parameter_range) out.parameter_range = v.parameter_range
      if (v.requirement === 'not_permitted' && v.exit_behavior) out.exit_behavior = v.exit_behavior
      return out
    }),
    metadata: {
      submitted_by: state.meta.submitted_by || 'unknown',
      submitted_at: new Date().toISOString(),
      review_status: state.meta.review_status,
      sources: state.meta.sources ? state.meta.sources.split('\n').map(s => s.trim()).filter(Boolean) : []
    }
  }
}

function renderPreview() {
  jsonPreview.textContent = JSON.stringify(buildDocument(), null, 2)
}

function bindToolbar() {
  document.getElementById('t-load-example').addEventListener('click', async () => {
    const doc = await loadDocument('data/examples/gb45312-appendix-a-l3-highway.json')
    importFromDoc(doc)
  })
  document.getElementById('t-clear').addEventListener('click', () => {
    if (!confirm('确认清空当前编辑内容？')) return
    state.elements.clear()
    for (const k of Object.keys(state.meta)) state.meta[k] = (k === 'ads_level' ? 2 : (k === 'review_status' ? 'draft' : (k === 'effective_date' ? new Date().toISOString().slice(0, 10) : '')))
    bindMetaInputs() // re-sync DOM
    renderTree(treeSearch.value)
    renderSelected()
    renderPreview()
  })
  document.getElementById('t-save-local').addEventListener('click', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      meta: state.meta,
      elements: [...state.elements]
    }))
    alert('已保存到浏览器本地存储。')
  })
  document.getElementById('t-load-local').addEventListener('click', () => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) { alert('没有本地保存的草稿'); return }
    const data = JSON.parse(raw)
    state.meta = data.meta
    state.elements = new Map(data.elements)
    bindMetaInputs()
    renderTree(treeSearch.value)
    renderSelected()
    renderPreview()
  })
  document.getElementById('t-download-json').addEventListener('click', () => {
    const doc = buildDocument()
    downloadBlob(JSON.stringify(doc, null, 2), `${doc.id}.json`, 'application/json')
  })
  document.getElementById('t-download-md').addEventListener('click', () => {
    const doc = buildDocument()
    downloadBlob(toMarkdownSummary(doc), `${doc.id}.md`, 'text/markdown')
  })
  document.getElementById('t-copy-json').addEventListener('click', async () => {
    const doc = buildDocument()
    await navigator.clipboard.writeText(JSON.stringify(doc, null, 2))
    alert('已复制到剪贴板')
  })
  treeSearch.addEventListener('input', () => renderTree(treeSearch.value))
}

function importFromDoc(doc) {
  state.meta.vendor = doc.vendor || ''
  state.meta.vendor_en = doc.vendor_en || ''
  state.meta.model = doc.model || ''
  state.meta.model_en = doc.model_en || ''
  state.meta.function_name = doc.function_name || ''
  state.meta.function_name_en = doc.function_name_en || ''
  state.meta.ads_level = doc.ads_level ?? 2
  state.meta.software_version = doc.software_version || ''
  state.meta.hardware_config = doc.hardware_config || ''
  state.meta.effective_date = doc.effective_date || new Date().toISOString().slice(0, 10)
  state.meta.submitted_by = doc.metadata?.submitted_by || ''
  state.meta.review_status = doc.metadata?.review_status || 'draft'
  state.meta.sources = (doc.metadata?.sources || []).join('\n')
  state.elements.clear()
  for (const e of doc.elements || []) {
    state.elements.set(e.element_id, {
      requirement: e.requirement,
      description: e.description || '',
      parameter_range: e.parameter_range || '',
      exit_behavior: e.exit_behavior || null
    })
  }
  bindMetaInputs()
  renderTree(treeSearch.value)
  renderSelected()
  renderPreview()
}

function toMarkdownSummary(doc) {
  let md = `# ${doc.vendor} ${doc.model} — ${doc.function_name}\n\n`
  md += `- 自动化等级：${adsLevelLabel(doc.ads_level)}\n`
  md += `- 软件版本：${doc.software_version || '—'}\n`
  md += `- 生效日期：${doc.effective_date}\n`
  md += `- 标准依据：${doc.spec_source}\n`
  md += `- 审核状态：${reviewStatusLabel(doc.metadata.review_status)}\n\n`
  md += `共 ${doc.elements.length} 项 ODC 元素。\n`
  return md
}

async function maybeLoadFromQuery() {
  const loadId = getQueryParam('load')
  if (loadId) {
    try {
      const manifest = await loadManifest()
      const entry = manifest.documents.find(d => d.id === loadId)
      if (!entry) { console.warn('load id not found:', loadId); return false }
      const doc = await loadDocument(entry.file)
      importFromDoc(doc)
      showWorkbenchBanner(`已从样例库加载「${doc.vendor} · ${doc.function_name}」作为起点`, getQueryParam('workbench_vendor'), getQueryParam('workbench_fn'))
      return true
    } catch (e) { console.warn('load failed:', e); return false }
  }

  const wbVendor = getQueryParam('workbench_vendor')
  const wbFn = getQueryParam('workbench_fn')
  if (wbVendor && wbFn) {
    // Prefill blank editor with workbench function metadata
    state.meta.vendor = decodeURIComponent(getQueryParam('wb_vendor_name') || '')
    state.meta.function_name = decodeURIComponent(getQueryParam('wb_fn_name') || '')
    state.meta.model = decodeURIComponent(getQueryParam('wb_model') || '')
    const lvl = getQueryParam('wb_level')
    if (lvl) state.meta.ads_level = parseInt(lvl, 10) || 2
    showWorkbenchBanner('从厂家直填工作台进入。已预填厂家 / 车型 / 功能名；请在左侧层级树勾选 ODC 要素。', wbVendor, wbFn)
    return true
  }
  return false
}

function showWorkbenchBanner(msg, vendor, fn) {
  const banner = el('div', { class: 'editor-workbench-banner' }, [
    el('span', { class: 'wb-dot' }, '●'),
    el('span', { class: 'wb-msg' }, msg),
    vendor && fn ? el('a', { class: 'wb-back', href: '/workbench.html' }, '← 返回工作台') : null
  ])
  const main = document.querySelector('main')
  if (main) main.insertBefore(banner, main.firstChild)
}

;(async () => {
  try {
    catalog = await loadCatalog()
    elementIndex = buildElementIndex(catalog)
    bindMetaInputs()
    await maybeLoadFromQuery()
    renderTree('')
    renderSelected()
    renderPreview()
    bindToolbar()
  } catch (e) {
    treeContainer.innerHTML = `<p class="error">加载失败：${e.message}</p>`
  }
})()

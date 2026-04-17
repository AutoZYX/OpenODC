import {
  loadCatalog, loadManifest, loadDocument,
  buildElementIndex, groupByCategory,
  adsLevelLabel, reviewStatusLabel, requirementLabel, exitBehaviorLabel,
  el, downloadBlob, getQueryParam
} from './common.js'

const titleEl = document.getElementById('doc-title')
const subtitleEl = document.getElementById('doc-subtitle')
const badgesEl = document.getElementById('doc-badges')
const containerEl = document.getElementById('view-container')

let currentDoc = null
let currentIndex = null
let currentCatalog = null
let currentView = getQueryParam('view') || 'dev'

function setView(name) {
  currentView = name
  document.querySelectorAll('.view-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.view === name)
  })
  const url = new URL(window.location)
  url.searchParams.set('view', name)
  window.history.replaceState(null, '', url)
  renderCurrent()
}

function renderCurrent() {
  if (!currentDoc) return
  containerEl.innerHTML = ''
  switch (currentView) {
    case 'dev': renderDev(); break
    case 'consumer': renderConsumer(); break
    default: renderDev()
  }
}

// ---- Developer view: full hierarchy + JSON ----
function renderDev() {
  const groups = groupByCategory(currentDoc, currentIndex)
  const wrap = el('div', { class: 'dev-view' })

  for (const [catId, group] of groups) {
    const section = el('div', { class: 'cat-block' })
    section.appendChild(el('h2', { class: 'cat-title' }, group.name_zh))
    const table = el('table', { class: 'odc-table' })
    table.appendChild(el('thead', {}, el('tr', {}, [
      el('th', {}, '元素 (章节)'),
      el('th', {}, '要求'),
      el('th', {}, '说明 / 参数'),
      el('th', {}, '退出行为')
    ])))
    const tbody = el('tbody')
    for (const e of group.elements) {
      const meta = e._meta
      const row = el('tr', { class: 'req-' + e.requirement })
      row.appendChild(el('td', {}, [
        el('div', { class: 'el-name' }, meta.name_zh),
        el('div', { class: 'el-section' }, '§' + meta.spec_section + (meta.spec_reference ? ' · ' + meta.spec_reference : ''))
      ]))
      row.appendChild(el('td', { class: 'req-cell' }, requirementLabel(e.requirement)))
      const desc = e.description || meta.description_zh || ''
      row.appendChild(el('td', {}, [
        el('div', {}, desc),
        e.parameter_range ? el('div', { class: 'param-range' }, e.parameter_range) : null
      ]))
      row.appendChild(el('td', { class: 'exit-cell' }, exitBehaviorLabel(e.exit_behavior)))
      tbody.appendChild(row)
    }
    table.appendChild(tbody)
    section.appendChild(table)
    wrap.appendChild(section)
  }

  if (currentDoc.associations && currentDoc.associations.length) {
    const ass = el('div', { class: 'cat-block' })
    ass.appendChild(el('h2', { class: 'cat-title' }, '元素关联关系'))
    const list = el('ul', { class: 'assoc-list' })
    for (const a of currentDoc.associations) {
      const primary = currentIndex.get(a.primary_id)?.name_zh || a.primary_id
      const dependent = currentIndex.get(a.dependent_id)?.name_zh || a.dependent_id
      list.appendChild(el('li', {}, `${primary} → ${dependent}：${a.description}`))
    }
    ass.appendChild(list)
    wrap.appendChild(ass)
  }

  // JSON dump
  const jsonBlock = el('details', { class: 'json-details' })
  jsonBlock.appendChild(el('summary', {}, '查看完整 JSON 原文'))
  const pre = el('pre', { class: 'json-dump' })
  pre.textContent = JSON.stringify(currentDoc, null, 2)
  jsonBlock.appendChild(pre)
  wrap.appendChild(jsonBlock)

  containerEl.appendChild(wrap)
}

// ---- Consumer view: plain-language cards ----
function renderConsumer() {
  const wrap = el('div', { class: 'consumer-view' })
  wrap.appendChild(el('p', { class: 'view-intro' }, '面向普通用户：这台车的智驾在什么情况下能用、什么情况下不能用？'))

  const buckets = bucketizeForConsumer(currentDoc)
  if (buckets.useable.length === 0 && buckets.unusable.length === 0) {
    wrap.appendChild(el('p', {}, '暂无足够数据生成消费者视图。'))
    containerEl.appendChild(wrap)
    return
  }

  const summaryText = generateOneLineSummary(currentDoc, buckets)
  wrap.appendChild(el('div', { class: 'consumer-summary' }, summaryText))

  const cardGrid = el('div', { class: 'consumer-cards' })
  if (buckets.useable.length) {
    cardGrid.appendChild(consumerCard('green', '能用', buckets.useable))
  }
  if (buckets.limited.length) {
    cardGrid.appendChild(consumerCard('amber', '有限制', buckets.limited))
  }
  if (buckets.unusable.length) {
    cardGrid.appendChild(consumerCard('red', '不能用', buckets.unusable))
  }
  wrap.appendChild(cardGrid)

  if (buckets.exits.length) {
    const exits = el('div', { class: 'consumer-exits' })
    exits.appendChild(el('h3', {}, '注意：这些情况会让系统突然退出，需要驾驶员立即接管'))
    const list = el('ul')
    for (const e of buckets.exits) list.appendChild(el('li', {}, e))
    exits.appendChild(list)
    wrap.appendChild(exits)
  }

  containerEl.appendChild(wrap)
}

function bucketizeForConsumer(doc) {
  const useable = []
  const limited = []
  const unusable = []
  const exits = []

  for (const e of doc.elements) {
    const meta = currentIndex.get(e.element_id)
    if (!meta) continue
    const human = humanizeElement(meta, e)
    if (e.requirement === 'permitted') {
      if (e.parameter_range) limited.push(human)
      else useable.push(human)
    } else {
      unusable.push(human)
      if (e.exit_behavior === 'trigger_exit' || e.exit_behavior === 'suppress_and_exit') {
        exits.push(human)
      }
    }
  }
  return { useable, limited, unusable, exits }
}

function humanizeElement(meta, e) {
  let label = meta.name_zh
  if (e.parameter_range) label += ` (${e.parameter_range})`
  return label
}

function generateOneLineSummary(doc, buckets) {
  return `${doc.vendor} ${doc.model} 的「${doc.function_name}」是 ${adsLevelLabel(doc.ads_level)} 自动驾驶系统。声明可用范围包括 ${buckets.useable.length} 项允许、${buckets.limited.length} 项有限制条件，明确不允许 ${buckets.unusable.length} 项场景。`
}

function consumerCard(color, title, items) {
  const card = el('div', { class: 'consumer-card consumer-card-' + color })
  card.appendChild(el('h3', {}, title))
  const list = el('ul')
  for (const it of items.slice(0, 12)) list.appendChild(el('li', {}, it))
  if (items.length > 12) list.appendChild(el('li', { class: 'more' }, `… 另有 ${items.length - 12} 项`))
  card.appendChild(list)
  return card
}

// ---- Header rendering ----
function renderHeader() {
  document.title = `${currentDoc.vendor} ${currentDoc.model} — OpenODC`
  titleEl.textContent = `${currentDoc.vendor} · ${currentDoc.model}`
  subtitleEl.textContent = currentDoc.function_name
  badgesEl.innerHTML = ''
  badgesEl.appendChild(el('span', { class: `ads-pill ads-pill-l${currentDoc.ads_level}` }, adsLevelLabel(currentDoc.ads_level)))
  badgesEl.appendChild(el('span', { class: `status-pill status-${currentDoc.metadata.review_status}` }, reviewStatusLabel(currentDoc.metadata.review_status)))
  badgesEl.appendChild(el('span', { class: 'meta-pill' }, currentDoc.effective_date))
  if (currentDoc.software_version) badgesEl.appendChild(el('span', { class: 'meta-pill' }, currentDoc.software_version))
}

function attachActions() {
  document.querySelectorAll('.view-tab').forEach(t => {
    t.addEventListener('click', () => setView(t.dataset.view))
  })
  document.getElementById('copy-json').addEventListener('click', async () => {
    await navigator.clipboard.writeText(JSON.stringify(currentDoc, null, 2))
    alert('已复制到剪贴板')
  })
  document.getElementById('download-json').addEventListener('click', () => {
    downloadBlob(JSON.stringify(currentDoc, null, 2), `${currentDoc.id}.json`, 'application/json')
  })
  document.getElementById('download-md').addEventListener('click', () => {
    downloadBlob(toMarkdown(currentDoc), `${currentDoc.id}.md`, 'text/markdown')
  })
}

function toMarkdown(doc) {
  let md = `# ${doc.vendor} ${doc.model} — ${doc.function_name}\n\n`
  md += `- 自动化等级：${adsLevelLabel(doc.ads_level)}\n`
  md += `- 软件版本：${doc.software_version || '—'}\n`
  md += `- 生效日期：${doc.effective_date}\n`
  md += `- 标准依据：${doc.spec_source}\n`
  md += `- 审核状态：${reviewStatusLabel(doc.metadata.review_status)}\n\n`

  const groups = groupByCategory(doc, currentIndex)
  for (const [_, g] of groups) {
    md += `## ${g.name_zh}\n\n`
    md += `| 元素 (章节) | 要求 | 说明 / 参数 | 退出行为 |\n|---|---|---|---|\n`
    for (const e of g.elements) {
      const m = e._meta
      md += `| ${m.name_zh} (§${m.spec_section}) | ${requirementLabel(e.requirement)} | ${(e.description || '').replace(/\|/g, '\\|')}${e.parameter_range ? ' · ' + e.parameter_range : ''} | ${exitBehaviorLabel(e.exit_behavior) || '—'} |\n`
    }
    md += '\n'
  }
  if (doc.associations?.length) {
    md += `## 元素关联关系\n\n`
    for (const a of doc.associations) {
      const p = currentIndex.get(a.primary_id)?.name_zh || a.primary_id
      const d = currentIndex.get(a.dependent_id)?.name_zh || a.dependent_id
      md += `- ${p} → ${d}：${a.description}\n`
    }
    md += '\n'
  }
  md += `---\n*由 OpenODC 生成 · ${new Date().toISOString()} · https://openodc.autozyx.com*\n`
  return md
}

;(async () => {
  try {
    const id = getQueryParam('id')
    if (!id) {
      containerEl.innerHTML = '<p class="error">缺少 ?id 参数。<a href="/gallery.html">返回样例库</a></p>'
      return
    }
    const [catalog, manifest] = await Promise.all([loadCatalog(), loadManifest()])
    currentCatalog = catalog
    currentIndex = buildElementIndex(catalog)
    const entry = manifest.documents.find(d => d.id === id)
    if (!entry) throw new Error(`未找到样例：${id}`)
    currentDoc = await loadDocument(entry.file)
    renderHeader()
    attachActions()
    renderCurrent()
  } catch (e) {
    containerEl.innerHTML = `<p class="error">加载失败：${e.message}</p>`
  }
})()

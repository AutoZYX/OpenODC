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

// ---- Consumer view: plain-language, grouped, verifiable ----
function renderConsumer() {
  const wrap = el('div', { class: 'consumer-view' })
  wrap.appendChild(el('p', { class: 'view-intro' }, '面向普通用户：这台车的智驾在什么情况下能用、什么情况下不能用？每条都标注标准章节号，可对照 GB/T 45312—2025 核验。'))

  const buckets = bucketizeForConsumer(currentDoc)
  if (buckets.useable.length === 0 && buckets.unusable.length === 0) {
    wrap.appendChild(el('p', {}, '暂无足够数据生成消费者视图。'))
    containerEl.appendChild(wrap)
    return
  }

  wrap.appendChild(el('div', { class: 'consumer-summary' }, generateOneLineSummary(currentDoc, buckets)))

  const stats = coverageStats(currentDoc)
  const coverageStrip = el('div', { class: 'coverage-strip' })
  coverageStrip.appendChild(el('div', { class: 'coverage-strip-head' }, '该 ODC 对 GB/T 45312—2025 全部 ' + stats.total + ' 个国标要素的覆盖情况：'))
  const bar = el('div', { class: 'coverage-bar' })
  const manual = stats.manual + stats.official + stats.curated
  const inferred = stats.inferred, gap = stats.gap, structural = stats.structural
  if (manual) bar.appendChild(el('span', { class: 'seg seg-manual', style: `flex:${manual}` }, '手册/官方 ' + manual))
  if (inferred) bar.appendChild(el('span', { class: 'seg seg-inferred', style: `flex:${inferred}` }, '推定 ' + inferred))
  if (gap) bar.appendChild(el('span', { class: 'seg seg-gap', style: `flex:${gap}` }, '手册未涉及 ' + gap))
  if (structural) bar.appendChild(el('span', { class: 'seg seg-structural', style: `flex:${structural}` }, '结构 ' + structural))
  coverageStrip.appendChild(bar)
  coverageStrip.appendChild(el('p', { class: 'coverage-strip-note' }, '「手册未涉及」的数量本身就是数据：它直接显示了该厂家文档相对国标的披露缺口。'))
  wrap.appendChild(coverageStrip)

  if (buckets.exits.length) {
    const exits = el('div', { class: 'consumer-exits' })
    exits.appendChild(el('h3', {}, `⚠ 这 ${buckets.exits.length} 种情况会让系统突然退出，需要驾驶员立即接管`))
    const list = el('ul')
    for (const e of buckets.exits) list.appendChild(el('li', {}, e.label))
    exits.appendChild(list)
    wrap.appendChild(exits)
  }

  wrap.appendChild(renderBucket('green', '✓ 能用', buckets.useable, '无条件允许的场景'))
  wrap.appendChild(renderBucket('amber', '△ 有限制', buckets.limited, '在参数范围内允许；超出范围会降级或退出'))
  wrap.appendChild(renderBucket('red', '✗ 不能用', buckets.unusable, '系统明确声明不能处理；实际行为见「退出行为」'))

  wrap.appendChild(renderSourcesFooter(currentDoc))
  containerEl.appendChild(wrap)
}

function classifyCoverage(description) {
  if (!description) return 'curated'
  if (description.includes('[手册未涉及]')) return 'gap'
  if (description.includes('[结构性类别]')) return 'structural'
  if (description.includes('[手册明确]')) return 'manual'
  if (description.includes('[官方声明]')) return 'official'
  if (description.includes('[推定]')) return 'inferred'
  return 'curated'
}

function bucketizeForConsumer(doc) {
  const useable = [], limited = [], unusable = [], exits = []
  for (const e of doc.elements) {
    const meta = currentIndex.get(e.element_id)
    if (!meta) continue
    const coverage = classifyCoverage(e.description)
    const item = {
      element_id: e.element_id,
      name_zh: meta.name_zh,
      category_name_zh: meta.category_name_zh,
      spec_section: meta.spec_section,
      parameter_range: e.parameter_range || null,
      description: e.description || null,
      exit_behavior: e.exit_behavior || null,
      coverage,
      label: meta.name_zh + (e.parameter_range ? ` (${e.parameter_range})` : '')
    }
    if (e.requirement === 'permitted') {
      if (e.parameter_range) limited.push(item)
      else useable.push(item)
    } else {
      unusable.push(item)
      if (e.exit_behavior === 'trigger_exit' || e.exit_behavior === 'suppress_and_exit') exits.push(item)
    }
  }
  return { useable, limited, unusable, exits }
}

function generateOneLineSummary(doc, buckets) {
  return `${doc.vendor} ${doc.model} 的「${doc.function_name}」是 ${adsLevelLabel(doc.ads_level)} 自动驾驶系统。声明可用范围包括 ${buckets.useable.length} 项无条件允许、${buckets.limited.length} 项有限制条件，明确不允许 ${buckets.unusable.length} 项场景。`
}

function renderBucket(color, heading, items, hint) {
  const section = el('div', { class: 'consumer-bucket consumer-bucket-' + color })
  section.appendChild(el('h3', { class: 'bucket-heading' }, [
    el('span', { class: 'bucket-title' }, heading),
    el('span', { class: 'bucket-count' }, ` · ${items.length} 项`)
  ]))
  section.appendChild(el('p', { class: 'bucket-hint' }, hint))
  if (!items.length) {
    section.appendChild(el('p', { class: 'empty-note' }, '（无）'))
    return section
  }
  const byCategory = new Map()
  for (const it of items) {
    const key = it.category_name_zh || '其他'
    if (!byCategory.has(key)) byCategory.set(key, [])
    byCategory.get(key).push(it)
  }
  for (const [catName, catItems] of byCategory) {
    const details = el('details', { class: 'consumer-group' })
    details.setAttribute('open', '')
    details.appendChild(el('summary', { class: 'group-summary' }, [
      el('span', { class: 'group-name' }, catName),
      el('span', { class: 'group-count' }, ` · ${catItems.length} 项`)
    ]))
    const list = el('ul', { class: 'consumer-item-list' })
    for (const it of catItems) list.appendChild(renderConsumerItem(it))
    details.appendChild(list)
    section.appendChild(details)
  }
  return section
}

function renderConsumerItem(it) {
  const li = el('li', { class: 'consumer-item coverage-' + it.coverage })
  const head = el('div', { class: 'item-head' })
  head.appendChild(el('span', { class: 'item-name' }, it.name_zh))
  if (it.parameter_range) head.appendChild(el('span', { class: 'item-range' }, ' — ' + it.parameter_range))
  if (it.coverage === 'gap') head.appendChild(el('span', { class: 'coverage-tag tag-gap' }, '手册未涉及'))
  else if (it.coverage === 'structural') head.appendChild(el('span', { class: 'coverage-tag tag-structural' }, '结构性'))
  else if (it.coverage === 'manual') head.appendChild(el('span', { class: 'coverage-tag tag-manual' }, '手册明确'))
  else if (it.coverage === 'official') head.appendChild(el('span', { class: 'coverage-tag tag-official' }, '官方声明'))
  else if (it.coverage === 'inferred') head.appendChild(el('span', { class: 'coverage-tag tag-inferred' }, '推定'))
  li.appendChild(head)
  if (it.description && it.coverage !== 'gap' && it.coverage !== 'structural') {
    li.appendChild(el('div', { class: 'item-desc' }, it.description))
  }
  if (it.exit_behavior) li.appendChild(el('div', { class: 'item-exit' }, '退出行为：' + exitBehaviorLabel(it.exit_behavior)))
  li.appendChild(el('div', { class: 'item-meta' }, [
    el('code', { class: 'item-id' }, it.element_id),
    el('span', { class: 'item-section' }, ' · 标准 §' + it.spec_section)
  ]))
  return li
}

function coverageStats(doc) {
  const stats = { total: doc.elements.length, manual: 0, inferred: 0, curated: 0, gap: 0, structural: 0 }
  for (const e of doc.elements) stats[classifyCoverage(e.description)]++
  return stats
}

function renderSourcesFooter(doc) {
  const footer = el('div', { class: 'consumer-sources' })
  footer.appendChild(el('h3', {}, '数据来源与核验指引'))
  const statusText = {
    draft: '本 ODC 为社区基于公开资料（用户手册、官方发布会、第三方测评）反推，不代表厂家官方声明。请以厂家官方手册为准。',
    community_reviewed: '本 ODC 已经过社区同行评审。',
    vendor_confirmed: '本 ODC 已由厂家官方确认。'
  }[doc.metadata.review_status] || ''
  footer.appendChild(el('p', { class: 'source-status' }, statusText))
  if (doc.metadata.sources && doc.metadata.sources.length) {
    footer.appendChild(el('p', { class: 'source-list-intro' }, '引用资料：'))
    const list = el('ul', { class: 'source-list' })
    for (const src of doc.metadata.sources) list.appendChild(renderSourceLi(src))
    footer.appendChild(list)
  }
  if (doc.metadata.notes) footer.appendChild(el('p', { class: 'source-notes' }, doc.metadata.notes))
  return footer
}

function renderSourceLi(src) {
  const li = el('li')
  const urlMatch = src.match(/(https?:\/\/\S+)/)
  if (urlMatch) {
    const before = src.substring(0, urlMatch.index).replace(/[:：]?\s*$/, '').trim()
    if (before) li.appendChild(el('span', {}, before + '：'))
    const a = document.createElement('a')
    a.href = urlMatch[0]
    a.target = '_blank'
    a.rel = 'noopener'
    a.textContent = urlMatch[0]
    li.appendChild(a)
    const after = src.substring(urlMatch.index + urlMatch[0].length).trim()
    if (after) li.appendChild(el('span', {}, ' ' + after))
  } else {
    li.textContent = src
  }
  return li
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

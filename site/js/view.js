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
    case 'test': renderTest(); break
    case 'regulator': renderRegulator(); break
    case 'consumer': renderConsumer(); break
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

// ---- Tester view: scenario sampling grid ----
function renderTest() {
  const wrap = el('div', { class: 'test-view' })
  wrap.appendChild(el('p', { class: 'view-intro' }, '场景生成清单：每条「允许」元素 + 参数范围作为测试维度。可导出用于仿真平台或封闭场地测试编排。'))

  const permitted = currentDoc.elements.filter(e => e.requirement === 'permitted')
  const withRange = permitted.filter(e => e.parameter_range)
  const withoutRange = permitted.filter(e => !e.parameter_range)

  const summary = el('div', { class: 'test-summary' }, [
    el('div', { class: 'stat-box' }, [el('strong', {}, String(permitted.length)), el('span', {}, '允许元素')]),
    el('div', { class: 'stat-box' }, [el('strong', {}, String(withRange.length)), el('span', {}, '含参数范围')]),
    el('div', { class: 'stat-box' }, [el('strong', {}, String(withoutRange.length)), el('span', {}, '无定量范围')])
  ])
  wrap.appendChild(summary)

  if (withRange.length) {
    const block = el('div', { class: 'cat-block' })
    block.appendChild(el('h2', { class: 'cat-title' }, '量化测试维度'))
    const table = el('table', { class: 'odc-table' })
    table.appendChild(el('thead', {}, el('tr', {}, [
      el('th', {}, '元素'),
      el('th', {}, '参数范围'),
      el('th', {}, '建议采样点 (P5/P25/P50/P75/P95)')
    ])))
    const tbody = el('tbody')
    for (const e of withRange) {
      const meta = currentIndex.get(e.element_id)
      tbody.appendChild(el('tr', {}, [
        el('td', {}, meta?.name_zh || e.element_id),
        el('td', {}, e.parameter_range),
        el('td', { class: 'sampling-cell' }, suggestSampling(e.parameter_range))
      ]))
    }
    table.appendChild(tbody)
    block.appendChild(table)
    wrap.appendChild(block)
  }

  if (withoutRange.length) {
    const block = el('div', { class: 'cat-block' })
    block.appendChild(el('h2', { class: 'cat-title' }, '离散允许元素'))
    const list = el('ul', { class: 'discrete-list' })
    for (const e of withoutRange) {
      const meta = currentIndex.get(e.element_id)
      list.appendChild(el('li', {}, (meta?.name_zh || e.element_id) + (e.description ? ' — ' + e.description : '')))
    }
    block.appendChild(list)
    wrap.appendChild(block)
  }

  containerEl.appendChild(wrap)
}

// Try to extract numeric bounds from a range string and propose 5 sample points
function suggestSampling(range) {
  if (!range) return '—'
  // Look for patterns like "≥ 150 m", "≤ 6%", "3 m < x < 4.5 m", "-20°C to 45°C", "200m < visibility <= 500m"
  const numbers = [...range.matchAll(/-?\d+(?:\.\d+)?/g)].map(m => parseFloat(m[0]))
  if (numbers.length === 0) return '需要人工指定'
  if (numbers.length === 1) {
    if (range.includes('≤') || range.includes('<')) return `0 → ${numbers[0]}`
    if (range.includes('≥') || range.includes('>')) return `${numbers[0]} → ${numbers[0] * 2}`
    return String(numbers[0])
  }
  const [lo, hi] = numbers.length >= 2 ? [Math.min(...numbers), Math.max(...numbers)] : [numbers[0], numbers[0]]
  const span = hi - lo
  return `${lo} · ${(lo + span * 0.25).toFixed(1)} · ${(lo + span * 0.5).toFixed(1)} · ${(lo + span * 0.75).toFixed(1)} · ${hi}`
}

// ---- Regulator view: compliance gap matrix ----
function renderRegulator() {
  const wrap = el('div', { class: 'regulator-view' })
  wrap.appendChild(el('p', { class: 'view-intro' }, '合规对照：标准定义的全部元素 vs 厂家本份声明覆盖范围。红色为标准要求但厂家未声明的元素 (gap)。'))

  const declared = new Set(currentDoc.elements.map(e => e.element_id))
  let totalCount = 0, declaredCount = 0
  const groups = []

  for (const cat of currentCatalog.categories) {
    const allEls = cat.elements
    const inDoc = allEls.filter(el => declared.has(el.id))
    const missing = allEls.filter(el => !declared.has(el.id))
    totalCount += allEls.length
    declaredCount += inDoc.length
    groups.push({ cat, total: allEls.length, declared: inDoc.length, missing })
  }

  const overall = el('div', { class: 'compliance-overall' }, [
    el('div', { class: 'stat-box' }, [el('strong', {}, `${declaredCount} / ${totalCount}`), el('span', {}, '元素声明覆盖率')]),
    el('div', { class: 'stat-box' }, [el('strong', {}, `${(100 * declaredCount / totalCount).toFixed(1)}%`), el('span', {}, '覆盖比例')]),
    el('div', { class: 'stat-box' }, [el('strong', {}, String(currentDoc.associations?.length || 0)), el('span', {}, '关联关系约束')])
  ])
  wrap.appendChild(overall)

  for (const g of groups) {
    const block = el('div', { class: 'cat-block' })
    const ratio = `${g.declared} / ${g.total}`
    block.appendChild(el('h2', { class: 'cat-title' }, [g.cat.name_zh, el('span', { class: 'cat-ratio' }, ratio)]))
    if (g.missing.length === 0) {
      block.appendChild(el('p', { class: 'compliance-clean' }, '✓ 该类别下所有元素均已声明'))
    } else {
      block.appendChild(el('p', { class: 'compliance-gap-label' }, `未声明的元素 (${g.missing.length})：`))
      const list = el('ul', { class: 'gap-list' })
      for (const m of g.missing) {
        list.appendChild(el('li', {}, [
          el('span', { class: 'gap-name' }, m.name_zh),
          el('span', { class: 'gap-section' }, ' §' + m.spec_section)
        ]))
      }
      block.appendChild(list)
    }
    wrap.appendChild(block)
  }

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

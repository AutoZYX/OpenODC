import {
  loadCatalog, loadManifest, loadDocument,
  buildElementIndex, requirementLabel, adsLevelLabel, reviewStatusLabel,
  el, getQueryParam
} from './common.js'

const pickerGrid = document.getElementById('picker-grid')
const runBtn = document.getElementById('run-compare')
const resultEl = document.getElementById('compare-result')
const pickerEl = document.getElementById('compare-picker')

let catalog = null
let elementIndex = null
let manifest = null
let selected = new Set()

function renderPicker() {
  pickerGrid.innerHTML = ''
  for (const d of manifest.documents) {
    const card = el('label', { class: 'picker-card' + (selected.has(d.id) ? ' active' : '') })
    const cb = el('input', { type: 'checkbox', value: d.id })
    if (selected.has(d.id)) cb.checked = true
    cb.addEventListener('change', () => {
      if (cb.checked && selected.size >= 4) { cb.checked = false; alert('最多对比 4 个'); return }
      cb.checked ? selected.add(d.id) : selected.delete(d.id)
      runBtn.disabled = selected.size < 2
      renderPicker()
    })
    card.appendChild(cb)
    card.appendChild(el('div', { class: 'picker-card-info' }, [
      el('div', { class: 'picker-title' }, `${d.vendor} · ${d.model}`),
      el('div', { class: 'picker-sub' }, d.function_name),
      el('div', { class: 'picker-pills' }, [
        el('span', { class: `ads-pill ads-pill-l${d.ads_level}` }, adsLevelLabel(d.ads_level)),
        el('span', { class: `status-pill status-${d.review_status}` }, reviewStatusLabel(d.review_status))
      ])
    ]))
    pickerGrid.appendChild(card)
  }
}

async function runCompare() {
  pickerEl.style.display = 'none'
  resultEl.hidden = false
  resultEl.innerHTML = '<p class="loading">加载文档…</p>'
  const ids = [...selected]
  const docs = await Promise.all(ids.map(id => {
    const f = manifest.documents.find(d => d.id === id).file
    return loadDocument(f)
  }))
  renderDiff(docs)
}

function renderDiff(docs) {
  resultEl.innerHTML = ''
  const back = el('button', { class: 'btn-link', onclick: () => { pickerEl.style.display = ''; resultEl.hidden = true; selected.clear(); runBtn.disabled = true; renderPicker() } }, '← 重新选择')
  resultEl.appendChild(back)

  // For each catalog element, compute the cell value per document
  const allEls = catalog.categories.flatMap(c => c.elements.map(e => ({ ...e, _cat: c })))

  // Header
  const summary = el('div', { class: 'compare-summary' })
  for (const d of docs) {
    summary.appendChild(el('div', { class: 'compare-doc-header' }, [
      el('h3', {}, `${d.vendor} · ${d.model}`),
      el('p', {}, d.function_name),
      el('div', { class: 'doc-badges' }, [
        el('span', { class: `ads-pill ads-pill-l${d.ads_level}` }, adsLevelLabel(d.ads_level)),
        el('span', { class: `status-pill status-${d.metadata.review_status}` }, reviewStatusLabel(d.metadata.review_status))
      ])
    ]))
  }
  resultEl.appendChild(summary)

  // For each category render a diff table
  for (const cat of catalog.categories) {
    // Determine if any doc declares anything from this category
    const anyDeclared = cat.elements.some(e => docs.some(d => d.elements.find(x => x.element_id === e.id)))
    if (!anyDeclared) continue

    const block = el('div', { class: 'cat-block' })
    block.appendChild(el('h2', { class: 'cat-title' }, cat.name_zh))

    const table = el('table', { class: 'odc-table compare-table' })
    const thead = el('thead')
    const headRow = el('tr', {}, [el('th', {}, '元素')])
    for (const d of docs) headRow.appendChild(el('th', {}, `${d.vendor} ${d.model}`))
    thead.appendChild(headRow)
    table.appendChild(thead)

    const tbody = el('tbody')
    for (const e of cat.elements) {
      const cellsValues = docs.map(d => d.elements.find(x => x.element_id === e.id))
      // Skip rows where no document mentions this element
      if (!cellsValues.some(v => v)) continue

      // Determine consensus
      const reqs = cellsValues.map(v => v?.requirement)
      const allSame = reqs.every(r => r === reqs[0]) && reqs[0] != null
      const allMissing = reqs.every(r => r == null)
      let rowClass = 'compare-row '
      if (allMissing) rowClass += 'compare-row-missing'
      else if (allSame) rowClass += `compare-row-agree compare-row-${reqs[0]}`
      else rowClass += 'compare-row-disagree'

      const row = el('tr', { class: rowClass })
      row.appendChild(el('td', {}, [
        el('div', { class: 'el-name' }, e.name_zh),
        el('div', { class: 'el-section' }, '§' + e.spec_section)
      ]))
      for (const v of cellsValues) {
        if (!v) row.appendChild(el('td', { class: 'compare-cell compare-cell-missing' }, '—'))
        else {
          const cell = el('td', { class: `compare-cell req-${v.requirement}` }, [
            el('span', { class: 'compare-req' }, requirementLabel(v.requirement)),
            v.parameter_range ? el('div', { class: 'param-range' }, v.parameter_range) : null
          ])
          row.appendChild(cell)
        }
      }
      tbody.appendChild(row)
    }
    table.appendChild(tbody)
    block.appendChild(table)
    resultEl.appendChild(block)
  }
}

;(async () => {
  try {
    [catalog, manifest] = await Promise.all([loadCatalog(), loadManifest()])
    elementIndex = buildElementIndex(catalog)

    // Optional: pre-select via ?ids=A,B,C
    const ids = getQueryParam('ids')
    if (ids) ids.split(',').forEach(id => selected.add(id))

    renderPicker()
    runBtn.disabled = selected.size < 2
    runBtn.addEventListener('click', runCompare)
    if (selected.size >= 2) runCompare()
  } catch (e) {
    pickerGrid.innerHTML = `<p class="error">加载失败：${e.message}</p>`
  }
})()

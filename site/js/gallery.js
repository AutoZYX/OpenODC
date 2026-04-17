import { loadManifest, adsLevelLabel, reviewStatusLabel, el } from './common.js'

const grid = document.getElementById('gallery-grid')
const filterLevel = document.getElementById('filter-level')
const filterStatus = document.getElementById('filter-status')
const filterSearch = document.getElementById('filter-search')
const filterCount = document.getElementById('filter-count')
const emptyCta = document.getElementById('empty-cta')

let allDocs = []

function applyFilters() {
  const level = filterLevel.value
  const status = filterStatus.value
  const q = filterSearch.value.trim().toLowerCase()
  const filtered = allDocs.filter(d => {
    if (level !== '' && String(d.ads_level) !== level) return false
    if (status !== '' && d.review_status !== status) return false
    if (q) {
      const haystack = [d.vendor, d.vendor_en, d.model, d.model_en, d.function_name, d.function_name_en].filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })
  render(filtered)
}

function render(docs) {
  grid.innerHTML = ''
  filterCount.textContent = `${docs.length} / ${allDocs.length} 条记录`
  emptyCta.hidden = docs.length > 0
  for (const d of docs) {
    grid.appendChild(card(d))
  }
}

function card(d) {
  const node = el('a', { href: `/view.html?id=${encodeURIComponent(d.id)}`, class: 'doc-card' })
  node.appendChild(el('div', { class: 'doc-card-header' }, [
    el('span', { class: `ads-pill ads-pill-l${d.ads_level}` }, adsLevelLabel(d.ads_level)),
    el('span', { class: `status-pill status-${d.review_status}` }, reviewStatusLabel(d.review_status))
  ]))
  node.appendChild(el('h3', { class: 'doc-card-title' }, d.vendor + ' · ' + d.model))
  node.appendChild(el('p', { class: 'doc-card-function' }, d.function_name))
  node.appendChild(el('div', { class: 'doc-card-stats' }, [
    el('span', { class: 'stat-item stat-permitted' }, `允许 ${d.permitted_count}`),
    el('span', { class: 'stat-item stat-not-permitted' }, `不允许 ${d.not_permitted_count}`),
    el('span', { class: 'stat-item' }, `共 ${d.element_count} 项`)
  ]))
  node.appendChild(el('p', { class: 'doc-card-meta' }, d.effective_date + (d.software_version ? ' · ' + d.software_version : '')))
  return node
}

;(async () => {
  try {
    const manifest = await loadManifest()
    allDocs = manifest.documents
    applyFilters()
    filterLevel.addEventListener('change', applyFilters)
    filterStatus.addEventListener('change', applyFilters)
    filterSearch.addEventListener('input', applyFilters)
  } catch (e) {
    grid.innerHTML = `<p class="error">加载失败：${e.message}</p>`
  }
})()

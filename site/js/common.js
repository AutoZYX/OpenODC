// common.js — shared utilities for OpenODC pages

export const SPEC_REFERENCE = 'GB/T 45312-2025'

export async function loadCatalog() {
  const r = await fetch('/data/catalog.json')
  if (!r.ok) throw new Error(`Failed to load catalog: ${r.status}`)
  return await r.json()
}

export async function loadManifest() {
  const r = await fetch('/data/manifest.json')
  if (!r.ok) throw new Error(`Failed to load manifest: ${r.status}`)
  return await r.json()
}

export async function loadDocument(file) {
  const r = await fetch('/' + file)
  if (!r.ok) throw new Error(`Failed to load document ${file}: ${r.status}`)
  return await r.json()
}

// Combine all catalog elements into a flat lookup by element_id
export function buildElementIndex(catalog) {
  const index = new Map()
  for (const cat of catalog.categories) {
    for (const el of cat.elements) {
      index.set(el.id, { ...el, category_id: cat.category_id, category_name_zh: cat.name_zh, category_name_en: cat.name_en })
    }
  }
  return index
}

// Group document elements by their second-level category
export function groupByCategory(doc, elementIndex) {
  const groups = new Map()
  for (const el of doc.elements) {
    const meta = elementIndex.get(el.element_id)
    if (!meta) continue
    const key = meta.category_id
    if (!groups.has(key)) {
      groups.set(key, { name_zh: meta.category_name_zh, name_en: meta.category_name_en, elements: [] })
    }
    groups.get(key).elements.push({ ...el, _meta: meta })
  }
  return groups
}

export function adsLevelLabel(level) {
  return `L${level}`
}

export function reviewStatusLabel(status, lang = 'zh') {
  const map = {
    zh: { draft: '草稿', community_reviewed: '社区审核', vendor_confirmed: '厂家确认' },
    en: { draft: 'Draft', community_reviewed: 'Community-reviewed', vendor_confirmed: 'Vendor-confirmed' }
  }
  return map[lang][status] || status
}

export function requirementLabel(req, lang = 'zh') {
  if (lang === 'zh') return req === 'permitted' ? '允许' : '不允许'
  return req === 'permitted' ? 'Permitted' : 'Not permitted'
}

export function exitBehaviorLabel(b, lang = 'zh') {
  if (!b) return ''
  const map = {
    zh: {
      suppress_activation: '抑制激活',
      trigger_exit: '触发退出',
      suppress_and_exit: '抑制激活并触发退出'
    },
    en: {
      suppress_activation: 'Suppress activation',
      trigger_exit: 'Trigger exit',
      suppress_and_exit: 'Suppress and exit'
    }
  }
  return map[lang][b] || b
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v
    else if (k === 'html') node.innerHTML = v
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v)
    else node.setAttribute(k, v)
  }
  for (const c of [].concat(children)) {
    if (c == null) continue
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)
  }
  return node
}

export function downloadBlob(content, filename, mime = 'application/json') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name)
}

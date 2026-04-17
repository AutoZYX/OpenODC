// build-manifest.mjs
// Scans data/examples/*.json and produces site/data/manifest.json
// listing every available ODC document with its display metadata.

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')
const examplesDir = join(repoRoot, 'data', 'examples')
const outManifestPath = join(repoRoot, 'site', 'data', 'manifest.json')
const outCatalogPath = join(repoRoot, 'site', 'data', 'catalog.json')

// 1. Build manifest of example documents
const files = readdirSync(examplesDir).filter(f => f.endsWith('.json'))
const documents = files.map(f => {
  const doc = JSON.parse(readFileSync(join(examplesDir, f), 'utf8'))
  return {
    id: doc.id,
    file: `data/examples/${f}`,
    vendor: doc.vendor,
    vendor_en: doc.vendor_en || null,
    model: doc.model,
    model_en: doc.model_en || null,
    function_name: doc.function_name,
    function_name_en: doc.function_name_en || null,
    ads_level: doc.ads_level,
    software_version: doc.software_version || null,
    effective_date: doc.effective_date,
    review_status: doc.metadata?.review_status || 'draft',
    element_count: (doc.elements || []).length,
    permitted_count: (doc.elements || []).filter(e => e.requirement === 'permitted').length,
    not_permitted_count: (doc.elements || []).filter(e => e.requirement === 'not_permitted').length
  }
})

mkdirSync(dirname(outManifestPath), { recursive: true })
writeFileSync(outManifestPath, JSON.stringify({
  spec_source: 'GB/T 45312-2025',
  generated_at: new Date().toISOString(),
  count: documents.length,
  documents
}, null, 2))

console.log(`Wrote manifest: ${documents.length} documents`)

// 2. Build merged catalog: combine all categories/*.json into a single tree-friendly file
// Order matches the standard's logical structure (§6.2.1 → §6.2.5, §6.3, §6.4)
const categoriesDir = join(repoRoot, 'schema', 'categories')
const categoryOrder = [
  'odd_road.json',
  'odd_road_infrastructure.json',
  'odd_targets.json',
  'odd_weather.json',
  'odd_digital_info.json',
  'personnel_state.json',
  'vehicle_state.json'
]
const allCategoryFiles = readdirSync(categoriesDir).filter(f => f.endsWith('.json'))
const categoryFiles = categoryOrder.filter(f => allCategoryFiles.includes(f))
  .concat(allCategoryFiles.filter(f => !categoryOrder.includes(f)))
const categories = categoryFiles.map(f => JSON.parse(readFileSync(join(categoriesDir, f), 'utf8')))

const enums = JSON.parse(readFileSync(join(repoRoot, 'schema', 'enums', 'quantitative_scales.json'), 'utf8'))

writeFileSync(outCatalogPath, JSON.stringify({
  spec_source: 'GB/T 45312-2025',
  generated_at: new Date().toISOString(),
  categories,
  enums: enums.enums
}, null, 2))

console.log(`Wrote catalog: ${categories.length} categories, ${categories.reduce((n, c) => n + c.elements.length, 0)} elements`)

// check-references.mjs
// Verifies every element_id in data/examples/*.json refers to an element
// that exists in schema/categories/*.json. Used by CI.

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')

const catalogIds = new Set()
for (const f of readdirSync(join(repoRoot, 'schema', 'categories')).filter(f => f.endsWith('.json'))) {
  const cat = JSON.parse(readFileSync(join(repoRoot, 'schema', 'categories', f), 'utf8'))
  for (const el of cat.elements) catalogIds.add(el.id)
}

console.log(`Catalog has ${catalogIds.size} elements.`)

let problems = 0
for (const f of readdirSync(join(repoRoot, 'data', 'examples')).filter(f => f.endsWith('.json'))) {
  const doc = JSON.parse(readFileSync(join(repoRoot, 'data', 'examples', f), 'utf8'))
  for (const e of doc.elements || []) {
    if (!catalogIds.has(e.element_id)) {
      console.error(`  ✗ ${f}: unknown element_id "${e.element_id}"`)
      problems++
    }
  }
  for (const a of doc.associations || []) {
    if (!catalogIds.has(a.primary_id)) {
      console.error(`  ✗ ${f}: unknown association primary_id "${a.primary_id}"`)
      problems++
    }
    if (!catalogIds.has(a.dependent_id)) {
      console.error(`  ✗ ${f}: unknown association dependent_id "${a.dependent_id}"`)
      problems++
    }
  }
}

if (problems === 0) {
  console.log('All element_id references resolve to catalog entries. ✓')
  process.exit(0)
} else {
  console.error(`\n${problems} reference problem(s) found.`)
  process.exit(1)
}

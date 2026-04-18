// apply-upgrades.mjs
// Batch-apply description/parameter_range upgrades to an ODC JSON file.
// Usage: node tools/apply-upgrades.mjs <sample.json> <upgrades.json>
//
// upgrades.json format:
// {
//   "odd.road.geometry.plane.curve": {
//     "description": "new desc",                 // optional
//     "parameter_range": "new range",            // optional
//     "requirement": "permitted",                // optional
//     "exit_behavior": null                      // optional
//   },
//   ...
// }

import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')

const target = process.argv[2]
const upgradeFile = process.argv[3]
if (!target || !upgradeFile) {
  console.error('Usage: node tools/apply-upgrades.mjs <sample.json> <upgrades.json>')
  process.exit(1)
}

const targetPath = join(repoRoot, target)
const upgradePath = join(repoRoot, upgradeFile)
const doc = JSON.parse(readFileSync(targetPath, 'utf8'))
const upgrades = JSON.parse(readFileSync(upgradePath, 'utf8'))

let applied = 0, missing = []
for (const e of doc.elements) {
  const up = upgrades[e.element_id]
  if (!up) continue
  if (up.description !== undefined) { e.description = up.description; if (up.description === null) delete e.description }
  if (up.parameter_range !== undefined) { e.parameter_range = up.parameter_range; if (up.parameter_range === null) delete e.parameter_range }
  if (up.requirement !== undefined) e.requirement = up.requirement
  if (up.exit_behavior !== undefined) {
    if (up.exit_behavior === null) delete e.exit_behavior
    else e.exit_behavior = up.exit_behavior
  }
  applied++
}
for (const id of Object.keys(upgrades)) {
  if (!doc.elements.find(e => e.element_id === id)) missing.push(id)
}

writeFileSync(targetPath, JSON.stringify(doc, null, 2) + '\n', 'utf8')
console.log(`${target}: applied ${applied} / ${Object.keys(upgrades).length} upgrades`)
if (missing.length) console.log('  missing element_ids:', missing)

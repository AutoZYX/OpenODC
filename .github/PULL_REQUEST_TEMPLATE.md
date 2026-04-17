<!--
Thank you for contributing to OpenODC.

Please pick the appropriate section below and delete the rest.
-->

## Type of contribution

- [ ] New ODC sample document (`data/examples/<id>.json`)
- [ ] Vendor-confirmed override of existing community-extracted record
- [ ] Schema improvement (adds international standard mapping, fixes hierarchy, etc.)
- [ ] Site / UI / docs improvement

---

### A. Submitting a new ODC sample

**Vehicle / function:** _e.g. BYD Han 2026 — DiPilot Highway_
**Automation level (per GB/T 40429-2021):** _L0 / L1 / L2 / L3 / L4 / L5_
**Source(s):** _list URLs of car owner's manual, type-approval filing, third-party test report, etc._
**Confidence:** _high / medium / low_

Checklist:

- [ ] File is at `data/examples/<vendor>-<model>-<function>.json` with a unique slug `id`
- [ ] All `element_id` values exist in `schema/categories/*.json`
- [ ] Every `requirement: "not_permitted"` element has an `exit_behavior`
- [ ] `metadata.review_status` is set honestly (`draft`, `community_reviewed`, `vendor_confirmed`)
- [ ] `metadata.sources` lists every reference that backs the data
- [ ] `npx ajv-cli validate -s schema/odc.schema.json -d data/examples/<your-file>.json` passes locally

### B. Vendor-confirmed override

If you represent the OEM:

- [ ] You have authority to publish this ODC declaration
- [ ] PR description states your role and contact (Name, Title, Vendor)
- [ ] `metadata.review_status: "vendor_confirmed"`

### C. Schema / docs / site changes

- [ ] Describe the change and why
- [ ] If schema changes, the change is backward-compatible OR the version is bumped

---

By submitting this PR you agree that:
- Code contributions are licensed under [Apache-2.0](../LICENSE)
- Data contributions are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

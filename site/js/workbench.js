// workbench.js — Vendor Workbench MVP (localStorage-backed, no backend)
//
// Data model (localStorage key: "openodc.workbench.v1"):
// {
//   "<vendor_id>": {
//     functions: [
//       { id, name, model, ads_level, status, updated_at, manual_url, notes }
//     ]
//   }
// }
// status: in_development | pre_release | shipped | published

const STORAGE_KEY = 'openodc.workbench.v1'

const VENDOR_LABELS = {
  tesla: '特斯拉', huawei: '华为', baidu: '百度 Apollo', byd: '比亚迪',
  nio: '蔚来', xpeng: '小鹏', li: '理想', zhuoyu: '卓驭科技',
  horizon: '地平线', momenta: 'Momenta', other: '其他 / Tier 1'
}

const STATUS_META = {
  in_development: { label: '在研', color: '#8a6e1d', bg: '#f4ead3' },
  pre_release: { label: '预发布', color: '#c85a3a', bg: '#fbe4dc' },
  shipped: { label: '已上市', color: '#2d6a3a', bg: '#d4e6d4' },
  published: { label: '已公开', color: '#5a7a8e', bg: '#dae7f0' }
}

const DEMO_SEEDS = {
  tesla: [
    { id: 'tesla-fsd-v14', name: 'FSD Supervised v14（内测）', model: 'Model Y HW5', ads_level: 2, status: 'in_development', updated_at: '2026-03-12T08:00:00Z', manual_url: '', notes: '下一代 HW5 平台验证中，尚未对外。' },
    { id: 'tesla-fsd-v13', name: 'FSD Supervised v13', model: 'Model 3/Y/S/X HW3/HW4', ads_level: 2, status: 'shipped', updated_at: '2025-01-01T00:00:00Z', manual_url: 'https://www.tesla.com/ownersmanual/modely/en_us/', notes: '已于 2024-12 OTA 至所有 HW3/HW4 车主。对应 OpenODC 公开样例。', public_id: 'tesla-fsd-us-v13' },
    { id: 'tesla-ap-china', name: '基础 Autopilot（中国）', model: 'Model 3/Y 中国标配', ads_level: 2, status: 'shipped', updated_at: '2025-01-01T00:00:00Z', manual_url: 'https://www.tesla.cn/ownersmanual/modely/zh_cn_us/', notes: '中国标配，不含 FSD。', public_id: 'tesla-autopilot-china-basic' },
    { id: 'tesla-summon', name: 'Actually Smart Summon', model: 'Model Y HW4', ads_level: 2, status: 'pre_release', updated_at: '2026-02-15T00:00:00Z', manual_url: '', notes: '停车场召唤，限定软件版本灰度中。' }
  ],
  huawei: [
    { id: 'huawei-ads4-ultra', name: 'ADS 4 Ultra（高速 L3）', model: '尊界 S800 / 岚图泰山 Ultra', ads_level: 3, status: 'shipped', updated_at: '2025-04-22T00:00:00Z', manual_url: '', notes: '中国首个量产高速 L3 方案；工信部首批试点速度上限 50–80 km/h。' },
    { id: 'huawei-ads4-max', name: 'ADS 4 Max（高阶版）', model: '问界 M9 / M8 / 享界 S9 等', ads_level: 2, status: 'shipped', updated_at: '2025-04-22T00:00:00Z', manual_url: 'https://aito.auto/dam/content/dam/aito/cn/service/pdf/m9-2025-ev-product-manual-20260317.pdf', notes: 'Max 档主流配置，已对应 OpenODC 公开样例。', public_id: 'huawei-ads4-aito-m9' },
    { id: 'huawei-ads4-pro', name: 'ADS 4 Pro（增强版）', model: '问界 M7 Pro+ / 深蓝 S07 激光版 / 阿维塔 06 Pro', ads_level: 2, status: 'shipped', updated_at: '2025-06-01T00:00:00Z', manual_url: '', notes: '轻图 NCA + 城区辅助，L2+。' },
    { id: 'huawei-ads4-se', name: 'ADS 4 SE（基础版）', model: '深蓝 L07 / 尚界 H5 Pro 等', ads_level: 2, status: 'shipped', updated_at: '2025-08-01T00:00:00Z', manual_url: '', notes: '无激光雷达，L2 入门档。' },
    { id: 'huawei-ads5', name: 'ADS 5（在研）', model: 'TBD', ads_level: 3, status: 'in_development', updated_at: '2026-04-01T00:00:00Z', manual_url: '', notes: '面向 2026-2027 的下一代，规划含城区 L3。' }
  ],
  baidu: [
    { id: 'apollo-go-wuhan', name: '萝卜快跑（武汉示范运营）', model: 'Apollo RT6 / 颐驰 06', ads_level: 4, status: 'shipped', updated_at: '2024-07-01T00:00:00Z', manual_url: 'https://www.apollogo.com/ch/', notes: '武汉经开区 3000 km² 围栏内全无人运营；已对应 OpenODC 公开样例。', public_id: 'baidu-apollogo-wuhan' },
    { id: 'apollo-go-beijing', name: '萝卜快跑（北京亦庄）', model: 'Apollo RT6', ads_level: 4, status: 'shipped', updated_at: '2024-11-01T00:00:00Z', manual_url: 'https://www.apollogo.com/ch/', notes: '北京经开区运营区。' },
    { id: 'apollo-go-shenzhen', name: '萝卜快跑（深圳）', model: 'Apollo RT6', ads_level: 4, status: 'pre_release', updated_at: '2026-01-15T00:00:00Z', manual_url: '', notes: '已拿到示范运营许可，商业化运营准备中。' },
    { id: 'apollo-rt7', name: 'RT7（下一代平台）', model: 'RT7', ads_level: 4, status: 'in_development', updated_at: '2026-03-01T00:00:00Z', manual_url: '', notes: '传感器架构简化 + 成本下降 30%，规划 2027 交付。' }
  ]
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function ensureVendor(state, vendorId) {
  if (!state[vendorId]) {
    state[vendorId] = {
      functions: (DEMO_SEEDS[vendorId] || []).map(f => ({ ...f }))
    }
    saveState(state)
  }
  return state[vendorId]
}

function formatDate(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toISOString().slice(0, 10)
  } catch { return '—' }
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v
    else if (k === 'html') node.innerHTML = v
    else node.setAttribute(k, v)
  }
  const arr = Array.isArray(children) ? children : [children]
  for (const c of arr) {
    if (c == null) continue
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)
  }
  return node
}

function renderDashboard(vendorId) {
  const body = document.getElementById('workbench-body')
  body.innerHTML = ''
  if (!vendorId) {
    body.appendChild(el('div', { class: 'workbench-empty' }, '请先选择厂家身份。'))
    return
  }

  const state = loadState()
  const vendor = ensureVendor(state, vendorId)
  const label = VENDOR_LABELS[vendorId] || vendorId

  // Summary row
  const summary = el('div', { class: 'workbench-summary' })
  const counts = { in_development: 0, pre_release: 0, shipped: 0, published: 0 }
  for (const f of vendor.functions) {
    if (counts[f.status] != null) counts[f.status]++
    if (f.public_id) counts.published++
  }
  summary.appendChild(el('h2', { class: 'workbench-vendor-name' }, `${label} — ODC 功能清单`))
  const pillRow = el('div', { class: 'workbench-pill-row' })
  for (const [status, n] of Object.entries(counts)) {
    const meta = status === 'published'
      ? { label: '已公开', color: STATUS_META.published.color, bg: STATUS_META.published.bg }
      : STATUS_META[status]
    const pill = el('span', { class: 'workbench-pill', style: `color:${meta.color};background:${meta.bg}` }, `${meta.label} · ${n}`)
    pillRow.appendChild(pill)
  }
  summary.appendChild(pillRow)
  body.appendChild(summary)

  // Action bar
  const actionBar = el('div', { class: 'workbench-action-bar' })
  const newBtn = el('button', { class: 'btn btn-primary', id: 'new-fn-btn' }, '+ 新建功能')
  newBtn.addEventListener('click', () => newFunction(vendorId))
  actionBar.appendChild(newBtn)
  const resetBtn = el('button', { class: 'btn btn-ghost', id: 'reset-btn' }, '重置为演示数据')
  resetBtn.addEventListener('click', () => {
    if (confirm(`重置 ${label} 的数据为演示种子？（会覆盖本地修改）`)) {
      delete state[vendorId]
      saveState(state)
      renderDashboard(vendorId)
    }
  })
  actionBar.appendChild(resetBtn)
  body.appendChild(actionBar)

  // Function table
  if (vendor.functions.length === 0) {
    body.appendChild(el('div', { class: 'workbench-empty' }, '暂无功能记录。点击「新建功能」开始管理。'))
    return
  }

  const table = el('table', { class: 'workbench-table' })
  table.appendChild(el('thead', {}, el('tr', {}, [
    el('th', {}, '功能名称'),
    el('th', {}, '车型'),
    el('th', {}, '等级'),
    el('th', {}, '状态'),
    el('th', {}, '官方手册'),
    el('th', {}, '更新时间'),
    el('th', {}, '操作')
  ])))
  const tbody = el('tbody')
  for (const fn of vendor.functions) {
    const tr = el('tr')
    tr.appendChild(el('td', { class: 'fn-name-cell' }, [
      el('div', { class: 'fn-name' }, fn.name),
      fn.notes ? el('div', { class: 'fn-notes' }, fn.notes) : null
    ]))
    tr.appendChild(el('td', {}, fn.model || '—'))
    tr.appendChild(el('td', {}, `L${fn.ads_level}`))
    const statusMeta = STATUS_META[fn.status] || { label: fn.status, color: '#666', bg: '#eee' }
    tr.appendChild(el('td', {}, [
      el('span', { class: 'fn-status-pill', style: `color:${statusMeta.color};background:${statusMeta.bg}` }, statusMeta.label),
      fn.public_id ? el('span', { class: 'fn-published', title: `OpenODC 样例 ID: ${fn.public_id}` }, ' · 已公开 ✓') : null
    ]))
    const manualCell = el('td', {})
    if (fn.manual_url) {
      const a = el('a', { href: fn.manual_url, target: '_blank', rel: 'noopener' }, '打开手册 →')
      manualCell.appendChild(a)
    } else manualCell.appendChild(el('span', { class: 'text-mute' }, '未设置'))
    tr.appendChild(manualCell)
    tr.appendChild(el('td', {}, formatDate(fn.updated_at)))

    const actionsCell = el('td', { class: 'fn-actions' })
    const editBtn = el('button', { class: 'btn-mini' }, '编辑 ODC')
    editBtn.addEventListener('click', () => openEditor(vendorId, fn))
    actionsCell.appendChild(editBtn)
    if (fn.status !== 'published' && !fn.public_id) {
      const pubBtn = el('button', { class: 'btn-mini btn-accent' }, '发布到公开库')
      pubBtn.addEventListener('click', () => publishFunction(vendorId, fn))
      actionsCell.appendChild(pubBtn)
    }
    const delBtn = el('button', { class: 'btn-mini btn-danger' }, '删除')
    delBtn.addEventListener('click', () => deleteFunction(vendorId, fn))
    actionsCell.appendChild(delBtn)
    tr.appendChild(actionsCell)
    tbody.appendChild(tr)
  }
  table.appendChild(tbody)
  body.appendChild(table)
}

function newFunction(vendorId) {
  const name = prompt('功能名称（例：FSD v14 / 高速 NCA 3.0）')
  if (!name) return
  const model = prompt('适用车型（可留空）') || ''
  const ads_level = parseInt(prompt('ADS 等级 (1-4)', '2') || '2', 10)
  const state = loadState()
  const vendor = ensureVendor(state, vendorId)
  vendor.functions.push({
    id: 'new-' + Date.now(),
    name, model, ads_level,
    status: 'in_development',
    updated_at: new Date().toISOString(),
    manual_url: '', notes: ''
  })
  saveState(state)
  renderDashboard(vendorId)
}

function openEditor(vendorId, fn) {
  const params = new URLSearchParams()
  if (fn.public_id) {
    // Has a published sample — load it as the starting point
    params.set('load', fn.public_id)
  }
  params.set('workbench_vendor', vendorId)
  params.set('workbench_fn', fn.id)
  if (fn.name) params.set('wb_fn_name', encodeURIComponent(fn.name))
  if (fn.model) params.set('wb_model', encodeURIComponent(fn.model))
  if (fn.ads_level) params.set('wb_level', String(fn.ads_level))
  params.set('wb_vendor_name', encodeURIComponent(VENDOR_LABELS[vendorId] || vendorId))
  window.location.href = '/editor.html?' + params.toString()
}

function publishFunction(vendorId, fn) {
  if (fn.status !== 'shipped') {
    if (!confirm(`当前状态为「${STATUS_META[fn.status]?.label}」，不是「已上市」。\n\n真正的 SOP 流程会要求：已上市 + 版本冻结 + 内部审批。\n\n继续演示发布吗？`)) return
  }
  const template = `# 请求将 ${VENDOR_LABELS[vendorId]} · ${fn.name} 公开到 OpenODC

**厂家**：${VENDOR_LABELS[vendorId]}
**功能**：${fn.name}
**车型**：${fn.model}
**ADS 等级**：L${fn.ads_level}
**官方手册**：${fn.manual_url || '（未设置）'}
**备注**：${fn.notes || '（无）'}

此 ODC 已达到 SOP 要求，脱敏后提交至公开样例库。

---
由 OpenODC 厂家直填工作台生成 · ${new Date().toISOString()}
`
  if (navigator.clipboard) {
    navigator.clipboard.writeText(template).then(() => {
      alert('[演示] PR 模板已复制到剪贴板\n\n正式版本将直接：\n• 生成脱敏后的 ODC JSON\n• 自动创建 GitHub PR 到 AutoZYX/OpenODC\n• 邮件通知维护者审核\n\n现在可以手动粘贴到 GitHub 新建 PR 页面。')
    })
  } else {
    prompt('复制以下内容到 GitHub PR 描述：', template)
  }
  const state = loadState()
  const vendor = ensureVendor(state, vendorId)
  const rec = vendor.functions.find(x => x.id === fn.id)
  if (rec) {
    rec.status = 'published'
    rec.updated_at = new Date().toISOString()
    saveState(state)
    renderDashboard(vendorId)
  }
}

function deleteFunction(vendorId, fn) {
  if (!confirm(`删除 ${fn.name}？此操作不可撤销（localStorage 演示）。`)) return
  const state = loadState()
  const vendor = ensureVendor(state, vendorId)
  vendor.functions = vendor.functions.filter(x => x.id !== fn.id)
  saveState(state)
  renderDashboard(vendorId)
}

// Wire up
const vendorSelect = document.getElementById('vendor-select')
vendorSelect.addEventListener('change', () => renderDashboard(vendorSelect.value))

// Restore last choice from session
const last = sessionStorage.getItem('workbench.vendor')
if (last) {
  vendorSelect.value = last
  renderDashboard(last)
}
vendorSelect.addEventListener('change', () => {
  sessionStorage.setItem('workbench.vendor', vendorSelect.value)
})

/* ================= FinSight 个人理财仪表盘 =================
   纯前端 + localStorage。无弹窗、无 alert/prompt/confirm，所有操作内联反馈。 */
'use strict';

/* ---------- 状态 ---------- */
const EXPENSE_CATS = [
  { name: '餐饮', emoji: '🍜' }, { name: '交通', emoji: '🚌' }, { name: '购物', emoji: '🛍️' },
  { name: '娱乐', emoji: '🎮' }, { name: '住房', emoji: '🏠' }, { name: '水电', emoji: '💡' },
  { name: '教育', emoji: '📚' }, { name: '其他', emoji: '📦' },
];
const INCOME_CATS = [
  { name: '工资', emoji: '💼' }, { name: '兼职', emoji: '🧑‍💻' }, { name: '其他', emoji: '💰' },
];
const LS_KEY = 'finsight_state_v1';

let state = { transactions: [], budgets: {} };
try {
  const raw = localStorage.getItem(LS_KEY);
  if (raw) { const parsed = JSON.parse(raw); if (parsed && Array.isArray(parsed.transactions)) state = parsed; }
} catch (e) { /* 数据损坏则用空状态 */ }

let currentMonth = todayStr().slice(0, 7);
let charts = {};

/* ---------- 工具 ---------- */
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmtMoney(n) {
  const v = Number(n) || 0;
  return '¥' + v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtMoney0(n) {
  const v = Number(n) || 0;
  return '¥' + v.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}
function $(id) { return document.getElementById(id); }
function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function monthLabel(ym) { return ym.slice(0, 4) + '年' + Number(ym.slice(5, 7)) + '月'; }

function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* 存储满时静默 */ } }

/* ---------- toast 反馈 ---------- */
let toastTimer = null;
function showToast(msg) {
  let t = $('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------- 表单错误提示（内联） ---------- */
function formError(inp, msg) {
  inp.classList.add('input-error');
  const field = inp.closest('.field');
  if (field) {
    let err = field.querySelector('.field-error');
    if (!err) { err = document.createElement('div'); err.className = 'field-error'; field.appendChild(err); }
    err.textContent = msg;
  }
  inp.focus();
}
function formClearError(inp) {
  inp.classList.remove('input-error');
  const field = inp.closest('.field');
  const err = field ? field.querySelector('.field-error') : null;
  if (err) err.remove();
}

/* ---------- 统计 ---------- */
function monthStats(ym) {
  const txs = state.transactions.filter(t => t.date && t.date.startsWith(ym));
  let income = 0, expense = 0;
  for (const t of txs) { if (t.type === 'income') income += Number(t.amount) || 0; else expense += Number(t.amount) || 0; }
  return { income, expense, net: income - expense, count: txs.length };
}

/* ---------- 视图切换 ---------- */
function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  const v = document.getElementById('view-' + name);
  if (v) v.classList.add('active');
  if (name === 'dashboard') renderDashboard();
  if (name === 'transactions') { fillCategorySelect(); renderTxTable(); }
  if (name === 'budget') renderBudget();
}

/* ================= 总览 ================= */
function renderDashboard() {
  const s = monthStats(currentMonth);
  $('kpiIncome').textContent = fmtMoney(s.income);
  $('kpiExpense').textContent = fmtMoney(s.expense);
  $('kpiNet').textContent = fmtMoney(s.net);

  const bKeys = Object.keys(state.budgets);
  const bTotal = bKeys.reduce((a, k) => a + (Number(state.budgets[k]) || 0), 0);
  if (bTotal > 0) {
    const spent = Object.keys(state.budgets).reduce((a, k) => {
      const cat = state.budgets[k];
      const spentCat = state.transactions.filter(t => t.type === 'expense' && t.date && t.date.startsWith(currentMonth) && t.category === k)
        .reduce((x, t) => x + (Number(t.amount) || 0), 0);
      return a + Math.min(spentCat, cat);
    }, 0);
    $('kpiBudget').textContent = Math.round(spent / bTotal * 100) + '%';
  } else {
    $('kpiBudget').textContent = '未设置';
  }

  renderTrendChart();
  renderPieChart();
  renderRecentTx();
}
function renderTrendChart() {
  const labels = [], income = [], expense = [];
  for (let i = 5; i >= 0; i--) {
    const ym = shiftMonth(currentMonth, -i);
    labels.push(Number(ym.slice(5, 7)) + '月');
    const s = monthStats(ym);
    income.push(Math.round(s.income));
    expense.push(Math.round(s.expense));
  }
  const cfg = {
    type: 'line',
    data: { labels, datasets: [
      { label: '收入', data: income, borderColor: '#34d399', backgroundColor: 'rgba(52,211,153,.12)', tension: .35, fill: true, pointRadius: 3 },
      { label: '支出', data: expense, borderColor: '#fb7185', backgroundColor: 'rgba(251,113,133,.1)', tension: .35, fill: true, pointRadius: 3 },
    ] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#8b9ac2' } } },
      scales: {
        x: { ticks: { color: '#8b9ac2' }, grid: { color: 'rgba(36,50,82,.4)' } },
        y: { ticks: { color: '#8b9ac2' }, grid: { color: 'rgba(36,50,82,.4)' } },
      },
    },
  };
  if (charts.chartTrend) { charts.chartTrend.data = cfg.data; charts.chartTrend.update(); }
  else charts.chartTrend = new Chart($('trendChart'), cfg);
}
function renderPieChart() {
  const spent = {};
  for (const t of state.transactions) {
    if (t.type === 'expense' && t.date && t.date.startsWith(currentMonth)) spent[t.category] = (spent[t.category] || 0) + (Number(t.amount) || 0);
  }
  const entries = Object.entries(spent).sort((a, b) => b[1] - a[1]).slice(0, 7);
  const labels = entries.map(e => e[0]);
  const data = entries.map(e => Math.round(e[1]));
  const palette = ['#34d399', '#2dd4bf', '#fb7185', '#fbbf24', '#818cf8', '#f472b6', '#22d3ee'];
  const cfg = {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: palette.slice(0, data.length), borderWidth: 0 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: '#8b9ac2', boxWidth: 10 } },
      },
    },
  };
  if (charts.chartPie) { charts.chartPie.data = cfg.data; charts.chartPie.update(); }
  else charts.chartPie = new Chart($('pieChart'), cfg);
}
function renderRecentTx() {
  const recent = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 6);
  const box = $('recentTx');
  if (!recent.length) { box.innerHTML = '<div class="empty">还没有记录，去「记账」页记第一笔吧</div>'; return; }
  box.innerHTML = recent.map(t => {
    const cat = [...EXPENSE_CATS, ...INCOME_CATS].find(c => c.name === t.category);
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 2px;border-bottom:1px solid rgba(36,50,82,.5);font-size:13.5px;">
      <span>${cat ? cat.emoji : '📌'} ${esc(t.category)} <span class="muted">${esc(t.note || '')} · ${t.date}</span></span>
      <span class="${t.type === 'income' ? 'income' : 'expense'}" style="font-weight:700;">${t.type === 'income' ? '+' : '-'}${fmtMoney0(t.amount)}</span>
    </div>`;
  }).join('');
}

/* ================= 记账 ================= */
function fillCategorySelect() {
  const sel = $('txCategory');
  const type = document.querySelector('.seg-btn.active').dataset.txType;
  const cats = type === 'income' ? INCOME_CATS : EXPENSE_CATS;
  sel.innerHTML = cats.map(c => `<option value="${c.name}">${c.emoji} ${c.name}</option>`).join('');
}
function resetTxForm() {
  $('txAmount').value = '';
  $('txNote').value = '';
  $('txDate').value = todayStr();
  formClearError($('txAmount'));
  fillCategorySelect();
}
function saveTx() {
  const amount = parseFloat($('txAmount').value);
  const date = $('txDate').value;
  if (!(amount > 0)) { formError($('txAmount'), '请输入有效的金额（大于 0）'); return; }
  if (!date) { formError($('txDate'), '请选择日期'); return; }
  const type = document.querySelector('.seg-btn.active').dataset.txType;
  const category = $('txCategory').value;
  const note = $('txNote').value.trim();
  state.transactions.push({ id: uid(), type, amount, category, date, note, createdAt: Date.now() });
  save();
  showToast('已保存 ✓ 这笔已记入' + (type === 'income' ? '收入' : '支出'));
  resetTxForm();
  renderTxTable();
  renderBudget();
}
function renderTxTable() {
  const ft = $('filterType').value;
  const fc = $('filterCategory').value;
  let list = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  if (ft !== 'all') list = list.filter(t => t.type === ft);
  if (fc !== 'all') list = list.filter(t => t.category === fc);
  $('txCount').textContent = list.length ? `（${list.length} 笔）` : '';
  const body = $('txTableBody');
  if (!list.length) {
    body.innerHTML = `<tr><td colspan="6" class="empty">暂无记录，在上方「记一笔」填写并保存</td></tr>`;
    return;
  }
  body.innerHTML = list.map(t => {
    const cat = [...EXPENSE_CATS, ...INCOME_CATS].find(c => c.name === t.category);
    return `<tr>
      <td>${esc(t.date)}</td>
      <td><span class="tag ${t.type}">${t.type === 'income' ? '收入' : '支出'}</span></td>
      <td>${cat ? cat.emoji : ''} ${esc(t.category)}</td>
      <td class="muted">${esc(t.note || '')}</td>
      <td class="r" style="font-weight:700;color:${t.type === 'income' ? 'var(--income)' : 'var(--expense)'};">${t.type === 'income' ? '+' : '-'}${fmtMoney(t.amount)}</td>
      <td class="r"><button class="mini-btn" data-del="${t.id}" title="删除">✕</button></td>
    </tr>`;
  }).join('');
  body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    state.transactions = state.transactions.filter(x => x.id !== b.dataset.del);
    save(); renderTxTable(); renderBudget(); showToast('已删除');
  });
}

/* ================= 预算 ================= */
function renderBudget() {
  $('budgetMonthLabel').textContent = '（' + monthLabel(currentMonth) + '）';
  const form = $('budgetForm');
  form.innerHTML = [...EXPENSE_CATS, ...INCOME_CATS].map(c => {
    const val = state.budgets[c.name] ?? '';
    return `<label class="field"><span>${c.emoji} ${c.name}</span>
      <input type="number" class="input budget-input" data-cat="${c.name}" min="0" step="1"
             placeholder="不设预算" value="${val}"></label>`;
  }).join('');

  const summary = $('budgetSummary');
  let html = '';
  let hasBudget = false;
  for (const c of EXPENSE_CATS) {
    const budget = Number(state.budgets[c.name]);
    if (!(budget > 0)) continue;
    hasBudget = true;
    const spent = state.transactions.filter(t => t.type === 'expense' && t.date && t.date.startsWith(currentMonth) && t.category === c.name)
      .reduce((a, t) => a + (Number(t.amount) || 0), 0);
    const pct = Math.min(100, spent / budget * 100);
    const over = spent > budget;
    html += `<div class="card">
      <div style="display:flex;justify-content:space-between;font-size:13px;">
        <span>${c.emoji} ${c.name}</span>
        <span style="color:${over ? 'var(--expense)' : 'var(--text)'};font-weight:700;">${fmtMoney0(spent)} / ${fmtMoney0(budget)}</span>
      </div>
      <div class="budget-bar"><div class="budget-fill ${over ? 'over' : ''}" style="width:${pct}%"></div></div>
    </div>`;
  }
  summary.innerHTML = hasBudget ? html : '<p class="muted">上方填写分类预算后点「保存预算」，这里会显示使用进度。</p>';
}
function saveBudget() {
  const next = {};
  document.querySelectorAll('.budget-input').forEach(inp => {
    const v = parseFloat(inp.value);
    if (v > 0) next[inp.dataset.cat] = v;
  });
  state.budgets = next;
  save();
  showToast('预算已保存 ✓');
  renderBudget();
  renderDashboard();
}

/* ================= 数据管理 ================= */
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'finsight-backup-' + todayStr() + '.json';
  a.click();
  showToast('已导出备份文件');
}
function importData(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed || !Array.isArray(parsed.transactions)) { showToast('导入失败：文件格式不正确'); return; }
      state = { transactions: parsed.transactions, budgets: parsed.budgets || {} };
      save(); renderDashboard(); renderTxTable(); renderBudget();
      showToast('导入成功 ✓ 数据已更新');
    } catch (err) { showToast('导入失败：文件无法解析'); }
  };
  reader.readAsText(file);
}
function loadSample() {
  const today = todayStr();
  const sample = [];
  for (let i = 0; i < 60; i++) {
    const d = new Date();
    d.setDate(d.getDate() - Math.floor(Math.random() * 90));
    const cat = EXPENSE_CATS[Math.floor(Math.random() * EXPENSE_CATS.length)];
    sample.push({
      id: uid(), type: 'expense', category: cat.name,
      amount: Math.round((20 + Math.random() * 180) * 100) / 100,
      date: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
      note: '', createdAt: Date.now() - i * 3600000,
    });
  }
  for (let i = 0; i < 8; i++) {
    const d = new Date();
    d.setDate(d.getDate() - Math.floor(Math.random() * 60));
    sample.push({
      id: uid(), type: 'income', category: '工资',
      amount: 8000 + Math.floor(Math.random() * 2000),
      date: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
      note: '工资', createdAt: Date.now() - i * 3600000,
    });
  }
  state.transactions = sample;
  state.budgets = { 餐饮: 1800, 交通: 400, 购物: 1200, 娱乐: 500, 住房: 3000, 水电: 250, 教育: 800 };
  save(); renderDashboard(); renderTxTable(); renderBudget();
  showToast('示例数据已载入 ✦');
}

/* ================= 初始化 ================= */
function init() {
  // 导航
  document.querySelectorAll('.nav-item').forEach(b => b.onclick = () => switchView(b.dataset.view));
  $('btnGoTx').onclick = () => switchView('transactions');

  // 月份切换
  $('prevMonth').onclick = () => { currentMonth = shiftMonth(currentMonth, -1); renderDashboard(); renderBudget(); };
  $('nextMonth').onclick = () => { currentMonth = shiftMonth(currentMonth, 1); renderDashboard(); renderBudget(); };
  $('btnToday').onclick = () => { currentMonth = todayStr().slice(0, 7); renderDashboard(); renderBudget(); };
  $('monthLabel').textContent = currentMonth;

  // 记账表单
  $('txTypeSeg').addEventListener('click', e => {
    const b = e.target.closest('.seg-btn');
    if (!b) return;
    document.querySelectorAll('#txTypeSeg .seg-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    fillCategorySelect();
  });
  $('txSave').onclick = saveTx;
  $('txReset').onclick = () => { resetTxForm(); };
  $('filterType').onchange = () => { fillFilterCategory(); renderTxTable(); };
  $('filterCategory').onchange = renderTxTable;
  ['txAmount', 'txDate'].forEach(id => $(id).addEventListener('input', () => formClearError($(id))));

  // 预算
  $('budgetSave').onclick = saveBudget;

  // 数据管理
  $('btnExport').onclick = exportData;
  $('btnImport').onclick = () => $('importFile').click();
  $('importFile').onchange = e => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; };
  $('btnSample').onclick = loadSample;
  $('btnClear').onclick = () => {
    if (state.transactions.length === 0) { showToast('数据本来就是空的'); return; }
    state = { transactions: [], budgets: {} };
    save(); renderDashboard(); renderTxTable(); renderBudget();
    showToast('已清空全部数据');
  };

  // 初始渲染
  fillFilterCategory();
  fillCategorySelect();
  $('txDate').value = todayStr();
  renderDashboard();
  renderTxTable();
  renderBudget();
}
function fillFilterCategory() {
  const sel = $('filterCategory');
  const ft = $('filterType').value;
  const cats = ft === 'income' ? INCOME_CATS : EXPENSE_CATS;
  const cur = sel.value;
  sel.innerHTML = '<option value="all">全部分类</option>' + cats.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
  sel.value = cur;
}

document.addEventListener('DOMContentLoaded', init);

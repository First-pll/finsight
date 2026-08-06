/* ================= 财政大臣 个人理财仪表盘 =================
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

  // 问候语（按时段）
  const h = new Date().getHours();
  const greet = h < 6 ? '夜深了 🌙' : h < 12 ? '早上好 👋' : h < 18 ? '下午好 ☀️' : '晚上好 🌆';
  const h1 = document.querySelector('#view-dashboard h1');
  if (h1) h1.textContent = greet;

  // 记账笔数
  const totalCount = state.transactions.length;
  const countEl = $('dashCount');
  if (countEl) countEl.textContent = totalCount ? `✨ 已记账 ${totalCount} 笔` : '✨ 从记第一笔开始';

  // 较上月对比
  const prevYm = shiftMonth(currentMonth, -1);
  const ps = monthStats(prevYm);
  const incDelta = ps.income > 0 ? Math.round((s.income - ps.income) / ps.income * 100) : (s.income > 0 ? 100 : 0);
  const expDelta = ps.expense > 0 ? Math.round((s.expense - ps.expense) / ps.expense * 100) : 0;
  const incEl = $('kpiIncomeDelta');
  if (incEl) incEl.textContent = s.income === 0 && ps.income === 0 ? '本月暂无收入' : (incDelta >= 0 ? `▲ 较上月 +${incDelta}%` : `▼ 较上月 ${incDelta}%`);
  const expEl = $('kpiExpenseDelta');
  if (expEl) expEl.textContent = expDelta === 0 && ps.expense === 0 ? '本月暂无支出' : (expDelta <= 0 ? `▼ 较上月 ${expDelta}%` : `▲ 较上月 +${expDelta}%`);

  // 储蓄率
  const netEl = $('kpiNetDelta');
  if (netEl) {
    if (s.income > 0) netEl.textContent = `储蓄率 ${Math.max(0, Math.round(s.net / s.income * 100))}%`;
    else netEl.textContent = '—';
  }

  // 预算
  const bKeys = Object.keys(state.budgets);
  const bTotal = bKeys.reduce((a, k) => a + (Number(state.budgets[k]) || 0), 0);
  const budgetEl = $('kpiBudget');
  const budgetSubEl = $('kpiBudgetDelta');
  if (bTotal > 0) {
    const spent = Object.keys(state.budgets).reduce((a, k) => {
      const cat = state.budgets[k];
      const spentCat = state.transactions.filter(t => t.type === 'expense' && t.date && t.date.startsWith(currentMonth) && t.category === k)
        .reduce((x, t) => x + (Number(t.amount) || 0), 0);
      return a + Math.min(spentCat, cat);
    }, 0);
    budgetEl.textContent = Math.round(spent / bTotal * 100) + '%';
    if (budgetSubEl) {
      const remain = bTotal - spent;
      budgetSubEl.textContent = remain >= 0 ? `剩余 ${fmtMoney0(remain)}` : `超支 ${fmtMoney0(-remain)}`;
      budgetSubEl.style.color = remain < 0 ? 'var(--expense)' : '';
    }
  } else {
    budgetEl.textContent = '未设置';
    if (budgetSubEl) { budgetSubEl.textContent = '去「预算」页设置'; budgetSubEl.style.color = ''; }
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
      { label: '收入', data: income, borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,.10)', tension: .35, fill: true, pointRadius: 3, pointBackgroundColor: '#fff', pointBorderColor: '#16a34a', pointBorderWidth: 2 },
      { label: '支出', data: expense, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,.07)', tension: .35, fill: true, pointRadius: 3, pointBackgroundColor: '#fff', pointBorderColor: '#ef4444', pointBorderWidth: 2 },
    ] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#7a8499', usePointStyle: true, boxWidth: 6, boxHeight: 6 } } },
      scales: {
        x: { ticks: { color: '#7a8499' }, grid: { color: 'rgba(28,35,51,.06)' } },
        y: { ticks: { color: '#7a8499' }, grid: { color: 'rgba(28,35,51,.06)' } },
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
  const totalEl = $('pieTotal');
  if (totalEl) totalEl.textContent = '共 ' + fmtMoney0(Object.values(spent).reduce((a, b) => a + b, 0));

  // 无支出数据：销毁图表并显示空状态，避免 Chart.js 空数据导致数据集被标记 hidden
  if (!data.length) {
    if (charts.chartPie) { charts.chartPie.destroy(); charts.chartPie = null; }
    const box = $('pieChart');
    const wrap = box && box.parentNode;
    if (wrap && !wrap.querySelector('.empty')) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.style.position = 'absolute';
      empty.style.inset = '0';
      empty.style.display = 'flex';
      empty.style.alignItems = 'center';
      empty.style.justifyContent = 'center';
      empty.textContent = '本月还没有支出\n记一笔后这里会显示分类占比';
      wrap.appendChild(empty);
    }
    return;
  }

  // 有数据：清掉空状态占位
  const box = $('pieChart');
  const wrap = box && box.parentNode;
  const emptyEl = wrap && wrap.querySelector('.empty');
  if (emptyEl) emptyEl.remove();

  const palette = ['#4f6ef7', '#8b5cf6', '#22c55e', '#f59e0b', '#06b6d4', '#f472b6', '#14b8a6'];
  const cfg = {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: palette.slice(0, data.length), borderWidth: 0 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: '#7a8499', boxWidth: 10, usePointStyle: true, boxHeight: 6 } },
      },
    },
  };
  if (charts.chartPie) {
    charts.chartPie.data = cfg.data;
    charts.chartPie.options = cfg.options;
    charts.chartPie.data.datasets.forEach(ds => { ds.hidden = false; });
    charts.chartPie.update();
  } else {
    charts.chartPie = new Chart($('pieChart'), cfg);
  }
}
function renderRecentTx() {
  const recent = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 6);
  const box = $('recentTx');
  if (!recent.length) { box.innerHTML = '<div class="empty">还没有记录，去「记账」页记第一笔吧</div>'; return; }
  box.innerHTML = recent.map(t => {
    const cat = [...EXPENSE_CATS, ...INCOME_CATS].find(c => c.name === t.category);
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 2px;border-bottom:1px solid #f0f3f9;font-size:13.5px;">
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
  renderDashboard();
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
    save(); renderTxTable(); renderBudget(); renderDashboard(); showToast('已删除');
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

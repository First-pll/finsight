/* ================= FinSight · 核心逻辑 ================= */
'use strict';

/* ---------- 分类定义 ---------- */
const EXPENSE_CATS = [
  { name: '餐饮', emoji: '🍜' }, { name: '交通', emoji: '🚇' },
  { name: '购物', emoji: '🛍️' }, { name: '娱乐', emoji: '🎮' },
  { name: '住房', emoji: '🏠' }, { name: '水电', emoji: '💡' },
  { name: '医疗', emoji: '💊' }, { name: '教育', emoji: '📚' },
  { name: '人情', emoji: '🎁' }, { name: '其他', emoji: '📦' },
];
const INCOME_CATS = [
  { name: '工资', emoji: '💼' }, { name: '奖金', emoji: '🏆' },
  { name: '理财收益', emoji: '📈' }, { name: '兼职', emoji: '🧩' },
  { name: '其他', emoji: '💰' },
];
const CAT_EMOJI = {};
[...EXPENSE_CATS, ...INCOME_CATS].forEach(c => CAT_EMOJI[c.name] = c.emoji);

const STORAGE_KEY = 'finsight.v1';

/* ---------- 状态 ---------- */
let state = {
  transactions: [],   // {id, type, category, amount, date:'YYYY-MM-DD', note}
  budgets: {},        // {category: amount}
  goals: [],          // {id, name, target, current, deadline, emoji}
};
let currentMonth = todayStr().slice(0, 7); // 'YYYY-MM'
let editingTxId = null;
let editingGoalId = null;
let charts = {};

/* ---------- 工具 ---------- */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function fmtMoney(n) {
  return '¥' + Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtMoney0(n) {
  return '¥' + Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}
function monthLabel(m) {
  const [y, mo] = m.split('-');
  return `${y}年${Number(mo)}月`;
}
function shiftMonth(m, delta) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function catOf(name) {
  return [...EXPENSE_CATS, ...INCOME_CATS].find(c => c.name === name) || { name, emoji: '📌' };
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ---------- 持久化 ---------- */
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = { transactions: [], budgets: {}, goals: [], ...parsed };
    }
  } catch (e) { console.warn('数据读取失败', e); }
}

/* ---------- 统计 ---------- */
function monthTx(m) {
  return state.transactions.filter(t => t.date.slice(0, 7) === m);
}
function sumBy(txs, type) {
  return txs.filter(t => t.type === type).reduce((s, t) => s + Number(t.amount), 0);
}
function monthStats(m) {
  const txs = monthTx(m);
  const income = sumBy(txs, 'income');
  const expense = sumBy(txs, 'expense');
  return { income, expense, net: income - expense };
}
function monthSeries(months) {
  return months.map(m => {
    const s = monthStats(m);
    return { m, ...s };
  });
}
function expenseByCat(m) {
  const map = {};
  monthTx(m).filter(t => t.type === 'expense').forEach(t => {
    map[t.category] = (map[t.category] || 0) + Number(t.amount);
  });
  return map;
}
function totalGoalProgress() {
  if (!state.goals.length) return null;
  const t = state.goals.reduce((a, g) => a + Number(g.target), 0);
  const c = state.goals.reduce((a, g) => a + Number(g.current), 0);
  return { current: c, target: t, pct: t > 0 ? Math.min(100, c / t * 100) : 0 };
}

/* ---------- DOM 助手 ---------- */
const $ = id => document.getElementById(id);
function renderNav() { /* 占位 */ }

/* ================= 视图切换 ================= */
function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $('view-' + name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.view === name);
  });
  if (name === 'dashboard') renderDashboard();
  if (name === 'transactions') renderTxTable();
  if (name === 'budget') renderBudget();
  if (name === 'goals') renderGoals();
}

/* ================= 总览 ================= */
function renderDashboard() {
  const s = monthStats(currentMonth);
  const prev = monthStats(shiftMonth(currentMonth, -1));
  $('kpiIncome').textContent = fmtMoney0(s.income);
  $('kpiExpense').textContent = fmtMoney0(s.expense);
  $('kpiNet').textContent = fmtMoney0(s.net);
  $('kpiNet').style.color = s.net >= 0 ? 'var(--income)' : 'var(--expense)';
  $('kpiIncomeTrend').textContent = trendText(s.income, prev.income);
  $('kpiExpenseTrend').textContent = trendText(s.expense, prev.expense);
  $('kpiNetTrend').textContent = `上月结余 ${fmtMoney0(prev.net)}`;

  const g = totalGoalProgress();
  if (g) {
    $('kpiGoal').textContent = `${g.pct.toFixed(0)}%`;
    $('kpiGoalBar').style.width = g.pct + '%';
  } else {
    $('kpiGoal').textContent = '未设置';
    $('kpiGoalBar').style.width = '0%';
  }

  // 近6个月趋势
  const months = [];
  for (let i = 5; i >= 0; i--) months.push(shiftMonth(currentMonth, -i));
  const series = monthSeries(months);
  drawTrend(series);
  drawPie(expenseByCat(currentMonth));

  // 最近交易
  const recent = [...state.transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 7);
  const box = $('recentTx');
  if (!recent.length) {
    box.innerHTML = `<div class="empty"><span class="big">🍃</span>还没有交易记录<br>点右上角「记一笔」开始，或到数据管理载入示例数据</div>`;
  } else {
    box.innerHTML = recent.map(txRowHTML).join('');
    box.querySelectorAll('[data-del]').forEach(b => b.onclick = () => delTx(b.dataset.del));
    box.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openTxModal(b.dataset.edit));
  }
}
function trendText(cur, prev) {
  if (prev === 0) return cur > 0 ? '较上月 +100%' : '—';
  const pct = ((cur - prev) / prev) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `较上月 ${sign}${pct.toFixed(1)}%`;
}

/* ---------- 图表 ---------- */
function mkChart(id, cfg) {
  if (charts[id]) { charts[id].destroy(); }
  charts[id] = new Chart($(id), cfg);
}
function drawTrend(series) {
  const labels = series.map(s => s.m.slice(5) + '月');
  mkChart('chartTrend', {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '收入', data: series.map(s => +s.income.toFixed(2)),
          borderColor: '#34d399', backgroundColor: 'rgba(52,211,153,.12)',
          fill: true, tension: .4, borderWidth: 2.5, pointRadius: 3, pointBackgroundColor: '#34d399',
        },
        {
          label: '支出', data: series.map(s => +s.expense.toFixed(2)),
          borderColor: '#f87171', backgroundColor: 'rgba(248,113,113,.10)',
          fill: true, tension: .4, borderWidth: 2.5, pointRadius: 3, pointBackgroundColor: '#f87171',
        },
      ],
    },
    options: baseOpts({
      plugins: { legend: { labels: { color: '#8b9ac2', usePointStyle: true, boxWidth: 8 } } },
      scales: {
        x: { ticks: { color: '#8b9ac2' }, grid: { color: 'rgba(36,50,82,.35)' } },
        y: { ticks: { color: '#8b9ac2', callback: v => '¥' + v }, grid: { color: 'rgba(36,50,82,.35)' } },
      },
    }),
  });
}
function drawPie(catMap) {
  const entries = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    mkChart('chartPie', {
      type: 'doughnut',
      data: { labels: ['暂无数据'], datasets: [{ data: [1], backgroundColor: ['#3a4a73'] }] },
      options: baseOpts({ plugins: { legend: { display: false } } }),
    });
    return;
  }
  const palette = ['#34d399', '#2dd4bf', '#60a5fa', '#a78bfa', '#f472b6', '#fbbf24', '#fb923c', '#f87171', '#22d3ee', '#94a3b8'];
  mkChart('chartPie', {
    type: 'doughnut',
    data: {
      labels: entries.map(e => e[0]),
      datasets: [{ data: entries.map(e => +e[1].toFixed(2)), backgroundColor: palette, borderColor: '#151e33', borderWidth: 3 }],
    },
    options: baseOpts({
      cutout: '62%',
      plugins: {
        legend: { position: 'bottom', labels: { color: '#8b9ac2', usePointStyle: true, boxWidth: 8, padding: 10, font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}：${fmtMoney(ctx.parsed)}` } },
      },
    }),
  });
}
function baseOpts(extra) {
  return Object.assign({
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { labels: { color: '#8b9ac2', usePointStyle: true, boxWidth: 8 } } },
  }, extra);
}

/* ---------- 交易行 HTML ---------- */
function txRowHTML(t) {
  const c = catOf(t.category);
  return `
  <div class="tx-row">
    <div class="tx-emoji">${c.emoji}</div>
    <div class="tx-info">
      <div class="tx-note">${esc(t.note || c.name)}</div>
      <div class="tx-meta">${t.date} · ${t.category}</div>
    </div>
    <div class="tx-amount ${t.type}">${t.type === 'income' ? '+' : '-'}${fmtMoney(t.amount)}</div>
    <button class="tx-edit" data-edit="${t.id}" title="编辑">✎</button>
    <button class="tx-del" data-del="${t.id}" title="删除">✕</button>
  </div>`;
}

/* ================= 记账页 ================= */
function renderTxTable() {
  const type = $('filterType').value;
  const cat = $('filterCategory').value;
  let txs = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date));
  if (type !== 'all') txs = txs.filter(t => t.type === type);
  if (cat !== 'all') txs = txs.filter(t => t.category === cat);
  $('txCount').textContent = `(${txs.length} 笔)`;

  const body = $('txTableBody');
  if (!txs.length) {
    body.innerHTML = `<tr><td colspan="6"><div class="empty"><span class="big">📭</span>没有符合条件的交易</div></td></tr>`;
    return;
  }
  body.innerHTML = txs.map(t => `
    <tr>
      <td>${t.date}</td>
      <td><span class="tag ${t.type}">${t.type === 'expense' ? '支出' : '收入'}</span></td>
      <td>${catOf(t.category).emoji} ${esc(t.category)}</td>
      <td class="muted">${esc(t.note || '—')}</td>
      <td class="r tx-amount ${t.type}">${t.type === 'income' ? '+' : '-'}${fmtMoney(t.amount)}</td>
      <td class="r">
        <button class="tx-edit" data-edit="${t.id}">✎</button>
        <button class="tx-del" data-del="${t.id}">✕</button>
      </td>
    </tr>`).join('');
  body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => delTx(b.dataset.del));
  body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openTxModal(b.dataset.edit));
}
function delTx(id) {
  if (!confirm('确定删除这笔交易吗？')) return;
  state.transactions = state.transactions.filter(t => t.id !== id);
  save(); refresh();
}

/* ---------- 交易模态框 ---------- */
function fillCatSelect(type) {
  const sel = $('txCategory');
  const cats = type === 'income' ? INCOME_CATS : EXPENSE_CATS;
  sel.innerHTML = cats.map(c => `<option value="${c.name}">${c.emoji} ${c.name}</option>`).join('');
}
function openTxModal(id) {
  editingTxId = id || null;
  $('txModalTitle').textContent = id ? '编辑交易' : '记一笔';
  document.querySelectorAll('.seg-btn').forEach(b => {
    b.classList.remove('active');
    if (b.dataset.txType === 'expense') b.classList.add('active');
  });
  const t = id ? state.transactions.find(x => x.id === id) : null;
  if (t) {
    document.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.txType === t.type));
    fillCatSelect(t.type);
    $('txAmount').value = t.amount;
    $('txCategory').value = t.category;
    $('txDate').value = t.date;
    $('txNote').value = t.note || '';
  } else {
    fillCatSelect('expense');
    $('txAmount').value = '';
    $('txDate').value = currentMonth + '-01';
    $('txNote').value = '';
  }
  $('txModal').hidden = false;
}
function closeTxModal() { $('txModal').hidden = true; editingTxId = null; }
function saveTx() {
  const type = document.querySelector('.seg-btn.active').dataset.txType;
  const amount = parseFloat($('txAmount').value);
  const category = $('txCategory').value;
  const date = $('txDate').value;
  const note = $('txNote').value.trim();
  if (!(amount > 0)) { alert('请输入有效的金额'); return; }
  if (!date) { alert('请选择日期'); return; }
  const rec = { type, category, amount, date, note };
  if (editingTxId) {
    const i = state.transactions.findIndex(x => x.id === editingTxId);
    if (i >= 0) state.transactions[i] = { id: editingTxId, ...rec };
  } else {
    state.transactions.push({ id: uid(), ...rec });
  }
  save(); closeTxModal(); refresh();
}

/* ================= 预算页 ================= */
function renderBudget() {
  $('budgetMonthLabel').textContent = `· ${monthLabel(currentMonth)}`;
  const s = monthStats(currentMonth);
  const totalBudget = Object.values(state.budgets).reduce((a, b) => a + Number(b), 0);
  const used = Object.entries(state.budgets).reduce((a, [cat, amt]) => {
    const spent = expenseByCat(currentMonth)[cat] || 0;
    return a + Math.min(spent, Number(amt));
  }, 0);
  $('budgetSummary').innerHTML = `
    <div class="budget-stat"><div class="lbl">月度总预算</div><div class="val">${fmtMoney0(totalBudget)}</div></div>
    <div class="budget-stat"><div class="lbl">已使用</div><div class="val" style="color:${used > totalBudget ? 'var(--expense)' : 'var(--income)'}">${fmtMoney0(used)}</div></div>
    <div class="budget-stat"><div class="lbl">预算剩余</div><div class="val" style="color:${totalBudget - used >= 0 ? 'var(--text)' : 'var(--expense)'}">${fmtMoney0(totalBudget - used)}</div></div>`;

  const spentMap = expenseByCat(currentMonth);
  const cats = Object.keys(state.budgets).length
    ? Object.keys(state.budgets)
    : EXPENSE_CATS.map(c => c.name);
  const list = $('budgetList');
  if (!cats.length) { list.innerHTML = `<div class="empty">点击「编辑预算」设置分类预算</div>`; return; }
  list.innerHTML = cats.map(cat => {
    const budget = Number(state.budgets[cat] || 0);
    const spent = spentMap[cat] || 0;
    const pct = budget > 0 ? spent / budget * 100 : (spent > 0 ? 100 : 0);
    let cls = 'zero', barW = 0;
    if (budget > 0) {
      barW = Math.min(100, pct);
      cls = pct > 100 ? 'over' : pct > 80 ? 'warn' : 'ok';
    } else if (spent > 0) { barW = 100; cls = 'over'; }
    return `
    <div class="budget-row">
      <div class="budget-top">
        <span class="budget-name">${CAT_EMOJI[cat] || '📌'} ${esc(cat)}</span>
        <span class="budget-nums">
          ${budget > 0 ? `${fmtMoney0(spent)} / ${fmtMoney0(budget)} · ${pct.toFixed(0)}%` : (spent > 0 ? `${fmtMoney0(spent)}（未设预算）` : '未设预算')}
        </span>
      </div>
      <div class="budget-bar"><div class="budget-fill ${cls}" style="width:${barW}%"></div></div>
    </div>`;
  }).join('');
}
function openBudgetModal() {
  $('budgetForm').innerHTML = EXPENSE_CATS.map(c => `
    <label class="field"><span>${c.emoji} ${c.name}</span>
      <input type="number" class="input budget-input" data-cat="${c.name}" min="0" step="1"
             placeholder="不设预算" value="${state.budgets[c.name] ?? ''}">
    </label>`).join('');
  $('budgetModal').hidden = false;
}
function saveBudget() {
  const next = {};
  document.querySelectorAll('.budget-input').forEach(inp => {
    const v = parseFloat(inp.value);
    if (v > 0) next[inp.dataset.cat] = v;
  });
  state.budgets = next;
  save(); $('budgetModal').hidden = true; renderBudget();
}

/* ================= 储蓄目标 ================= */
function renderGoals() {
  const grid = $('goalGrid');
  if (!state.goals.length) {
    grid.innerHTML = `<div class="card empty" style="grid-column:1/-1"><span class="big">🎯</span>还没有储蓄目标<br>点击「新建目标」设定一个，比如应急基金、旅行基金</div>`;
    return;
  }
  grid.innerHTML = state.goals.map(g => {
    const pct = Number(g.target) > 0 ? Math.min(100, Number(g.current) / Number(g.target) * 100) : 0;
    const remaining = Math.max(0, Number(g.target) - Number(g.current));
    let eta = '—';
    const avg = avgMonthlyNet(6);
    if (avg > 0) {
      const months = Math.ceil(remaining / avg);
      const d = new Date();
      d.setMonth(d.getMonth() + months);
      eta = `${months} 个月（约 ${d.getFullYear()}.${d.getMonth()+1}）`;
    }
    const deadline = g.deadline ? ` · 目标日 ${g.deadline}` : '';
    return `
    <div class="card goal-card">
      <div class="goal-name">${g.emoji || '🎯'} ${esc(g.name)}</div>
      <div class="goal-nums">
        <span>已存 <b>${fmtMoney0(g.current)}</b></span>
        <span class="goal-pct" style="color:${pct >= 100 ? 'var(--income)' : 'var(--accent)'}">${pct.toFixed(0)}%</span>
      </div>
      <div class="budget-bar"><div class="budget-fill ${pct >= 100 ? 'ok' : 'ok'}" style="width:${pct}%"></div></div>
      <div class="muted" style="font-size:12px; margin-top:9px;">目标 ${fmtMoney0(g.target)}${deadline}</div>
      <div class="muted" style="font-size:12px; margin-top:3px;">按近6月平均月结余估算：还需约 ${eta}</div>
      ${pct >= 100 ? '<div style="color:var(--income);font-size:12px;margin-top:6px;font-weight:600;">🎉 目标已达成！</div>' : ''}
      <div class="goal-actions">
        <button class="btn btn-ghost" data-goal-edit="${g.id}">✎ 编辑</button>
        <button class="btn btn-ghost" data-goal-add="${g.id}">＋ 存一笔</button>
        <button class="btn btn-danger" data-goal-del="${g.id}">删除</button>
      </div>
    </div>`;
  }).join('');
  grid.querySelectorAll('[data-goal-edit]').forEach(b => b.onclick = () => openGoalModal(b.dataset.goal-edit));
  grid.querySelectorAll('[data-goal-del]').forEach(b => b.onclick = () => {
    if (confirm('确定删除这个目标吗？')) {
      state.goals = state.goals.filter(x => x.id !== b.dataset.goal-del);
      save(); renderGoals();
    }
  });
  grid.querySelectorAll('[data-goal-add]').forEach(b => b.onclick = () => {
    const g = state.goals.find(x => x.id === b.dataset.goal-add);
    if (!g) return;
    const amt = prompt(`向「${g.name}」存入多少金额？(¥)`, '500');
    if (amt === null) return;
    const v = parseFloat(amt);
    if (!(v > 0)) { alert('金额无效'); return; }
    g.current = Number(g.current) + v;
    save(); renderGoals();
  });
}
function avgMonthlyNet(n) {
  const months = [];
  for (let i = n - 1; i >= 0; i--) months.push(shiftMonth(currentMonth, -i));
  const nets = months.map(m => monthStats(m).net);
  const avg = nets.reduce((a, b) => a + b, 0) / n;
  return avg > 0 ? avg : 0;
}
function openGoalModal(id) {
  editingGoalId = id || null;
  $('goalModalTitle').textContent = id ? '编辑储蓄目标' : '新建储蓄目标';
  const g = id ? state.goals.find(x => x.id === id) : null;
  $('goalName').value = g ? g.name : '';
  $('goalTarget').value = g ? g.target : '';
  $('goalCurrent').value = g ? g.current : '';
  $('goalDeadline').value = g ? (g.deadline || '') : '';
  $('goalModal').hidden = false;
}
function saveGoal() {
  const name = $('goalName').value.trim();
  const target = parseFloat($('goalTarget').value);
  const current = parseFloat($('goalCurrent').value) || 0;
  const deadline = $('goalDeadline').value || '';
  if (!name) { alert('请输入目标名称'); return; }
  if (!(target > 0)) { alert('请输入有效的目标金额'); return; }
  const emojis = ['🎯', '🚀', '🏝️', '💎', '🏠', '🎓', '💻', '🚗'];
  const rec = { name, target, current, deadline, emoji: emojis[state.goals.length % emojis.length] };
  if (editingGoalId) {
    const i = state.goals.findIndex(x => x.id === editingGoalId);
    if (i >= 0) state.goals[i] = { ...state.goals[i], ...rec };
  } else {
    state.goals.push({ id: uid(), ...rec });
  }
  save(); $('goalModal').hidden = true; renderGoals();
}

/* ================= 数据管理 ================= */
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `finsight-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
function importData(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!Array.isArray(parsed.transactions)) throw new Error('格式错误');
      state = { transactions: [], budgets: {}, goals: [], ...parsed };
      save(); refresh();
      alert('导入成功！');
    } catch (err) {
      alert('导入失败：文件格式不正确');
    }
  };
  reader.readAsText(file);
}
function loadSample() {
  if (state.transactions.length && !confirm('已有数据，载入示例数据会覆盖当前内容。继续？')) return;
  state = { transactions: sampleTx(), budgets: { 餐饮: 1800, 交通: 400, 购物: 1200, 娱乐: 500, 住房: 3000, 水电: 250, 教育: 800 }, goals: sampleGoals() };
  save(); refresh();
}
function sampleTx() {
  const txs = [];
  const now = new Date();
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    // 工资
    txs.push({ id: uid(), type: 'income', category: '工资', amount: 8000, date: `${ym}-05`, note: '月度工资' });
    txs.push({ id: uid(), type: 'income', category: '理财收益', amount: Math.round(rnd(80, 320)), date: `${ym}-15`, note: '基金收益' });
    // 支出（每天几笔）
    for (let day = 1; day <= 28; day += pick([1, 2, 3])) {
      const cats = pick([
        { c: '餐饮', a: [18, 80] }, { c: '交通', a: [4, 25] }, { c: '购物', a: [30, 400] },
        { c: '娱乐', a: [20, 150] }, { c: '水电', a: [60, 180] }, { c: '教育', a: [40, 120] },
        { c: '人情', a: [50, 300] }, { c: '医疗', a: [20, 90] }, { c: '其他', a: [10, 100] },
      ]);
      const dd = new Date(d.getFullYear(), d.getMonth(), day);
      const date = `${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      txs.push({ id: uid(), type: 'expense', category: cats.c, amount: Math.round(rnd(cats.a[0], cats.a[1]) * 10) / 10, date, note: pick(['日常开销', '', '超市采购', '外卖', '周末消费', '通勤']) });
    }
    // 房租
    txs.push({ id: uid(), type: 'expense', category: '住房', amount: 2800, date: `${ym}-01`, note: '房租' });
  }
  return txs;
}
function sampleGoals() {
  return [
    { id: uid(), name: '应急基金', target: 30000, current: 15600, deadline: '', emoji: '🛡️' },
    { id: uid(), name: '旅行基金', target: 12000, current: 3800, deadline: '2027-03-01', emoji: '🏝️' },
  ];
}
function clearAll() {
  if (!confirm('确定清空全部数据吗？此操作不可撤销，建议先导出备份。')) return;
  state = { transactions: [], budgets: {}, goals: [] };
  save(); refresh();
}

/* ================= 刷新 ================= */
function refresh() {
  $('monthLabel').textContent = monthLabel(currentMonth);
  const s = monthStats(currentMonth);
  $('netChip').textContent = `本月结余 ${fmtMoney0(s.net)}`;
  $('netChip').style.color = s.net >= 0 ? 'var(--text)' : 'var(--expense)';
  const active = document.querySelector('.nav-item.active');
  if (active) switchView(active.dataset.view);
}

/* ================= 初始化 ================= */
function init() {
  load();
  // 筛选分类下拉
  const fcat = $('filterCategory');
  fcat.innerHTML = `<option value="all">全部分类</option>` + [...EXPENSE_CATS, ...INCOME_CATS]
    .map(c => `<option value="${c.name}">${c.emoji} ${c.name}</option>`).join('');

  // 导航
  document.querySelectorAll('.nav-item').forEach(b => b.onclick = () => switchView(b.dataset.view));
  $('goTransactions').onclick = () => switchView('transactions');

  // 月份
  $('prevMonth').onclick = () => { currentMonth = shiftMonth(currentMonth, -1); refresh(); };
  $('nextMonth').onclick = () => { currentMonth = shiftMonth(currentMonth, 1); refresh(); };
  $('btnToday').onclick = () => { currentMonth = todayStr().slice(0, 7); refresh(); };

  // 记账
  $('btnAdd').onclick = () => openTxModal(null);
  $('txSave').onclick = saveTx;
  $('txTypeSeg').addEventListener('click', e => {
    const b = e.target.closest('.seg-btn');
    if (!b) return;
    document.querySelectorAll('.seg-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    fillCatSelect(b.dataset.txType);
  });
  $('filterType').onchange = renderTxTable;
  $('filterCategory').onchange = renderTxTable;

  // 预算
  $('btnEditBudget').onclick = openBudgetModal;
  $('budgetSave').onclick = saveBudget;

  // 目标
  $('btnAddGoal').onclick = () => openGoalModal(null);
  $('goalSave').onclick = saveGoal;

  // 数据
  $('btnExport').onclick = exportData;
  $('btnImport').onclick = () => $('importFile').click();
  $('importFile').onchange = e => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; };
  $('btnSample').onclick = loadSample;
  $('btnClear').onclick = clearAll;

  // 模态框关闭
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('.modal-mask').hidden = true);
  document.querySelectorAll('.modal-mask').forEach(mask => {
    mask.addEventListener('click', e => { if (e.target === mask) mask.hidden = true; });
  });

  refresh();
}
document.addEventListener('DOMContentLoaded', init);

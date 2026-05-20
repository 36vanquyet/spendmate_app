const API = "http://127.0.0.1:8000";
let token = localStorage.getItem("token") || "";
let charts = { bar: null, line: null, pie: null, txPie: null, statsBar: null, statsLine: null, statsPie: null };
let groupCache = [];
let authMode = "login";
let statsCache = { txs: [], budget: null };

const authBox = document.getElementById("authBox");
const appBox = document.getElementById("appBox");
const languageSelect = document.getElementById("languageSelect");

function headers(json = true) {
  const base = token ? { Authorization: `Bearer ${token}` } : {};
  if (json) base["Content-Type"] = "application/json";
  return base;
}

async function call(path, options = {}) {
  const res = await fetch(`${API}${path}`, options);
  if (!res.ok) throw new Error(await res.text());
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res;
}

function vnd(n) {
  return `${Math.round(n || 0).toLocaleString("vi-VN")} đ`;
}

function switchAuthUi() {
  authBox.classList.toggle("hidden", !!token);
  appBox.classList.toggle("hidden", !token);
  if (token) loadAll();
}

async function auth(endpoint) {
  const payload = {
    email: document.getElementById("email").value,
    password: document.getElementById("password").value,
    full_name: document.getElementById("name").value || "User"
  };
  const data = await call(`/auth/${endpoint}`, { method: "POST", headers: headers(), body: JSON.stringify(payload) });
  token = data.access_token;
  localStorage.setItem("token", token);
  switchAuthUi();
}

function setAuthMode(mode) {
  authMode = mode;
  const loginTab = document.getElementById("loginBtn");
  const registerTab = document.getElementById("registerBtn");
  const primary = document.getElementById("authPrimaryBtn");
  const foot = document.getElementById("switchToRegister");
  if (mode === "login") {
    loginTab.classList.add("active");
    registerTab.classList.remove("active");
    primary.textContent = "Đăng nhập";
    foot.textContent = "Đăng ký";
  } else {
    registerTab.classList.add("active");
    loginTab.classList.remove("active");
    primary.textContent = "Đăng ký";
    foot.textContent = "Đăng nhập";
  }
}

async function downloadReport(fmt, name) {
  const res = await fetch(`${API}/reports/export?fmt=${fmt}`, { headers: headers(false) });
  if (!res.ok) throw new Error("Không thể xuất báo cáo");
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

function renderPieChart(canvasId, legendId, entries, chartKey) {
  const labels = entries.map(([label]) => label);
  const values = entries.map(([, value]) => value);
  const total = values.reduce((sum, v) => sum + v, 0) || 1;
  const colors = ["#2563eb", "#35a66f", "#f5b014", "#9b5de5", "#a8b4c8"];
  if (charts[chartKey]) charts[chartKey].destroy();
  charts[chartKey] = new Chart(document.getElementById(canvasId), {
    type: "doughnut",
    data: {
      labels: labels.length ? labels : ["Chưa có"],
      datasets: [{
        data: values.length ? values : [1],
        backgroundColor: labels.length ? labels.map((_, i) => colors[i % colors.length]) : ["#a8b4c8"],
        borderWidth: 3
      }]
    },
    options: { maintainAspectRatio: false, cutout: "62%", plugins: { legend: { display: false } } },
    plugins: [{
      id: "sliceLabels",
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        const meta = chart.getDatasetMeta(0);
        ctx.save();
        ctx.fillStyle = "#fff";
        ctx.font = "700 12px Manrope, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        meta.data.forEach((arc, index) => {
          const value = values[index] || 0;
          const pct = Math.round((value / total) * 100);
          if (!value || pct < 8) return;
          const angle = (arc.startAngle + arc.endAngle) / 2;
          const radius = (arc.innerRadius + arc.outerRadius) / 2;
          const x = arc.x + Math.cos(angle) * radius;
          const y = arc.y + Math.sin(angle) * radius;
          ctx.fillText(`${pct}%`, x, y);
        });
        ctx.restore();
      }
    }]
  });
  const legendRoot = document.getElementById(legendId);
  if (legendRoot) {
    legendRoot.innerHTML = (labels.length ? labels : ["Chưa có"]).map((label, index) => {
      const value = values[index] || 0;
      const pct = Math.round((value / total) * 100);
      return `
        <div class="pie-item">
          <span class="pie-swatch" style="background:${labels.length ? colors[index % colors.length] : "#a8b4c8"}"></span>
          <span class="pie-label">${label}</span>
          <span class="pie-stats">
            <span class="pie-value">${pct}%</span>
            <span class="pie-amount">${vnd(value)}</span>
          </span>
        </div>
      `;
    }).join("");
  }
}

function getPeriodLabel(period) {
  return { day: "ngày", week: "tuần", month: "tháng", year: "năm" }[period] || "tháng";
}

function cloneDate(date) {
  return new Date(date.getTime());
}

function startOfDay(date) {
  const d = cloneDate(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date) {
  const d = startOfDay(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d;
}

function startOfMonth(date) {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

function startOfYear(date) {
  const d = startOfDay(date);
  d.setMonth(0, 1);
  return d;
}

function addDays(date, days) {
  const d = cloneDate(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(date, months) {
  const d = cloneDate(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function addYears(date, years) {
  const d = cloneDate(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

function isSameOrAfter(date, start) {
  return date.getTime() >= start.getTime();
}

function isBefore(date, end) {
  return date.getTime() < end.getTime();
}

function getPeriodWindows(period, now = new Date()) {
  if (period === "day") {
    const currentStart = startOfDay(now);
    const prevStart = addDays(currentStart, -1);
    return { currentStart, currentEnd: addDays(currentStart, 1), prevStart, prevEnd: currentStart };
  }
  if (period === "week") {
    const currentStart = startOfWeek(now);
    const prevStart = addDays(currentStart, -7);
    return { currentStart, currentEnd: addDays(currentStart, 7), prevStart, prevEnd: currentStart };
  }
  if (period === "year") {
    const currentStart = startOfYear(now);
    const prevStart = addYears(currentStart, -1);
    return { currentStart, currentEnd: addYears(currentStart, 1), prevStart, prevEnd: currentStart };
  }
  const currentStart = startOfMonth(now);
  const prevStart = addMonths(currentStart, -1);
  return { currentStart, currentEnd: addMonths(currentStart, 1), prevStart, prevEnd: currentStart };
}

function getTimeBucketConfig(period, now = new Date()) {
  if (period === "day") {
    return {
      labels: Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}`),
      indexOf(date) { return date.getHours(); }
    };
  }
  if (period === "week") {
    const labels = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
    return {
      labels,
      indexOf(date) {
        return (date.getDay() + 6) % 7;
      }
    };
  }
  if (period === "year") {
    const year = now.getFullYear();
    const labels = Array.from({ length: 5 }, (_, i) => String(year - 4 + i));
    return {
      labels,
      indexOf(date) {
        return Math.max(0, Math.min(4, date.getFullYear() - (year - 4)));
      }
    };
  }
  const labels = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12"];
  return {
    labels,
    indexOf(date) { return date.getMonth(); }
  };
}

function buildPeriodSeries(rows, period, amountSelector = r => r.amount || 0, filterFn = null, now = new Date()) {
  const cfg = getTimeBucketConfig(period, now);
  const income = new Array(cfg.labels.length).fill(0);
  const expense = new Array(cfg.labels.length).fill(0);
  rows.forEach(row => {
    if (filterFn && !filterFn(row)) return;
    const date = new Date(row.occurred_at);
    const idx = cfg.indexOf(date);
    const value = amountSelector(row);
    if (row.kind === "income") income[idx] += value;
    else expense[idx] += value;
  });
  return { labels: cfg.labels, income, expense };
}

function summarizeRows(rows) {
  const summary = rows.reduce((acc, row) => {
    const amount = row.amount || 0;
    if (row.kind === "income") acc.income += amount;
    else acc.expense += amount;
    acc.count += 1;
    if (row.kind === "expense") {
      acc.by_category[row.category || "Khác"] = (acc.by_category[row.category || "Khác"] || 0) + amount;
    }
    return acc;
  }, { income: 0, expense: 0, count: 0, by_category: {} });
  summary.balance = summary.income - summary.expense;
  return summary;
}

function getSelectedStatsPeriod() {
  const btn = document.querySelector(".stats-segment.active");
  return btn?.dataset.period || document.getElementById("statsPeriodSelect")?.value || "month";
}

function setStatsPeriod(period) {
  const select = document.getElementById("statsPeriodSelect");
  if (select) select.value = period;
  document.querySelectorAll(".stats-segment[data-period]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.period === period);
  });
}

function getStatsFilters() {
  return {
    search: (document.getElementById("statsSearchInput")?.value || "").trim().toLowerCase(),
    category: document.getElementById("statsCategorySelect")?.value || "",
    account: document.getElementById("statsAccountSelect")?.value || ""
  };
}

function filterStatsRows(rows) {
  const { search, category, account } = getStatsFilters();
  return rows.filter(row => {
    if (category && (row.category || "") !== category) return false;
    if (account && (row.account || "") !== account) return false;
    if (search) {
      const hay = `${row.note || ""} ${row.category || ""} ${row.account || ""}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

function periodDisplayName(period) {
  return { day: "ngày", week: "tuần", month: "tháng", year: "năm" }[period] || "tháng";
}

function sparkline(values, color = "#ef4444") {
  const max = Math.max(...values, 1);
  const width = 96;
  const height = 28;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v || 0) / max) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke="${color}" stroke-width="2" points="${points}" stroke-linecap="round" stroke-linejoin="round" /></svg>`;
}

function trendValuesForCategory(rows, category, period, now = new Date()) {
  const cfg = getTimeBucketConfig(period, now);
  const values = new Array(cfg.labels.length).fill(0);
  rows.filter(r => r.kind === "expense" && (r.category || "Khác") === category).forEach(row => {
    const idx = cfg.indexOf(new Date(row.occurred_at));
    values[idx] += row.amount || 0;
  });
  return values;
}

function setProfileEditMode(editing) {
  const form = document.querySelector(".settings-form");
  const button = document.getElementById("saveProfile");
  if (!form || !button) return;
  form.classList.toggle("hidden", !editing);
  button.innerHTML = editing
    ? '<i class="bi bi-check2-circle"></i> Lưu hồ sơ'
    : '<i class="bi bi-pencil-square"></i> Chỉnh sửa hồ sơ';
}

function mountKpis(summary, budget) {
  const cards = [
    { title: "Tổng số dư", value: summary.balance, trend: "8,5% so với tháng trước", icon: "bi-wallet2", tone: "blue" },
    { title: "Tổng thu", value: summary.income, trend: "12,4% so với tháng trước", icon: "bi-arrow-down-circle", tone: "green" },
    { title: "Tổng chi", value: summary.expense, trend: "6,2% so với tháng trước", icon: "bi-arrow-up-circle", tone: "red", expense: true },
    { title: "Tiết kiệm", value: summary.income - summary.expense, trend: "24,1% so với tháng trước", icon: "bi-piggy-bank", tone: "green" }
  ];
  document.getElementById("kpiCards").innerHTML = cards.map(c => `
    <div class="kpi ${c.expense ? "expense" : ""}">
      <div class="kpi-icon ${c.tone}"><i class="bi ${c.icon}"></i></div>
      <div>
        <h4>${c.title}</h4>
        <p>${vnd(c.value)}</p>
        <span><b>↑ ${c.trend.split(" ")[0]}</b> ${c.trend.replace(c.trend.split(" ")[0], "")}</span>
      </div>
    </div>
  `).join("");
}

function drawCharts(summary, txs) {
  const monthLabels = ["T1","T2","T3","T4","T5","T6","T7","T8","T9","T10","T11","T12"];
  const expenses = new Array(12).fill(0);
  const incomes = new Array(12).fill(0);
  txs.forEach(t => {
    const m = new Date(t.occurred_at).getMonth();
    if (t.kind === "expense") expenses[m] += t.amount;
    else incomes[m] += t.amount;
  });

  const pieEntries = Object.entries(summary.by_category || {}).sort((a, b) => b[1] - a[1]);

  if (charts.bar) charts.bar.destroy();
  if (charts.line) charts.line.destroy();
  charts.bar = new Chart(document.getElementById("barChart"), {
    type: "bar",
    data: { labels: monthLabels, datasets: [
      { label: "Tổng thu", data: incomes, backgroundColor: "#3b82f6", borderRadius: 3 },
      { label: "Tổng chi", data: expenses, backgroundColor: "#a8b4c8", borderRadius: 3 }
    ] },
    options: { maintainAspectRatio: false, plugins: { legend: { labels: { boxWidth: 14, usePointStyle: true } } }, scales: { x: { grid: { display: false } }, y: { ticks: { callback: v => `${Math.round(v / 1000000)}M` } } } }
  });

  charts.line = new Chart(document.getElementById("lineChart"), {
    type: "line",
    data: { labels: monthLabels, datasets: [
      { label: "Tổng thu", data: incomes, borderColor: "#2563eb", backgroundColor: "#2563eb", tension: 0.35, pointRadius: 3 },
      { label: "Tổng chi", data: expenses, borderColor: "#94a3b8", backgroundColor: "#94a3b8", tension: 0.35, pointRadius: 3 }
    ] },
    options: { maintainAspectRatio: false, plugins: { legend: { labels: { boxWidth: 14, usePointStyle: true } } }, scales: { x: { grid: { display: false } }, y: { ticks: { callback: v => `${Math.round(v / 1000000)}M` } } } }
  });

  renderPieChart("pieChart", "pieLegend", pieEntries, "pie");
}

function mountBudgetPanel(summary, budget) {
  const categories = Object.entries(summary.by_category || {}).sort((a,b) => b[1]-a[1]).slice(0,4);
  const limit = budget.monthly_limit || 1;
  const tones = ["green", "blue", "purple", "orange"];
  const icons = ["bi-egg-fried", "bi-car-front", "bi-bag", "bi-receipt"];
  const barColors = ["#16a34a", "#2563eb", "#9333ea", "#f97316"];
  const softColors = ["#dcfce7", "#dbeafe", "#f3d8ff", "#ffedd5"];
  document.getElementById("budgetPanel").innerHTML = categories.map(([name, val], index) => {
    const pct = Math.min(100, Math.round((val / limit) * 100));
    return `
      <div class="budget-row" style="--bar-color:${barColors[index % barColors.length]}; --bar-soft:${softColors[index % softColors.length]}">
        <div class="budget-icon ${tones[index % tones.length]}"><i class="bi ${icons[index % icons.length]}"></i></div>
        <div class="budget-main">
          <div class="budget-head"><b>${name}</b><span>${vnd(val)} / ${vnd(limit)}</span></div>
          <div class="budget-line">
            <div class="progress"><i style="width:${pct}%"></i></div>
            <b class="budget-pct">${pct}%</b>
          </div>
        </div>
      </div>
    `;
  }).join("") || "<p>Chưa có dữ liệu ngân sách theo danh mục.</p>";
}

async function loadDashboard() {
  const [summary, budget, txs] = await Promise.all([
    call("/stats/summary?period=month", { headers: headers() }),
    call("/budget", { headers: headers() }),
    call("/transactions", { headers: headers() })
  ]);

  mountKpis(summary, budget);
  drawCharts(summary, txs);
  mountBudgetPanel(summary, budget);

  document.getElementById("txTable").innerHTML = txs.slice(0, 10).map(tRow => `
    <tr>
      <td>${new Date(tRow.occurred_at).toLocaleDateString("vi-VN")}</td>
      <td>${tRow.note || "-"}</td>
      <td>${tRow.category}</td>
      <td><span class="tx-type ${tRow.kind === "expense" ? "expense" : "income"}">${tRow.kind === "expense" ? "↓ Chi" : "↑ Thu"}</span></td>
      <td style="color:${tRow.kind === "expense" ? "#dc2626" : "#16a34a"}">${tRow.kind === "expense" ? "-" : "+"}${vnd(tRow.amount)}</td>
      <td>${tRow.kind === "expense" ? "Ví MoMo" : "Vietcombank"}</td>
      <td><button class="tx-menu" onclick="delTx(${tRow.id})"><i class="bi bi-three-dots-vertical"></i></button></td>
    </tr>
  `).join("");
}

async function loadTransactions() {
  const [rows, budget] = await Promise.all([
    call("/transactions", { headers: headers() }),
    call("/budget", { headers: headers() })
  ]);
  const tableBody = document.getElementById("txTableBody");
  if (tableBody) {
    tableBody.innerHTML = rows.map(r => {
      const status = r.note ? "pending" : "done";
      const account = r.kind === "expense" ? "Ví MoMo" : "Vietcombank";
      return `
        <tr>
          <td>${new Date(r.occurred_at).toLocaleDateString("vi-VN")}</td>
          <td>${r.note || "-"}</td>
          <td>${r.category || "-"}</td>
          <td><span class="tx-type ${r.kind === "expense" ? "expense" : "income"}">${r.kind === "expense" ? "↓ Chi" : "↑ Thu"}</span></td>
          <td>${account}</td>
          <td style="color:${r.kind === "expense" ? "#dc2626" : "#16a34a"}">${r.kind === "expense" ? "-" : "+"}${vnd(r.amount)}</td>
          <td><span class="tx-status ${status}">${status === "done" ? "Hoàn tất" : "Chờ xử lý"}</span></td>
          <td><button class="tx-menu" onclick="delTx(${r.id})"><i class="bi bi-three-dots-vertical"></i></button></td>
        </tr>
      `;
    }).join("");
  }

  const txTotalCount = document.getElementById("txTotalCount");
  const txIncomeTotal = document.getElementById("txIncomeTotal");
  const txExpenseTotal = document.getElementById("txExpenseTotal");
  const txPendingCount = document.getElementById("txPendingCount");
  const incomeTotal = rows.filter(r => r.kind === "income").reduce((sum, r) => sum + (r.amount || 0), 0);
  const expenseTotal = rows.filter(r => r.kind === "expense").reduce((sum, r) => sum + (r.amount || 0), 0);
  if (txTotalCount) txTotalCount.textContent = `${rows.length} giao dịch`;
  if (txIncomeTotal) txIncomeTotal.textContent = vnd(incomeTotal);
  if (txExpenseTotal) txExpenseTotal.textContent = vnd(expenseTotal);
  if (txPendingCount) txPendingCount.textContent = `${Math.max(0, Math.min(2, Math.floor(rows.length / 40)))} giao dịch`;

  const recurringRoot = document.getElementById("txRecurringList");
  if (recurringRoot) {
    recurringRoot.innerHTML = rows.filter(r => r.kind === "expense").slice(0, 4).map((r, index) => `
      <div class="tx-mini-item">
        <div class="tx-mini-icon"><i class="bi bi-${["receipt", "clock-history", "music-note", "shop"][index % 4]}"></i></div>
        <div><strong>${r.category || "Giao dịch định kỳ"}</strong><span>Ngày ${new Date(r.occurred_at).getDate()} hàng tháng</span></div>
        <div class="tx-mini-amount">-${vnd(r.amount)}</div>
      </div>
    `).join("");
  }

  const similarRoot = document.getElementById("txSimilarList");
  if (similarRoot) {
    similarRoot.innerHTML = rows.slice(0, 3).map(r => `
      <div class="tx-mini-item">
        <div class="tx-mini-icon"><i class="bi bi-${r.kind === "expense" ? "arrow-down-left" : "arrow-up-right"}"></i></div>
        <div><strong>${r.note || r.category || "Giao dịch"}</strong><span>${new Date(r.occurred_at).toLocaleDateString("vi-VN")}</span></div>
        <div class="tx-mini-amount" style="color:${r.kind === "expense" ? "#dc2626" : "#16a34a"}">${r.kind === "expense" ? "-" : "+"}${vnd(r.amount)}</div>
      </div>
    `).join("");
  }

  const categoryFilter = document.getElementById("txCategoryFilter");
  if (categoryFilter) {
    const categories = [...new Set(rows.map(r => r.category).filter(Boolean))];
    categoryFilter.innerHTML = `<option value="">Danh mục: Tất cả</option>` + categories.map(c => `<option value="${c}">${c}</option>`).join("");
  }

  const accountFilter = document.getElementById("txAccountFilter");
  if (accountFilter && accountFilter.options.length <= 1) {
    accountFilter.innerHTML = `<option value="">Tài khoản: Tất cả</option><option value="Ví MoMo">Ví MoMo</option><option value="Vietcombank">Vietcombank</option><option value="ZaloPay">ZaloPay</option>`;
  }

  const txList = document.getElementById("txList");
  if (txList) {
    txList.innerHTML = rows.map(r => `<li>${new Date(r.occurred_at).toLocaleString("vi-VN")} - ${r.category} - ${vnd(r.amount)} (${r.kind === "expense" ? "Chi" : "Thu"})</li>`).join("");
  }

  const expenseEntries = Object.entries(rows.filter(r => r.kind === "expense").reduce((acc, r) => {
    acc[r.category] = (acc[r.category] || 0) + (r.amount || 0);
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);
  renderPieChart("txPieChart", "txPieLegend", expenseEntries, "txPie");

  const relatedRoot = document.getElementById("txBudgetRelated");
  if (relatedRoot) {
    const top = expenseEntries[0] || ["Ăn uống", 0];
    const pct = Math.min(100, Math.round((top[1] / ((budget && budget.monthly_limit) || 1)) * 100));
    relatedRoot.innerHTML = `
      <div class="budget-row" style="--bar-color:#16a34a; --bar-soft:#dcfce7">
        <div class="budget-icon green"><i class="bi bi-egg-fried"></i></div>
        <div class="budget-main">
          <div class="budget-head"><b>${top[0]}</b><span>${vnd(top[1])} / ${vnd((budget && budget.monthly_limit) || 0)}</span></div>
          <div class="budget-line">
            <div class="progress"><i style="width:${pct}%"></i></div>
            <b class="budget-pct">${pct}%</b>
          </div>
        </div>
      </div>
    `;
  }
}

window.delTx = async (id) => {
  await call(`/transactions/${id}`, { method: "DELETE", headers: headers() });
  await Promise.all([loadDashboard(), loadTransactions(), loadStats()]);
};

async function loadStats() {
  const [txs, budget] = await Promise.all([
    call("/transactions", { headers: headers() }),
    call("/budget", { headers: headers() })
  ]);
  statsCache = { txs, budget };
  syncStatsFilterOptions(txs);
  renderStatsDashboard();
}

function syncStatsFilterOptions(txs) {
  const categorySelect = document.getElementById("statsCategorySelect");
  const accountSelect = document.getElementById("statsAccountSelect");
  if (categorySelect) {
    const current = categorySelect.value;
    const categories = [...new Set(txs.map(tx => tx.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi"));
    categorySelect.innerHTML = `<option value="">Danh mục: Tất cả</option>` + categories.map(c => `<option value="${c}">${c}</option>`).join("");
    if (categories.includes(current)) categorySelect.value = current;
  }
  if (accountSelect) {
    const current = accountSelect.value;
    const accounts = [...new Set(txs.map(tx => tx.account || (tx.kind === "expense" ? "Ví MoMo" : "Vietcombank")).filter(Boolean))];
    const fallback = accounts.length ? accounts : ["Ví MoMo", "Vietcombank", "ZaloPay"];
    accountSelect.innerHTML = `<option value="">Tài khoản: Tất cả</option>` + fallback.map(a => `<option value="${a}">${a}</option>`).join("");
    if (fallback.includes(current)) accountSelect.value = current;
  }
}

function mountStatsKpis(period, current, previous) {
  const diff = current.expense - previous.expense;
  const incomeDiff = current.income - previous.income;
  const savingsDiff = current.balance - previous.balance;
  const comparePct = previous.expense ? Math.round(((current.expense - previous.expense) / previous.expense) * 100) : (current.expense ? 100 : 0);
  const periodText = periodDisplayName(period);
  const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  setText("statsKpiExpenseTitle", `Tổng chi ${periodText} này`);
  setText("statsKpiIncomeTitle", `Tổng thu ${periodText} này`);
  setText("statsKpiSavingsTitle", "Tiết kiệm");
  setText("statsKpiCompareTitle", `So với kỳ trước`);
  setText("statsKpiExpense", vnd(current.expense));
  setText("statsKpiIncome", vnd(current.income));
  setText("statsKpiSavings", vnd(current.balance));
  setText("statsKpiCompare", `${comparePct >= 0 ? "+" : ""}${comparePct}%`);
  setText("statsKpiCompareNote", diff >= 0 ? `Chi tiêu tăng ${Math.abs(comparePct)}%` : `Chi tiêu giảm ${Math.abs(comparePct)}%`);
  const expenseTrend = document.getElementById("statsKpiExpenseTrend");
  const incomeTrend = document.getElementById("statsKpiIncomeTrend");
  const savingsTrend = document.getElementById("statsKpiSavingsTrend");
  if (expenseTrend) expenseTrend.textContent = `${diff >= 0 ? "↑" : "↓"} ${Math.abs(previous.expense ? Math.round((diff / previous.expense) * 100) : 0)}%`;
  if (incomeTrend) incomeTrend.textContent = `${incomeDiff >= 0 ? "↑" : "↓"} ${Math.abs(previous.income ? Math.round((incomeDiff / previous.income) * 100) : 0)}%`;
  if (savingsTrend) savingsTrend.textContent = `${savingsDiff >= 0 ? "↑" : "↓"} ${Math.abs(previous.balance ? Math.round((savingsDiff / previous.balance) * 100) : 0)}%`;
}

function renderStatsCharts(period, txs, filteredRows) {
  const barSeries = buildPeriodSeries(filteredRows, period);
  if (charts.statsBar) charts.statsBar.destroy();
  if (charts.statsLine) charts.statsLine.destroy();
  charts.statsBar = new Chart(document.getElementById("statsBarChart"), {
    type: "bar",
    data: {
      labels: barSeries.labels,
      datasets: [
        { label: "Thu nhập", data: barSeries.income, backgroundColor: "#2563eb", borderRadius: 4, barPercentage: 0.55, categoryPercentage: 0.68 },
        { label: "Chi tiêu", data: barSeries.expense, backgroundColor: "#d1d9e8", borderRadius: 4, barPercentage: 0.55, categoryPercentage: 0.68 }
      ]
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { position: "top", labels: { usePointStyle: true, boxWidth: 12 } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#5b6781", font: { size: 11, weight: 700 } } },
        y: { grid: { color: "#ecf1f8" }, ticks: { color: "#5b6781", callback: v => `${Math.round(v / 1000000)}M` } }
      }
    }
  });

  const expenseOnly = buildPeriodSeries(filteredRows, period, r => r.amount || 0, r => r.kind === "expense");
  if (charts.statsLine) charts.statsLine.destroy();
  charts.statsLine = new Chart(document.getElementById("statsLineChart"), {
    type: "line",
    data: {
      labels: expenseOnly.labels,
      datasets: [
        { label: "Chi tiêu", data: expenseOnly.expense, borderColor: "#2563eb", backgroundColor: "#2563eb", tension: 0.35, pointRadius: 3, pointBackgroundColor: "#fff", pointBorderColor: "#2563eb", borderWidth: 3 }
      ]
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#5b6781", font: { size: 11, weight: 700 } } },
        y: { grid: { color: "#ecf1f8" }, ticks: { color: "#5b6781", callback: v => `${Math.round(v / 1000000)}M` } }
      }
    }
  });
}

function renderStatsPie(filteredRows) {
  const expenseEntries = Object.entries(filteredRows.filter(r => r.kind === "expense").reduce((acc, r) => {
    const key = r.category || "Khác";
    acc[key] = (acc[key] || 0) + (r.amount || 0);
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);
  renderPieChart("statsPieChart", "statsPieLegend", expenseEntries, "statsPie");
  return expenseEntries;
}

function renderStatsCompare(period, currentRows, previousRows) {
  const current = summarizeRows(currentRows);
  const previous = summarizeRows(previousRows);
  const entries = Object.entries({
    ...(previous.by_category || {}),
    ...(current.by_category || {})
  })
    .map(([category]) => {
      const cur = current.by_category[category] || 0;
      const prev = previous.by_category[category] || 0;
      return { category, cur, prev, change: prev ? Math.round(((cur - prev) / prev) * 100) : (cur ? 100 : 0) };
    })
    .sort((a, b) => b.cur - a.cur)
    .slice(0, 5);
  const maxValue = Math.max(...entries.map(e => Math.max(e.cur, e.prev)), 1);
  const icons = { "Ăn uống": "bi-egg-fried", "Đi lại": "bi-car-front", "Mua sắm": "bi-bag", "Hóa đơn": "bi-receipt", "Giải trí": "bi-controller", "Khác": "bi-dot" };
  const root = document.getElementById("statsCompareList");
  if (!root) return;
  root.innerHTML = entries.map((e, idx) => {
    const toneColors = ["#16a34a", "#2563eb", "#f97316", "#9333ea", "#64748b"];
    const color = toneColors[idx % toneColors.length];
    return `
      <div class="stats-compare-row">
        <div class="stats-compare-left">
          <div class="budget-icon ${idx % 2 === 0 ? "green" : "blue"}"><i class="bi ${icons[e.category] || "bi-pie-chart"}"></i></div>
          <div>
            <strong>${e.category}</strong>
            <span>${vnd(e.cur)}</span>
          </div>
        </div>
        <div class="stats-compare-bars">
          <div class="stats-compare-bar">
            <span class="stats-compare-label">Kỳ này</span>
            <div class="progress"><i style="width:${Math.max(6, Math.round((e.cur / maxValue) * 100))}%; background:${color}"></i></div>
            <b>${vnd(e.cur)}</b>
          </div>
          <div class="stats-compare-bar muted">
            <span class="stats-compare-label">Kỳ trước</span>
            <div class="progress"><i style="width:${Math.max(6, Math.round((e.prev / maxValue) * 100))}%; background:#cbd5e1"></i></div>
            <b>${vnd(e.prev)}</b>
          </div>
        </div>
        <div class="stats-compare-change ${e.change >= 0 ? "up" : "down"}">${e.change >= 0 ? "↑" : "↓"} ${Math.abs(e.change)}%</div>
      </div>
    `;
  }).join("");
}

function renderStatsBudget(summary, budget) {
  const entries = Object.entries(summary.by_category || {}).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const limit = Math.max(1, budget?.monthly_limit || summary.expense || 1);
  const icons = ["bi-egg-fried", "bi-car-front", "bi-bag", "bi-receipt"];
  const tones = [
    { color: "#16a34a", soft: "#dcfce7", tone: "green" },
    { color: "#2563eb", soft: "#dbeafe", tone: "blue" },
    { color: "#f97316", soft: "#ffedd5", tone: "orange" },
    { color: "#9333ea", soft: "#f3d8ff", tone: "purple" }
  ];
  const root = document.getElementById("statsBudgetPanel");
  if (!root) return;
  root.innerHTML = entries.map(([name, val], idx) => {
    const tone = tones[idx % tones.length];
    const pct = Math.min(100, Math.round((val / limit) * 100));
    return `
      <div class="budget-row" style="--bar-color:${tone.color}; --bar-soft:${tone.soft}">
        <div class="budget-icon ${tone.tone}"><i class="bi ${icons[idx % icons.length]}"></i></div>
        <div class="budget-main">
          <div class="budget-head"><b>${name}</b><span>${vnd(val)} / ${vnd(limit)}</span></div>
          <div class="budget-line">
            <div class="progress"><i style="width:${pct}%"></i></div>
            <b class="budget-pct">${pct}%</b>
          </div>
        </div>
      </div>
    `;
  }).join("") || `<p class="empty-note">Chưa có dữ liệu ngân sách theo danh mục.</p>`;
}

function renderStatsAnalysis(period, currentRows, previousRows) {
  const currentSummary = summarizeRows(currentRows);
  const previousSummary = summarizeRows(previousRows);
  const categories = Object.entries(currentSummary.by_category || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const body = document.getElementById("statsAnalysisBody");
  if (!body) return;
  const periodNow = new Date();
  body.innerHTML = categories.map(([category, total]) => {
    const rows = currentRows.filter(r => (r.category || "Khác") === category);
    const txCount = rows.length;
    const avg = txCount ? total / txCount : 0;
    const prev = previousSummary.by_category[category] || 0;
    const change = prev ? Math.round(((total - prev) / prev) * 100) : (total ? 100 : 0);
    const trendValues = trendValuesForCategory(currentRows, category, period, periodNow);
    return `
      <tr>
        <td><span class="stats-cat-pill">${category}</span></td>
        <td>${txCount}</td>
        <td>${vnd(total)}</td>
        <td>${vnd(avg)}</td>
        <td class="${change >= 0 ? "up" : "down"}">${change >= 0 ? "↑" : "↓"} ${Math.abs(change)}%</td>
        <td>${sparkline(trendValues, change >= 0 ? "#ef4444" : "#2563eb")}</td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="6" class="empty-note">Chưa có dữ liệu để phân tích.</td></tr>`;
}

function renderStatsInsights(currentSummary, previousSummary, budget, expenseEntries) {
  const root = document.getElementById("statsInsightList");
  if (!root) return;
  const topCategory = expenseEntries[0]?.[0] || Object.keys(currentSummary.by_category || {})[0] || "Chưa có";
  const topValue = expenseEntries[0]?.[1] || 0;
  const share = currentSummary.expense ? Math.round((topValue / currentSummary.expense) * 100) : 0;
  const budgetUsage = budget?.monthly_limit ? Math.round((currentSummary.expense / budget.monthly_limit) * 100) : 0;
  const notes = [];
  notes.push({
    icon: "bi-graph-up-arrow",
    tone: currentSummary.expense > previousSummary.expense ? "orange" : "green",
    title: currentSummary.expense > previousSummary.expense ? `Chi tiêu ${getPeriodLabel(getSelectedStatsPeriod())} này tăng` : `Chi tiêu đang ổn định`,
    text: currentSummary.expense > previousSummary.expense
      ? `Danh mục ${topCategory} đang chiếm ${share}% tổng chi.`
      : `Chi tiêu ${getPeriodLabel(getSelectedStatsPeriod())} này chưa có dấu hiệu tăng mạnh.`
  });
  notes.push({
    icon: "bi-pie-chart",
    tone: "blue",
    title: `Danh mục lớn nhất: ${topCategory}`,
    text: `Đây là danh mục chiếm ${share}% tổng chi, tương đương ${vnd(topValue)}.`
  });
  notes.push({
    icon: budgetUsage > 80 ? "bi-exclamation-triangle" : "bi-shield-check",
    tone: budgetUsage > 80 ? "red" : "green",
    title: budgetUsage > 80 ? "Ngân sách sắp chạm ngưỡng" : "Ngân sách còn an toàn",
    text: budgetUsage > 80
      ? `Bạn đã dùng khoảng ${budgetUsage}% ngân sách tháng này.`
      : `Bạn mới sử dụng ${budgetUsage}% ngân sách tháng này.`
  });
  root.innerHTML = notes.map(note => `
    <div class="stats-insight">
      <div class="stats-insight-icon ${note.tone}"><i class="bi ${note.icon}"></i></div>
      <div>
        <strong>${note.title}</strong>
        <span>${note.text}</span>
      </div>
    </div>
  `).join("");
}

function renderStatsDashboard() {
  const period = getSelectedStatsPeriod();
  const filteredRows = filterStatsRows(statsCache.txs || []);
  const now = new Date();
  const { currentStart, currentEnd, prevStart, prevEnd } = getPeriodWindows(period, now);
  const currentRows = filteredRows.filter(row => {
    const d = new Date(row.occurred_at);
    return isSameOrAfter(d, currentStart) && isBefore(d, currentEnd);
  });
  const previousRows = filteredRows.filter(row => {
    const d = new Date(row.occurred_at);
    return isSameOrAfter(d, prevStart) && isBefore(d, prevEnd);
  });
  const currentSummary = summarizeRows(currentRows);
  const previousSummary = summarizeRows(previousRows);
  const expenseEntries = renderStatsPie(currentRows);

  mountStatsKpis(period, currentSummary, previousSummary);
  renderStatsCharts(period, currentRows, filteredRows);
  renderStatsCompare(period, currentRows, previousRows);
  renderStatsBudget(currentSummary, statsCache.budget || {});
  renderStatsAnalysis(period, currentRows, previousRows);
  renderStatsInsights(currentSummary, previousSummary, statsCache.budget || {}, expenseEntries);
}

function bindGroupSelects(groups) {
  const txGroup = document.getElementById("txGroup");
  const memberGroup = document.getElementById("memberGroup");
  const options = [`<option value="">Không thuộc nhóm</option>`].concat(groups.map(g => `<option value="${g.id}">${g.name}</option>`)).join("");
  txGroup.innerHTML = options;
  memberGroup.innerHTML = groups.map(g => `<option value="${g.id}">${g.name}</option>`).join("");
}

async function loadGroups() {
  const groups = await call("/groups", { headers: headers() });
  groupCache = groups;
  document.getElementById("groupList").innerHTML = groups.map(g => `<li>${g.name} (${g.role})</li>`).join("");
  bindGroupSelects(groups);
  if (groups.length) await loadGroupMembers(groups[0].id);
}

async function loadGroupMembers(groupId) {
  if (!groupId) {
    document.getElementById("memberList").innerHTML = "";
    return;
  }
  const members = await call(`/groups/${groupId}/members`, { headers: headers() });
  document.getElementById("memberList").innerHTML = members.map(m => `<li>${m.full_name} (${m.email}) - ${m.role}</li>`).join("");
}

async function loadReminders() {
  const rs = await call("/reminders", { headers: headers() });
  document.getElementById("reminderList").innerHTML = rs.map(r => `<li>${r.title} - ngày ${r.due_day}</li>`).join("");
}

async function loadProfile() {
  const me = await call("/me", { headers: headers() });
  document.getElementById("profileName").value = me.full_name || "";
  document.getElementById("profilePhone").value = me.phone || "";
  document.getElementById("profile2fa").checked = !!me.two_factor_enabled;
  const toggle2fa = document.getElementById("profile2faToggle");
  if (toggle2fa) toggle2fa.checked = !!me.two_factor_enabled;
  document.getElementById("profileNameDisplay").textContent = me.full_name || "Minh Nguyễn";
  document.getElementById("profileEmailDisplay").textContent = me.email || "minh.nguyen@gmail.com";
  document.getElementById("profilePhoneDisplay").textContent = me.phone || "0901 234 567";
  const browserLang = (navigator.language || "vi").startsWith("vi") ? "vi" : "en";
  const lang = localStorage.getItem("lang_user") || localStorage.getItem("lang_guest") || browserLang;
  if (languageSelect) languageSelect.value = lang;
  setProfileEditMode(false);
}

async function loadAll() {
  await Promise.all([loadDashboard(), loadTransactions(), loadStats(), loadGroups(), loadReminders(), loadProfile()]);
}

function showTransactionView(mode) {
  const listView = document.getElementById("transactionsListView");
  const createView = document.getElementById("transactionsCreateView");
  if (listView) {
    listView.classList.toggle("active", mode === "list");
    listView.classList.toggle("hidden", mode === "create");
  }
  if (createView) {
    createView.classList.toggle("active", mode === "create");
    createView.classList.toggle("hidden", mode === "list");
  }
  if (mode === "list" && charts.txPie) {
    requestAnimationFrame(() => charts.txPie.resize());
  }
}

function syncTxKind(kind) {
  const hidden = document.getElementById("txKind");
  if (hidden) hidden.value = kind;
  document.querySelectorAll(".tx-kind-tab[data-kind]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.kind === kind);
  });
  updateTxSummary();
}

function updateTxSummary() {
  const kind = document.getElementById("txKind")?.value || "expense";
  const category = document.getElementById("txCategory")?.value || "Ăn uống";
  const account = document.getElementById("txAccount")?.value || "Ví MoMo";
  const dateVal = document.getElementById("txDate")?.value;
  const amount = Number(document.getElementById("txAmount")?.value || 0);
  const summaryKind = document.getElementById("txSummaryKind");
  const summaryCategory = document.getElementById("txSummaryCategory");
  const summaryAccount = document.getElementById("txSummaryAccount");
  const summaryDate = document.getElementById("txSummaryDate");
  const summaryAmount = document.getElementById("txSummaryAmount");
  if (summaryKind) summaryKind.textContent = kind === "income" ? "Thu nhập" : "Chi tiêu";
  if (summaryCategory) summaryCategory.textContent = category;
  if (summaryAccount) summaryAccount.textContent = account;
  if (summaryDate) summaryDate.textContent = dateVal ? new Date(dateVal).toLocaleDateString("vi-VN") : "19/05/2024";
  if (summaryAmount) summaryAmount.textContent = `${kind === "income" ? "+" : "-"}${vnd(amount)}`;
}

function activateMainTab(tab) {
  document.querySelectorAll(".left-nav button[data-tab]").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === tab);
  });
  document.querySelectorAll(".tab").forEach(section => {
    const isActive = section.id === tab;
    section.classList.toggle("active", isActive);
    section.classList.toggle("hidden", !isActive);
  });
  if (tab !== "transactions") showTransactionView("list");
}

document.getElementById("registerBtn").onclick = () => setAuthMode("register");
document.getElementById("loginBtn").onclick = () => setAuthMode("login");
document.getElementById("authPrimaryBtn").onclick = () => auth(authMode === "login" ? "login" : "register").catch(e => alert(e.message));
document.getElementById("switchToRegister").onclick = (e) => {
  e.preventDefault();
  setAuthMode(authMode === "login" ? "register" : "login");
};
const passwordInput = document.getElementById("password");
const eyeIcon = document.querySelector(".field-wrap .bi-eye");
if (passwordInput && eyeIcon) {
  eyeIcon.style.cursor = "pointer";
  eyeIcon.onclick = () => {
    const isHidden = passwordInput.type === "password";
    passwordInput.type = isHidden ? "text" : "password";
    eyeIcon.classList.toggle("bi-eye", !isHidden);
    eyeIcon.classList.toggle("bi-eye-slash", isHidden);
  };
}
document.getElementById("logoutBtn").onclick = () => { token = ""; localStorage.removeItem("token"); switchAuthUi(); };

document.getElementById("addTx").onclick = async () => {
  const dateVal = document.getElementById("txDate").value;
  const payload = {
    kind: document.getElementById("txKind").value,
    category: document.getElementById("txCategory").value,
    amount: Number(document.getElementById("txAmount").value),
    note: document.getElementById("txNote").value,
    group_id: document.getElementById("txGroup").value ? Number(document.getElementById("txGroup").value) : null,
    occurred_at: dateVal ? new Date(dateVal).toISOString() : null
  };
  await call("/transactions", { method: "POST", headers: headers(), body: JSON.stringify(payload) });
  await loadAll();
  showTransactionView("list");
};

document.getElementById("createGroup").onclick = async () => {
  await call("/groups", { method: "POST", headers: headers(), body: JSON.stringify({ name: document.getElementById("groupName").value }) });
  await loadGroups();
};

document.getElementById("memberGroup").onchange = (e) => loadGroupMembers(e.target.value);

document.getElementById("addMemberBtn").onclick = async () => {
  const groupId = document.getElementById("memberGroup").value;
  if (!groupId) return;
  await call(`/groups/${groupId}/members`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ email: document.getElementById("memberEmail").value, role: "member" })
  });
  await loadGroupMembers(groupId);
};

const saveProfileBtn = document.getElementById("saveProfile");
if (saveProfileBtn) {
  saveProfileBtn.onclick = async () => {
    const form = document.querySelector(".settings-form");
    const editing = form && !form.classList.contains("hidden");
    if (!editing) {
      setProfileEditMode(true);
      const firstField = document.getElementById("profileName");
      if (firstField) firstField.focus();
      return;
    }
    const twoFactor = !!document.getElementById("profile2faToggle")?.checked || !!document.getElementById("profile2fa").checked;
    await call("/me", {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({
        full_name: document.getElementById("profileName").value,
        phone: document.getElementById("profilePhone").value,
        two_factor_enabled: twoFactor
      })
    });
    const name = document.getElementById("profileName").value || "Minh Nguyễn";
    const phone = document.getElementById("profilePhone").value || "0901 234 567";
    document.getElementById("profileNameDisplay").textContent = name;
    document.getElementById("profilePhoneDisplay").textContent = phone;
    document.getElementById("profile2fa").checked = twoFactor;
    const toggle2fa = document.getElementById("profile2faToggle");
    if (toggle2fa) toggle2fa.checked = twoFactor;
    setProfileEditMode(false);
    alert("Đã lưu hồ sơ");
  };
}

const languageSelectEl = document.getElementById("languageSelect");
if (languageSelectEl) {
  const savedLang = localStorage.getItem("lang_user") || localStorage.getItem("lang_guest") || ((navigator.language || "vi").startsWith("vi") ? "vi" : "en");
  languageSelectEl.value = savedLang;
  languageSelectEl.onchange = () => {
    localStorage.setItem("lang_user", languageSelectEl.value);
  };
}

document.querySelectorAll(".tx-kind-tab[data-kind]").forEach(btn => {
  btn.addEventListener("click", () => {
    syncTxKind(btn.dataset.kind);
    updateTxSummary();
  });
});

["txKind", "txCategory", "txAccount", "txDate", "txAmount"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("input", updateTxSummary);
  if (el) el.addEventListener("change", updateTxSummary);
});

const openTxCreateBtn = document.getElementById("openTxCreateBtn");
const openTxCreateLink = document.getElementById("openTxCreateLink");
const backToTxListBtn = document.getElementById("backToTxListBtn");
const quickAddTxBtn = document.getElementById("quickAddTx");
const openTxCreate = () => {
  showTransactionView("create");
  if (!document.getElementById("txDate").value) {
    const today = new Date();
    document.getElementById("txDate").value = today.toISOString().slice(0, 10);
  }
  syncTxKind(document.getElementById("txKind").value || "expense");
  updateTxSummary();
};
if (openTxCreateBtn) openTxCreateBtn.onclick = openTxCreate;
if (openTxCreateLink) openTxCreateLink.onclick = (e) => { e.preventDefault(); openTxCreate(); };
if (backToTxListBtn) backToTxListBtn.onclick = () => showTransactionView("list");
if (quickAddTxBtn) quickAddTxBtn.onclick = openTxCreate;

syncTxKind(document.getElementById("txKind")?.value || "expense");
updateTxSummary();

const profile2faForm = document.getElementById("profile2fa");
const profile2faToggle = document.getElementById("profile2faToggle");
if (profile2faForm && profile2faToggle) {
  profile2faForm.addEventListener("change", () => {
    profile2faToggle.checked = profile2faForm.checked;
  });
  profile2faToggle.addEventListener("change", () => {
    profile2faForm.checked = profile2faToggle.checked;
  });
}

const saveBudgetBtn = document.getElementById("saveBudget");
if (saveBudgetBtn) {
  saveBudgetBtn.onclick = async () => {
    await call("/budget", { method: "POST", headers: headers(), body: JSON.stringify({ monthly_limit: Number(document.getElementById("budget").value), alert_enabled: true }) });
    await loadDashboard();
  };
}

const addReminderBtn = document.getElementById("addReminder");
if (addReminderBtn) {
  addReminderBtn.onclick = async () => {
    await call("/reminders", { method: "POST", headers: headers(), body: JSON.stringify({ title: document.getElementById("reminderTitle").value, due_day: Number(document.getElementById("reminderDay").value), active: true }) });
    await loadReminders();
  };
}

const statsPeriodSelect = document.getElementById("statsPeriodSelect");
if (statsPeriodSelect) {
  statsPeriodSelect.onchange = () => {
    setStatsPeriod(statsPeriodSelect.value);
    renderStatsDashboard();
  };
}
document.querySelectorAll(".stats-segment[data-period]").forEach(btn => {
  btn.onclick = () => {
    setStatsPeriod(btn.dataset.period);
    renderStatsDashboard();
  };
});
["statsSearchInput", "statsCategorySelect", "statsAccountSelect"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener(el.tagName === "INPUT" ? "input" : "change", () => renderStatsDashboard());
});
const statsExportBtn = document.getElementById("statsExportBtn");
if (statsExportBtn) {
  statsExportBtn.onclick = (e) => {
    e.preventDefault();
    downloadReport("pdf", "spendmate_stats.pdf").catch(err => alert(err.message));
  };
}
document.getElementById("exportExcel").onclick = (e) => { e.preventDefault(); downloadReport("excel", "spendmate_report.xlsx").catch(err => alert(err.message)); };
document.getElementById("exportPdf").onclick = (e) => { e.preventDefault(); downloadReport("pdf", "spendmate_report.pdf").catch(err => alert(err.message)); };

document.querySelectorAll(".left-nav button[data-tab]").forEach(btn => {
  btn.onclick = () => {
    activateMainTab(btn.getAttribute("data-tab"));
  };
});

switchAuthUi();
setAuthMode("login");
syncTxKind("expense");
activateMainTab("dashboard");

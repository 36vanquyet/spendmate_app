const API = "http://127.0.0.1:8000";
let token = localStorage.getItem("token") || "";
let charts = { bar: null, line: null, pie: null };
let groupCache = [];
let authMode = "login";

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

  const pieEntries = Object.entries(summary.by_category || {})
    .sort((a, b) => b[1] - a[1]);
  const pieLabels = pieEntries.map(([label]) => label);
  const pieValues = pieEntries.map(([, value]) => value);
  const pieTotal = pieValues.reduce((sum, v) => sum + v, 0) || 1;

  if (charts.bar) charts.bar.destroy();
  if (charts.line) charts.line.destroy();
  if (charts.pie) charts.pie.destroy();

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

  charts.pie = new Chart(document.getElementById("pieChart"), {
    type: "doughnut",
    data: {
      labels: pieLabels.length ? pieLabels : ["Chưa có"],
      datasets: [{ data: pieValues.length ? pieValues : [1], backgroundColor: ["#2563eb", "#35a66f", "#f5b014", "#9b5de5", "#a8b4c8"], borderWidth: 3 }]
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
          const value = pieValues[index] || 0;
          const pct = Math.round((value / pieTotal) * 100);
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

  const colors = ["#2563eb", "#35a66f", "#f5b014", "#9b5de5", "#a8b4c8"];
  document.getElementById("pieLegend").innerHTML = (pieLabels.length ? pieLabels : ["Chưa có"]).map((label, index) => {
    const value = pieValues[index] || 0;
    const pct = Math.round((value / pieTotal) * 100);
    return `
      <div class="pie-item">
        <span class="pie-swatch" style="background:${colors[index % colors.length]}"></span>
        <span class="pie-label">${label}</span>
        <span class="pie-stats">
          <span class="pie-value">${pct}%</span>
          <span class="pie-amount">${vnd(value)}</span>
        </span>
      </div>
    `;
  }).join("");
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
  const rows = await call("/transactions", { headers: headers() });
  document.getElementById("txList").innerHTML = rows.map(r => `<li>${new Date(r.occurred_at).toLocaleString("vi-VN")} - ${r.category} - ${vnd(r.amount)} (${r.kind === "expense" ? "Chi" : "Thu"})</li>`).join("");
}

window.delTx = async (id) => {
  await call(`/transactions/${id}`, { method: "DELETE", headers: headers() });
  await Promise.all([loadDashboard(), loadTransactions(), loadStats()]);
};

async function loadStats() {
  const p = document.getElementById("period").value;
  const s = await call(`/stats/summary?period=${p}`, { headers: headers() });
  document.getElementById("statsContent").textContent = JSON.stringify(s, null, 2);
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
}

async function loadAll() {
  await Promise.all([loadDashboard(), loadTransactions(), loadStats(), loadGroups(), loadReminders(), loadProfile()]);
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

document.getElementById("saveProfile").onclick = async () => {
  await call("/me", {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({
      full_name: document.getElementById("profileName").value,
      phone: document.getElementById("profilePhone").value,
      two_factor_enabled: document.getElementById("profile2fa").checked
    })
  });
  alert("Đã lưu tài khoản");
};

document.getElementById("saveBudget").onclick = async () => {
  await call("/budget", { method: "POST", headers: headers(), body: JSON.stringify({ monthly_limit: Number(document.getElementById("budget").value), alert_enabled: true }) });
  await loadDashboard();
};

document.getElementById("addReminder").onclick = async () => {
  await call("/reminders", { method: "POST", headers: headers(), body: JSON.stringify({ title: document.getElementById("reminderTitle").value, due_day: Number(document.getElementById("reminderDay").value), active: true }) });
  await loadReminders();
};

document.getElementById("period").onchange = loadStats;
document.getElementById("exportExcel").onclick = (e) => { e.preventDefault(); downloadReport("excel", "spendmate_report.xlsx").catch(err => alert(err.message)); };
document.getElementById("exportPdf").onclick = (e) => { e.preventDefault(); downloadReport("pdf", "spendmate_report.pdf").catch(err => alert(err.message)); };

document.querySelectorAll(".left-nav button[data-tab]").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".left-nav button[data-tab]").forEach(x => x.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.getAttribute("data-tab");
    document.querySelectorAll(".tab").forEach(tabs => tabs.classList.remove("active"));
    document.getElementById(tab).classList.add("active");
  };
});

switchAuthUi();
setAuthMode("login");

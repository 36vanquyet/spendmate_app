const API = "http://127.0.0.1:8000";
let token = localStorage.getItem("token") || "";
let charts = { bar: null, line: null, pie: null };
let groupCache = [];

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
    ["Tổng thu", summary.income, "+12% so với tháng trước"],
    ["Tổng chi", summary.expense, "-8% so với tháng trước"],
    ["Số dư", summary.balance, "Dòng tiền hiện tại"],
    ["Ngân sách", budget.monthly_limit || 0, budget.over_budget ? "Đang vượt mức" : "Trong ngân sách"]
  ];
  document.getElementById("kpiCards").innerHTML = cards.map(c => `
    <div class="kpi"><h4>${c[0]}</h4><p>${vnd(c[1])}</p><span>${c[2]}</span></div>
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

  const pieLabels = Object.keys(summary.by_category || {});
  const pieValues = Object.values(summary.by_category || {});

  if (charts.bar) charts.bar.destroy();
  if (charts.line) charts.line.destroy();
  if (charts.pie) charts.pie.destroy();

  charts.bar = new Chart(document.getElementById("barChart"), {
    type: "bar",
    data: { labels: monthLabels, datasets: [
      { label: "Thu", data: incomes, backgroundColor: "#9dc2ff" },
      { label: "Chi", data: expenses, backgroundColor: "#2563eb" }
    ] }
  });

  charts.line = new Chart(document.getElementById("lineChart"), {
    type: "line",
    data: { labels: monthLabels, datasets: [
      { label: "Thu", data: incomes, borderColor: "#1d4ed8", tension: 0.35 },
      { label: "Chi", data: expenses, borderColor: "#94a3b8", tension: 0.35 }
    ] }
  });

  charts.pie = new Chart(document.getElementById("pieChart"), {
    type: "doughnut",
    data: {
      labels: pieLabels.length ? pieLabels : ["Chưa có"],
      datasets: [{ data: pieValues.length ? pieValues : [1], backgroundColor: ["#2563eb", "#60a5fa", "#93c5fd", "#cbd5e1", "#3b82f6"] }]
    }
  });
}

function mountBudgetPanel(summary, budget) {
  const categories = Object.entries(summary.by_category || {}).sort((a,b) => b[1]-a[1]).slice(0,4);
  const limit = budget.monthly_limit || 1;
  document.getElementById("budgetPanel").innerHTML = categories.map(([name, val]) => {
    const pct = Math.min(100, Math.round((val / limit) * 100));
    return `<div class="budget-bar"><div class="budget-head"><b>${name}</b><span>${vnd(val)}</span></div><div class="progress"><i style="width:${pct}%"></i></div></div>`;
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
      <td>${tRow.category}</td>
      <td>${tRow.kind === "expense" ? "Chi" : "Thu"}</td>
      <td>${vnd(tRow.amount)}</td>
      <td>${tRow.note || ""}</td>
      <td><button onclick="delTx(${tRow.id})">Xóa</button></td>
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

document.getElementById("registerBtn").onclick = () => auth("register").catch(e => alert(e.message));
document.getElementById("loginBtn").onclick = () => auth("login").catch(e => alert(e.message));
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

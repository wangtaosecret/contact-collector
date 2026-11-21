(function () {
  "use strict";

  var TOKEN_KEY = "cc_admin_token";
  var tokenInput = document.getElementById("token");
  var errBox = document.getElementById("admin-error");
  var result = document.getElementById("result");
  var tbody = document.querySelector("#leads-table tbody");
  var countText = document.getElementById("count-text");
  var searchInput = document.getElementById("search");
  var allLeads = [];

  tokenInput.value = sessionStorage.getItem(TOKEN_KEY) || "";

  function showError(msg) {
    errBox.textContent = msg;
    errBox.hidden = false;
  }
  function clearError() {
    errBox.hidden = true;
    errBox.textContent = "";
  }

  function token() {
    var t = tokenInput.value.trim();
    sessionStorage.setItem(TOKEN_KEY, t);
    return t;
  }

  function esc(v) {
    if (v == null) return "";
    return String(v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtTime(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    function p(n) { return n < 10 ? "0" + n : String(n); }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
      " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  function render(list) {
    tbody.innerHTML = "";
    list.forEach(function (l) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td style='padding:10px 14px;border-bottom:1px solid var(--line);color:var(--muted)'>" + esc(l.id) + "</td>" +
        "<td style='padding:10px 14px;border-bottom:1px solid var(--line);white-space:nowrap'><strong>" + esc(l.name) + "</strong></td>" +
        "<td style='padding:10px 14px;border-bottom:1px solid var(--line);white-space:nowrap'>" + esc(l.phone) + "</td>" +
        "<td style='padding:10px 14px;border-bottom:1px solid var(--line)'>" + esc(l.email) + "</td>" +
        "<td style='padding:10px 14px;border-bottom:1px solid var(--line)'>" + esc(l.company) + "</td>" +
        "<td style='padding:10px 14px;border-bottom:1px solid var(--line);max-width:320px'>" + esc(l.message) + "</td>" +
        "<td style='padding:10px 14px;border-bottom:1px solid var(--line);white-space:nowrap;color:var(--muted)'>" + esc(fmtTime(l.created_at)) + "</td>";
      tbody.appendChild(tr);
    });
    countText.textContent = "共 " + list.length + " 条线索";
  }

  function load() {
    clearError();
    var t = token();
    if (!t) return showError("请输入管理员令牌");

    fetch("/api/leads", { headers: { "Authorization": "Bearer " + t } })
      .then(function (res) {
        return res.json().then(function (d) { return { ok: res.ok, data: d }; });
      })
      .then(function (r) {
        if (!r.ok || !r.data.ok) {
          throw new Error(r.data && r.data.error ? r.data.error : "加载失败");
        }
        allLeads = r.data.leads || [];
        render(allLeads);
        result.hidden = false;
      })
      .catch(function (err) {
        showError(err.message || "加载失败");
      });
  }

  document.getElementById("load-btn").addEventListener("click", load);
  tokenInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") load();
  });

  document.getElementById("csv-btn").addEventListener("click", function () {
    var t = token();
    if (!t) return showError("请输入管理员令牌");
    var a = document.createElement("a");
    a.href = "/api/leads.csv";
    // CSV 走同源 fetch 以带上 Authorization 头
    fetch("/api/leads.csv", { headers: { "Authorization": "Bearer " + t } })
      .then(function (res) {
        if (!res.ok) throw new Error("导出失败");
        return res.text();
      })
      .then(function (text) {
        var blob = new Blob([text], { type: "text/csv;charset=utf-8" });
        var url = URL.createObjectURL(blob);
        a.href = url;
        a.download = "leads.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      })
      .catch(function (err) { showError(err.message || "导出失败"); });
  });

  searchInput.addEventListener("input", function () {
    var q = searchInput.value.trim().toLowerCase();
    if (!q) return render(allLeads);
    var list = allLeads.filter(function (l) {
      return [l.name, l.phone, l.email, l.company, l.message]
        .filter(Boolean)
        .some(function (v) { return String(v).toLowerCase().indexOf(q) !== -1; });
    });
    render(list);
  });
})();

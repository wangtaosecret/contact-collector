(function () {
  "use strict";

  var form = document.getElementById("lead-form");
  var errBox = document.getElementById("form-error");
  var btn = document.getElementById("submit-btn");
  var successBox = document.getElementById("form-success");
  var messageEl = document.getElementById("message");
  var countEl = document.getElementById("char-count");

  document.getElementById("year").textContent = new Date().getFullYear();

  messageEl.addEventListener("input", function () {
    countEl.textContent = String(messageEl.value.length);
  });

  function showError(msg) {
    errBox.textContent = msg;
    errBox.hidden = false;
  }

  function clearError() {
    errBox.hidden = true;
    errBox.textContent = "";
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    clearError();

    var name = form.name.value.trim();
    var phone = form.phone.value.trim();
    var email = form.email.value.trim();
    var message = form.message.value.trim();

    if (!name) return showError("请填写您的姓名");
    if (!phone && !email) return showError("请至少留下手机号或邮箱其中一种联系方式");
    if (!message) return showError("请简单描述一下您的需求");

    btn.disabled = true;
    btn.textContent = "提交中…";

    fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name,
        phone: phone,
        email: email,
        company: form.company.value.trim(),
        topic: form.topic.value,
        message: message,
        source: form.source.value,
        website: form.website.value
      })
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (r) {
        if (!r.ok || !r.data.ok) {
          throw new Error(r.data && r.data.error ? r.data.error : "提交失败，请稍后重试");
        }
        document.getElementById("success-ref").textContent = r.data.ref || "-";
        form.hidden = true;
        successBox.hidden = false;
      })
      .catch(function (err) {
        showError(err.message || "提交失败，请稍后重试");
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = "提交信息";
      });
  });

  document.getElementById("again-btn").addEventListener("click", function () {
    form.reset();
    countEl.textContent = "0";
    successBox.hidden = true;
    form.hidden = false;
    clearError();
    document.getElementById("name").focus();
  });
})();

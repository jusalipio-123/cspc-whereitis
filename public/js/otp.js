// public/js/otp.js
// CSPC WhereITis — small helpers for the 6-digit email code pages.
//   * keeps only digits in the code box and (verify page) sends it when 6 are typed
//   * stops double submits
//   * counts down the "Resend code" button (the server enforces the real wait)
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    var forms = document.querySelectorAll('form[data-otp-form]');
    Array.prototype.forEach.call(forms, function (form) {
      form.addEventListener('submit', function () {
        var btn = form.querySelector('[data-submit]');
        if (!btn) return;
        var label = btn.getAttribute('data-busy-label');
        btn.disabled = true;
        if (label) btn.textContent = label;
      });
    });

    var inputs = document.querySelectorAll('[data-otp-input]');
    Array.prototype.forEach.call(inputs, function (input) {
      var sent = false;
      input.addEventListener('input', function () {
        var digits = input.value.replace(/\D/g, '').slice(0, 6);
        if (input.value !== digits) input.value = digits;
        if (digits.length === 6 && !sent && input.form && input.hasAttribute('data-autosubmit')) {
          sent = true;
          if (input.form.requestSubmit) input.form.requestSubmit();
          else input.form.submit();
        }
      });
      // Other scripts also set focus on load; run after them so the code box wins.
      setTimeout(function () { if (!input.value) input.focus(); }, 0);
    });

    var resend = document.querySelectorAll('[data-resend]');
    Array.prototype.forEach.call(resend, function (btn) {
      var left = parseInt(btn.getAttribute('data-wait'), 10) || 0;
      var label = btn.textContent;
      if (left <= 0) return;
      btn.disabled = true;
      (function tick() {
        if (left <= 0) { btn.disabled = false; btn.textContent = label; return; }
        btn.textContent = label + ' (' + left + 's)';
        left -= 1;
        setTimeout(tick, 1000);
      })();
    });
  });

  // Coming back with the Back button must not leave a button stuck on "Checking…".
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    var busy = document.querySelectorAll('form[data-otp-form] [data-submit][disabled]');
    Array.prototype.forEach.call(busy, function (b) { b.disabled = false; });
  });
})();

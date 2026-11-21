// public/js/verify-wait.js
// On the "Check your email" page: ask the server every few seconds whether this
// browser's pending email has been verified (from any device or tab) and, as soon
// as it has, go to the sign-in page. If the server says it is not tracking this
// browser (no waiting cookie), the script quietly does nothing.
(function () {
  var note = document.getElementById('verify-wait-status');
  if (!note) return;

  var INTERVAL_MS = 4000;
  var MAX_MS = 30 * 60 * 1000; // stop polling after 30 minutes on one page view
  var startedAt = Date.now();
  var timer = null;
  var busy = false;
  var done = false;

  function goToSignIn() {
    done = true;
    stop();
    note.hidden = false;
    note.style.fontWeight = '600';
    note.textContent = 'Account verified successfully! Taking you to sign in\u2026';
    // Leave the message on screen for a moment so it can be read, then continue.
    setTimeout(function () {
      window.location.replace('/sign-in?flash=ok:' + encodeURIComponent('Account verified successfully! Please sign in.'));
    }, 1500);
  }

  function check() {
    if (done || busy) return;
    busy = true;
    fetch('/check-email/status', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        busy = false;
        if (!data) return;
        if (!data.tracking) { stop(); return; }
        note.hidden = false;
        if (data.verified) goToSignIn();
      })
      .catch(function () { busy = false; });
  }

  function tick() {
    if (Date.now() - startedAt > MAX_MS) { stop(); return; }
    if (!document.hidden) check();
  }

  function start() {
    if (timer || done) return;
    timer = setInterval(tick, INTERVAL_MS);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  // Coming back to the tab (or the laptop waking up): check straight away.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { startedAt = Date.now(); start(); check(); }
  });
  window.addEventListener('focus', function () { check(); });

  check();
  start();
})();

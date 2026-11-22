// public/js/google-signin.js
// CSPC WhereITis — Google Identity Services button + callback.
// The official Google button is rendered into #google-btn. When Google returns
// an ID token we POST it to /auth/google, which verifies it server-side and
// sets the normal whereitis_id cookie before redirecting.
(function () {
  'use strict';

  function init() {
    var host = document.getElementById('google-btn');
    if (!host || host.dataset.ready === '1') return;
    if (!window.google || !google.accounts || !google.accounts.id) return;

    var meta = document.querySelector('meta[name="google-client-id"]');
    var clientId = meta && meta.content;
    if (!clientId) return;

    var next = host.getAttribute('data-next') || '';
    var errorEl = document.getElementById('google-error');

    google.accounts.id.initialize({
      client_id: clientId,
      callback: function (response) {
        if (errorEl) {
          errorEl.hidden = true;
          errorEl.textContent = '';
        }
        fetch('/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential: response.credential, next: next }),
        })
          .then(function (res) {
            return res.json().then(function (data) {
              return { status: res.status, data: data };
            });
          })
          .then(function (out) {
            if (!out.status || out.status >= 400 || !out.data.ok) {
              throw new Error((out.data && out.data.error) || 'Google sign-in failed.');
            }
            window.location.assign(out.data.redirect);
          })
          .catch(function (err) {
            if (errorEl) {
              errorEl.textContent = err.message || 'Google sign-in failed. Please try again.';
              errorEl.hidden = false;
            }
          });
      },
    });

    var width = Math.min(Math.max(host.clientWidth || 320, 220), 400);
    google.accounts.id.renderButton(host, {
      theme: 'outline',
      size: 'large',
      width: width,
      text: 'continue_with',
      shape: 'rectangular',
    });
    host.dataset.ready = '1';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // The external Google script is deferred but can still arrive late.
  var tries = 0;
  var timer = window.setInterval(function () {
    if (document.getElementById('google-btn') && document.getElementById('google-btn').dataset.ready === '1') {
      window.clearInterval(timer);
      return;
    }
    init();
    if (++tries >= 50) window.clearInterval(timer); // ~5 s, then stop trying
  }, 100);
})();

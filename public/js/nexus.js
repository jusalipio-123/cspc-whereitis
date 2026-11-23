// public/js/nexus.js
// Match scanner + pulse refresh for /nexus. The page already renders a
// working GET form and a static pulse; this only upgrades them.

(function () {
  'use strict';

  var form = document.querySelector('[data-scan-form]');
  var results = document.querySelector('[data-scan-results]');
  var pulse = document.querySelector('[data-pulse]');
  var radar = document.querySelector('[data-radar]');

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderMatches(payload) {
    if (!results) return;
    var matches = (payload && payload.matches) || [];
    if (!matches.length) {
      results.innerHTML = '<p class="scan-empty">No strong matches in the current corpus. Try fewer filters, or <a href="/reports?q=' + encodeURIComponent((payload && payload.query) || '') + '">search the full board</a>.</p>';
      return;
    }
    results.innerHTML = matches.map(function (m) {
      var r = m.report || {};
      var photo = r.photo_url
        ? '<img src="' + esc(r.photo_url) + '" alt="" width="72" height="72">'
        : '<span class="scan-hit__ph">no photo</span>';
      var reasons = (m.reasons || []).map(function (why) { return '<li>' + esc(why) + '</li>'; }).join('');
      var score = Math.max(0, Math.min(1, Number(m.score) / 125));
      return '<a class="scan-hit" href="/reports/' + esc(r.reference_no) + '" style="--score:' + score.toFixed(3) + '">' +
        photo +
        '<div><h3>' + esc(r.title) + '</h3>' +
        '<p>' + esc(r.kind) + ' · ' + esc(r.category_name) + ' · ' + esc(r.location_name) + ' · ' + esc(r.reference_no) + '</p>' +
        '<div class="scan-hit__bar" aria-hidden="true"><span></span></div>' +
        '<p>Score ' + esc(m.score) + '</p>' +
        '<ul class="scan-hit__reasons">' + reasons + '</ul></div></a>';
    }).join('');
  }

  if (form && results) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = (form.querySelector('#scan-q') || {}).value || '';
      q = q.trim();
      if (q.length < 3) {
        results.innerHTML = '<p class="scan-status">Need at least 3 characters.</p>';
        return;
      }
      var body = {
        q: q,
        kind: (form.querySelector('#scan-kind') || {}).value || '',
        category_id: (form.querySelector('#scan-cat') || {}).value || '',
        location_id: (form.querySelector('#scan-loc') || {}).value || '',
      };
      results.innerHTML = '<p class="scan-status">Scanning corpus…</p>';
      fetch('/api/nexus/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(body),
      }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (out) {
          if (!out.ok) {
            results.innerHTML = '<p class="scan-status">' + esc(out.data && out.data.error || 'Scan failed.') + '</p>';
            return;
          }
          renderMatches(out.data);
        })
        .catch(function () {
          results.innerHTML = '<p class="scan-status">Scanner unreachable. Submitting as a normal search.</p>';
          form.submit();
        });
    });

    var params = new URLSearchParams(window.location.search);
    var preset = params.get('q');
    if (preset) {
      var box = form.querySelector('#scan-q');
      if (box) box.value = preset;
      if (typeof form.requestSubmit === 'function') form.requestSubmit();
      else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    }
  }

  if (radar) {
    var nodes = radar.querySelectorAll('.radar__node');
    if (nodes.length) {
      nodes.forEach(function (node, i) {
        var n = nodes.length;
        var angle = (-90 + (360 / n) * i) * Math.PI / 180;
        var radius = n > 6 ? 34 : 30;
        node.style.left = (50 + Math.cos(angle) * radius) + '%';
        node.style.top = (48 + Math.sin(angle) * radius) + '%';
      });
    }
    radar.addEventListener('click', function (e) {
      var pin = e.target.closest('.radar__pin');
      if (!pin) return;
      var node = pin.closest('.radar__node');
      var pop = node && node.querySelector('.radar__pop');
      if (!pop) return;
      var open = !pop.hidden;
      radar.querySelectorAll('.radar__pop').forEach(function (p) { p.hidden = true; });
      radar.querySelectorAll('.radar__pin').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
      if (!open) {
        pop.hidden = false;
        pin.setAttribute('aria-expanded', 'true');
      }
    });
    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-radar]')) return;
      radar.querySelectorAll('.radar__pop').forEach(function (p) { p.hidden = true; });
    });
  }

  function renderPulse(items) {
    if (!pulse || !items || !items.length) return;
    pulse.innerHTML = items.map(function (r) {
      return '<li><a href="/reports/' + esc(r.reference_no) + '">' +
        '<span class="pulse__kind pulse__kind--' + esc(r.kind) + '">' + esc(r.kind) + '</span>' +
        '<span class="pulse__title">' + esc(r.title) + '</span>' +
        '<span class="pulse__meta">' + esc(r.location_name) + ' · ' + esc(r.reference_no) + '</span>' +
        '</a></li>';
    }).join('');
  }

  function refreshPulse() {
    fetch('/api/nexus/pulse', { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) { if (data && data.items) renderPulse(data.items); })
      .catch(function () {});
  }

  if (pulse && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setInterval(refreshPulse, 30000);
  }
})();

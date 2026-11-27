// public/js/admin-review.js
// Guest report review as a card stack: one report at a time, A to approve, R to reject.
// Progressive: without this file the page is a plain list of cards, each with working Approve / Reject forms.
//
// A decision slides the card away and shows an Undo toast. The request is sent after the toast times out (5 s),
// or immediately if the person leaves the page, so Undo never has to reverse something the server already saved.

(function () {
  'use strict';

  var root = document.querySelector('[data-mod-queue]');
  if (!root) { return; }
  var stack = root.querySelector('[data-mod-stack]');
  var cards = Array.prototype.slice.call(stack.querySelectorAll('.mod-card'));
  if (!cards.length || !window.fetch || !window.URLSearchParams || !window.FormData) { return; }

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var UNDO_MS = 5000;
  var total = cards.length;
  var queue = cards.slice();
  var pending = [];

  stack.classList.remove('mod-list');
  stack.classList.add('is-stack');

  // In stack mode the reason box is hidden until Reject is chosen, so it must not block submitting Approve.
  cards.forEach(function (c) { var n = c.querySelector('input[name="note"]'); if (n) { n.required = false; } });

  // ---- Progress bar + key hints -------------------------------------------------
  var bar = document.createElement('div');
  bar.className = 'mod-bar';
  bar.innerHTML = '<p class="mod-keys"><span><kbd>A</kbd> approve</span><span><kbd>R</kbd> reject</span>' +
    '<span class="mod-left" aria-live="polite"></span></p><div class="mod-meter" aria-hidden="true"><i></i></div>';
  root.insertBefore(bar, stack);
  var leftEl = bar.querySelector('.mod-left');
  var meterEl = bar.querySelector('.mod-meter i');

  var toasts = document.createElement('div');
  toasts.className = 'adm-toasts';
  toasts.setAttribute('aria-live', 'polite');
  document.body.appendChild(toasts);

  var doneEl = null;

  // ---- Layout of the stack ------------------------------------------------------
  function layout() {
    queue.forEach(function (c, i) {
      c.setAttribute('data-pos', String(i));
      c.hidden = i > 2;
      if (i === 0) { c.removeAttribute('inert'); c.removeAttribute('aria-hidden'); }
      else { c.setAttribute('inert', ''); c.setAttribute('aria-hidden', 'true'); }
    });
    leftEl.textContent = queue.length ? queue.length + ' left' : '';
    meterEl.style.width = ((total - queue.length) / total * 100) + '%';
    if (!queue.length && !doneEl) { showDone(); }
    if (queue.length && doneEl) { doneEl.parentNode.removeChild(doneEl); doneEl = null; }
  }

  function showDone() {
    doneEl = document.createElement('div');
    doneEl.className = 'empty-state mod-done';
    doneEl.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="20"/><path d="m15 25 6 6 12-14"/></svg>' +
      '<h3>Inbox zero</h3><p>No guest reports are waiting for review.</p><p><a href="/admin">Back to dashboard</a></p>';
    root.appendChild(doneEl);
  }

  // Keep the "pending" counts in the tab and the sidebar in step with what was decided on screen.
  function bump(delta) {
    var tab = document.querySelector('.mod-tab .mod-count');
    if (tab) { tab.textContent = String(Math.max(0, (parseInt(tab.textContent, 10) || 0) + delta)); }
    var badge = document.querySelector('.adm-nav a[href="/admin/moderation"] .adm-badge');
    if (badge) {
      var n = Math.max(0, (parseInt(badge.textContent, 10) || 0) + delta);
      badge.textContent = String(n);
      badge.setAttribute('aria-label', n + ' waiting');
      badge.style.display = n ? '' : 'none';
    }
  }

  // ---- Toasts -------------------------------------------------------------------
  function toast(message, undo, ms) {
    var t = document.createElement('div');
    t.className = 'adm-toast';
    var span = document.createElement('span');
    span.textContent = message;
    t.appendChild(span);
    if (undo) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Undo';
      b.addEventListener('click', function () { undo(); remove(); });
      t.appendChild(b);
    }
    function remove() { if (t.parentNode) { t.parentNode.removeChild(t); } }
    toasts.appendChild(t);
    setTimeout(remove, ms || UNDO_MS);
    return remove;
  }

  // ---- Decisions ----------------------------------------------------------------
  function topCard() { return queue[0] || null; }

  function decide(card, kind) {
    var form = card.querySelector('form[action$="/' + kind + '"]');
    var rec = {
      card: card, kind: kind, ref: card.getAttribute('data-ref'), url: form.action,
      body: new URLSearchParams(new FormData(form)).toString(), timer: null, removeToast: null
    };
    queue.shift();
    card.classList.add('is-out-' + kind);
    layout();
    bump(-1);
    setTimeout(function () { if (card.classList.contains('is-out-' + kind) && card.parentNode) { card.parentNode.removeChild(card); } }, reduce ? 0 : 360);
    pending.push(rec);
    rec.removeToast = toast((kind === 'approve' ? 'Approved ' : 'Rejected ') + rec.ref, function () { undo(rec); });
    rec.timer = setTimeout(function () { commit(rec); }, UNDO_MS);
  }

  function restore(rec) {
    var c = rec.card;
    c.classList.remove('is-out-approve', 'is-out-reject');
    if (!c.parentNode) { stack.appendChild(c); }
    queue.unshift(c);
    layout();
    bump(1);
  }

  function undo(rec) {
    clearTimeout(rec.timer);
    pending = pending.filter(function (r) { return r !== rec; });
    restore(rec);
  }

  function fail(rec, message) {
    restore(rec);
    toast('Could not save ' + rec.ref + '. ' + message, null, 8000);
  }

  function commit(rec) {
    pending = pending.filter(function (r) { return r !== rec; });
    if (rec.removeToast) { rec.removeToast(); }
    fetch(rec.url, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: rec.body
    }).then(function (res) {
      // The server answers with a redirect that carries ?flash=ok:... or ?flash=err:...
      if (res.ok && /[?&]flash=ok/i.test(res.url)) { return; }
      var m = /[?&]flash=err(?::|%3A)([^&]*)/i.exec(res.url);
      fail(rec, m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : 'Check that you are still signed in, then try again.');
    }, function () {
      // Network error only (a second argument, so a bug above can never put a card back twice).
      fail(rec, 'The connection failed.');
    });
  }

  // Anything still waiting on its Undo timer is sent right away if the page is closed or left.
  window.addEventListener('pagehide', function () {
    pending.forEach(function (rec) {
      clearTimeout(rec.timer);
      try {
        fetch(rec.url, { method: 'POST', credentials: 'same-origin', keepalive: true,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: rec.body });
      } catch (e) { /* nothing more we can do while the page is closing */ }
    });
    pending = [];
  });

  // ---- Reject needs a reason: reveal the box first ---------------------------------
  function openReject(card) {
    var input = card.querySelector('input[name="note"]');
    card.classList.add('is-rejecting');
    if (input) { input.required = true; input.focus(); }
  }
  function closeReject(card) {
    var input = card.querySelector('input[name="note"]');
    card.classList.remove('is-rejecting');
    if (input) { input.required = false; input.value = ''; }
  }

  stack.addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target;
    var card = form.closest('.mod-card');
    if (!card || card !== topCard()) { return; }
    var kind = /\/approve$/.test(form.getAttribute('action')) ? 'approve' : 'reject';
    if (kind === 'reject') {
      if (!card.classList.contains('is-rejecting')) { openReject(card); return; }
      if (!form.checkValidity()) { form.reportValidity(); return; }
    }
    decide(card, kind);
  });

  // ---- Keyboard -----------------------------------------------------------------
  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) { return; }
    var t = e.target, tag = t && t.tagName;
    var card = topCard();
    if (e.key === 'Escape' && card && card.classList.contains('is-rejecting')) { closeReject(card); return; }
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) { return; }
    if (!card) { return; }
    var k = e.key.toLowerCase();
    if (k === 'a') { e.preventDefault(); card.querySelector('form[action$="/approve"] button').click(); }
    if (k === 'r') { e.preventDefault(); openReject(card); }
  });

  layout();
})();

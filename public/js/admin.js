// public/js/admin.js
// Admin console enhancements. Progressive: every page works without this file.
//
// 1. Chart choreography: each .adm-reveal card plays once when it scrolls into view (adds .is-in,
//    which switches on the CSS animations) and its numbers count up on the SAME easing curve as the
//    bars, so figures and graphics land together. A small button replays a card.
// 2. Stat tiles: numbers count up on load, staggered with the tile entrance.
// 3. Tooltips: one tooltip that glides from mark to mark; donut segments and legend rows highlight each other.
// 4. Play: cards follow the cursor with a soft spotlight, stat tiles tilt a few degrees, legend chips hide/show a series,
//    a click pins a month (with change vs the month before) or a donut slice, and a second click lets go.

(function () {
  'use strict';

  window.__admReady = true;                                 // tells the inline failsafe in dashboard.ejs we loaded

  var root = document.documentElement;
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var refining = root.classList.contains('nav-refine');     // same-page refresh: no entrance effects (see head.ejs)
  var still = reduce || refining;

  /* ---------- easing: the exact curve the CSS uses (cubic-bezier .16,1,.3,1), so counts match bars ---------- */
  function bezier(x1, y1, x2, y2) {
    function ax(t) { return 3 * x1 * (1 - t) * (1 - t) * t + 3 * x2 * (1 - t) * t * t + t * t * t; }
    function ay(t) { return 3 * y1 * (1 - t) * (1 - t) * t + 3 * y2 * (1 - t) * t * t + t * t * t; }
    return function (x) {
      if (x <= 0) { return 0; } if (x >= 1) { return 1; }
      var lo = 0, hi = 1, t = x;
      for (var i = 0; i < 22; i++) { var v = ax(t); if (Math.abs(v - x) < 1e-4) { break; } if (v < x) { lo = t; } else { hi = t; } t = (lo + hi) / 2; }
      return ay(t);
    };
  }
  var expo = bezier(0.16, 1, 0.3, 1);

  /* ---------- count-up ---------- */
  function countUp(el, delay) {
    var target = parseInt(el.getAttribute('data-count'), 10);
    if (isNaN(target) || target < 1) { return; }            // nothing to animate for 0
    var dur = parseInt(el.getAttribute('data-dur'), 10) || Math.min(1500, 700 + target * 8);
    var start = null;
    if (el._admRaf) { window.cancelAnimationFrame(el._admRaf); }
    el.textContent = '0';
    function frame(t) {
      if (start === null) { start = t + (delay || 0); }
      var p = Math.max(0, Math.min((t - start) / dur, 1));
      el.textContent = String(Math.round(target * expo(p)));
      if (p < 1) { el._admRaf = window.requestAnimationFrame(frame); } else { el.textContent = String(target); el._admRaf = 0; }
    }
    el._admRaf = window.requestAnimationFrame(frame);
  }

  function zero(scope) {                                    // park numbers at 0 so they do not flash their final value
    var n = scope.querySelectorAll('[data-count]');
    for (var i = 0; i < n.length; i++) { if (parseInt(n[i].getAttribute('data-count'), 10) > 0) { n[i].textContent = '0'; } }
  }
  function countAll(scope, base) {
    var n = scope.querySelectorAll('[data-count]');
    for (var i = 0; i < n.length; i++) {
      var li = n[i].closest('li');                          // rows count in step with their bar
      var step = li && li.style.getPropertyValue('--i') ? parseInt(li.style.getPropertyValue('--i'), 10) * 85 : 0;
      countUp(n[i], base + step);
    }
  }

  /* ---------- stat tiles (load) ---------- */
  function tiles() {
    var tiles = document.querySelectorAll('.my-stats li');
    for (var i = 0; i < tiles.length; i++) {
      var i2 = parseInt(tiles[i].style.getPropertyValue('--i'), 10) || i;
      var nums = tiles[i].querySelectorAll('[data-count]');
      for (var k = 0; k < nums.length; k++) { countUp(nums[k], 120 + i2 * 55); }
    }
  }

  /* ---------- chart cards: play when scrolled into view ---------- */
  function play(card) {
    card.classList.add('is-in');
    if (!still) { countAll(card, 250); }
  }

  function charts() {
    var cards = document.querySelectorAll('.adm-reveal');
    if (!cards.length) { return; }
    if (still || !('IntersectionObserver' in window)) {
      for (var i = 0; i < cards.length; i++) { cards[i].classList.add('is-in'); }
      return;
    }
    for (var j = 0; j < cards.length; j++) { zero(cards[j]); }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); play(e.target); } });
    }, { threshold: 0.28, rootMargin: '0px 0px -6% 0px' });
    for (var k = 0; k < cards.length; k++) { io.observe(cards[k]); }

    document.addEventListener('click', function (e) {       // replay
      var b = e.target.closest ? e.target.closest('[data-replay]') : null;
      if (!b) { return; }
      var card = b.closest('.adm-reveal');
      if (!card || still) { return; }
      card.classList.remove('is-in');
      zero(card);
      void card.offsetWidth;                                // restart the CSS animations
      play(card);
    });
  }

  /* ---------- tooltip ---------- */
  var tip = null, tipText = null, tipDot = null;
  function ensureTip() {
    if (!tip) {
      tip = document.createElement('div'); tip.className = 'adm-tip'; tip.setAttribute('role', 'tooltip');
      tipDot = document.createElement('i'); tipText = document.createElement('div');
      tip.appendChild(tipDot); tip.appendChild(tipText); document.body.appendChild(tip);
    }
    return tip;
  }
  function colorOf(el) {
    if (el.classList && el.classList.contains('adm-month')) { return 'linear-gradient(90deg, var(--accent-red) 50%, var(--brand) 50%)'; }
    var k = el.getAttribute('data-kind');
    if (k === 'lost') { return 'var(--accent-red)'; }
    if (k === 'found') { return 'var(--brand)'; }
    var seg = window.getComputedStyle(el).getPropertyValue('--seg');
    return seg && seg.trim() ? seg.trim() : 'var(--bg)';
  }
  function place(x, y) {
    var w = tip.offsetWidth / 2 + 8;
    tip.style.left = Math.max(w, Math.min(window.innerWidth - w, x)) + 'px';
    tip.style.top = Math.max(tip.offsetHeight + 14, y) + 'px';
  }
  function show(el, mouse) {
    var t = ensureTip(), raw = el.getAttribute('data-tip') || '', cut = raw.lastIndexOf(': ');
    tipText.textContent = '';
    var a = document.createElement('span'), b = document.createElement('b');
    if (cut > -1) { a.textContent = raw.slice(0, cut) + '  '; b.textContent = raw.slice(cut + 2); tipText.appendChild(a); tipText.appendChild(b); }
    else { b.textContent = raw; tipText.appendChild(b); }
    tip.style.setProperty('--tip-c', colorOf(el));
    var wasOn = t.classList.contains('is-on');
    t.classList.toggle('no-glide', !wasOn);                 // first appearance snaps; moving between marks glides
    var r = el.getBoundingClientRect(), top = r.top;
    if (el.classList && el.classList.contains('adm-month')) {      // sit just above the tallest bar that is showing
      var bars = el.querySelectorAll('.adm-bar'), best = null, hidden = (el.closest('svg').getAttribute('data-hide') || '');
      for (var q = 0; q < bars.length; q++) {
        if (hidden.indexOf(bars[q].classList.contains('adm-bar--lost') ? 'lost' : 'found') > -1) { continue; }
        var bt = bars[q].getBoundingClientRect().top; if (best === null || bt < best) { best = bt; }
      }
      top = best === null ? r.top + r.height - 30 : best - 4;
    }
    place(mouse ? mouse.x : r.left + r.width / 2, mouse ? mouse.y : top);
    t.classList.add('is-on');
  }
  function hide() { if (tip) { tip.classList.remove('is-on'); } }
  function markOf(e) { return e.target && e.target.closest ? e.target.closest('[data-tip]') : null; }

  document.addEventListener('mouseover', function (e) {
    var el = markOf(e);
    if (el) { show(el, el.tagName.toLowerCase() === 'circle' ? { x: e.clientX, y: e.clientY } : null); }
  });
  document.addEventListener('mousemove', function (e) {     // donut segments are rings, so the tip follows the pointer on them
    var el = markOf(e);
    if (el && tip && tip.classList.contains('is-on') && el.tagName.toLowerCase() === 'circle') { place(e.clientX, e.clientY - 4); }
  });
  document.addEventListener('mouseout', function (e) { if (markOf(e)) { hide(); } });
  document.addEventListener('focusin', function (e) { var el = markOf(e); if (el) { show(el, null); } });
  document.addEventListener('focusout', hide);
  window.addEventListener('scroll', hide, { passive: true });

  /* ---------- donut: segment <-> legend row highlight, centre shows the hovered slice ---------- */
  function donut() {
    var host = document.querySelector('.adm-donut');
    if (!host) { return; }
    var segs = host.querySelectorAll('.adm-seg'), rows = host.querySelectorAll('.adm-donut__list li');
    var n = host.querySelector('.adm-donut__n'), l = host.querySelector('.adm-donut__l');
    var total = n ? n.textContent : '', lbl = l ? (l.getAttribute('data-default') || l.textContent) : '', pinned = null;
    function swap(node, text) {
      if (!node) { return; }
      node.textContent = text; node.classList.remove('is-swap'); void node.getBBox(); node.classList.add('is-swap');
    }
    function focus(i) {
      var s, r;
      for (s = 0; s < segs.length; s++) {
        if (i === null && pinned !== null) { i = pinned; }
        var on = i === null ? false : String(i) === segs[s].getAttribute('data-seg');
        segs[s].classList.toggle('is-pinned', pinned !== null && String(pinned) === segs[s].getAttribute('data-seg'));
        segs[s].classList.toggle('is-active', on); segs[s].classList.toggle('is-dim', i !== null && !on);
      }
      for (r = 0; r < rows.length; r++) {
        var ron = i === null ? false : String(i) === rows[r].getAttribute('data-seg');
        rows[r].classList.toggle('is-active', ron); rows[r].classList.toggle('is-dim', i !== null && !ron);
      }
      if (i === null && pinned !== null) { i = pinned; }
      if (i === null) { if (n) { n._live = 0; n.textContent = total; } swap(l, lbl); return; }
      var seg = host.querySelector('.adm-seg[data-seg="' + i + '"]');
      if (seg && n) {
        if (n._admRaf) { window.cancelAnimationFrame(n._admRaf); }
        swap(n, seg.getAttribute('data-n'));
        var name = seg.getAttribute('data-name') || '';
        swap(l, name.length > 15 ? name.slice(0, 14) + '…' : name);
      }
    }
    function toggle(id) { pinned = (pinned !== null && String(pinned) === id) ? null : id; focus(pinned); }
    function bind(el) {
      var id = el.getAttribute('data-seg');
      if (!el.hasAttribute('tabindex')) { el.setAttribute('tabindex', '0'); }
      el.setAttribute('role', 'button');
      el.addEventListener('click', function () { toggle(id); });
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(id); } });
      el.addEventListener('mouseenter', function () { focus(id); });
      el.addEventListener('mouseleave', function () { focus(null); });
      el.addEventListener('focus', function () { focus(id); });
      el.addEventListener('blur', function () { focus(null); });
    }
    for (var s = 0; s < segs.length; s++) { bind(segs[s]); }
    for (var r = 0; r < rows.length; r++) { bind(rows[r]); }
  }

  /* ---------- play: legend toggles, month pin ---------- */
  function monthsAndLegend() {
    var svg = document.querySelector('.adm-chart');
    if (!svg) { return; }
    var card = svg.closest('.adm-card'), pin = card.querySelector('.adm-pin');
    var months = svg.querySelectorAll('.adm-month'), pinned = null;

    card.addEventListener('click', function (e) {                       // series toggles
      var b = e.target.closest ? e.target.closest('.adm-toggle') : null;
      if (!b) { return; }
      var hide = (svg.getAttribute('data-hide') || '').split(' ').filter(Boolean), k = b.getAttribute('data-series');
      var at = hide.indexOf(k);
      if (at > -1) { hide.splice(at, 1); } else { hide.push(k); }
      if (hide.length > 1) { hide = [k]; }                              // never hide both: showing the other one instead
      svg.setAttribute('data-hide', hide.join(' '));
      var all = card.querySelectorAll('.adm-toggle');
      for (var i = 0; i < all.length; i++) { all[i].setAttribute('aria-pressed', hide.indexOf(all[i].getAttribute('data-series')) > -1 ? 'false' : 'true'); }
    });

    function readout(m) {
      var pop = function () { pin.classList.remove('is-swap'); void pin.offsetWidth; pin.classList.add('is-swap'); };
      pin.textContent = '';
      if (!m) { pin.textContent = pin.getAttribute('data-hint'); pop(); return; }
      var lost = +m.getAttribute('data-lost'), found = +m.getAttribute('data-found'), idx = +m.getAttribute('data-m');
      var st = document.createElement('strong'); st.textContent = m.getAttribute('data-full');
      pin.appendChild(st);
      pin.appendChild(document.createTextNode('  ·  ' + lost + ' lost  ·  ' + found + ' found  ·  ' + (lost + found) + ' total'));
      if (idx > 0) {
        var pv = months[idx - 1], d = (lost + found) - (+pv.getAttribute('data-lost') + +pv.getAttribute('data-found'));
        var name = pv.getAttribute('data-full').split(' ')[0];
        pin.appendChild(document.createTextNode('  ·  ' + (d === 0 ? 'same as ' + name : (d > 0 ? '\u25B2 ' : '\u25BC ') + Math.abs(d) + (d > 0 ? ' more' : ' fewer') + ' than ' + name)));
      }
      pop();
    }
    function toggleMonth(m) {
      if (pinned) { pinned.classList.remove('is-pinned'); pinned.setAttribute('aria-pressed', 'false'); }
      pinned = (pinned === m) ? null : m;
      if (pinned) { pinned.classList.add('is-pinned'); pinned.setAttribute('aria-pressed', 'true'); }
      readout(pinned);
    }
    for (var i = 0; i < months.length; i++) {
      (function (m) {
        m.addEventListener('click', function () { toggleMonth(m); });
        m.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMonth(m); } });
      })(months[i]);
    }
  }

  /* ---------- play: spotlight on cards, light tilt on stat tiles (fine pointers only) ---------- */
  function pointerPlay() {
    if (still || !window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) { return; }
    var hot = null, raf = 0, ev = null;
    function release(el) {
      if (!el) { return; }
      el.classList.remove('is-hot');
      el.style.removeProperty('--rx'); el.style.removeProperty('--ry');
    }
    function apply() {
      raf = 0; if (!ev) { return; }
      var el = ev.target.closest ? ev.target.closest('.adm-card, .my-stats a') : null;
      if (el !== hot) { release(hot); hot = el; if (hot) { hot.classList.add('is-hot'); } }
      if (!hot) { return; }
      var r = hot.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
      hot.style.setProperty('--mx', (x * 100).toFixed(1) + '%'); hot.style.setProperty('--my', (y * 100).toFixed(1) + '%');
      if (hot.matches('.my-stats a')) {                                  // a few degrees only; large cards stay flat
        hot.style.setProperty('--ry', ((x - 0.5) * 7).toFixed(2) + 'deg');
        hot.style.setProperty('--rx', ((0.5 - y) * 6).toFixed(2) + 'deg');
      }
    }
    document.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') { return; }
      ev = e; if (!raf) { raf = window.requestAnimationFrame(apply); }
    }, { passive: true });
    document.documentElement.addEventListener('mouseleave', function () { release(hot); hot = null; });
  }

  function init() {
    var st = document.querySelector('.my-stats');
    if (!still && st) { zero(st); }
    charts();
    donut();
    monthsAndLegend();
    pointerPlay();
    if (!still) { tiles(); }
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();

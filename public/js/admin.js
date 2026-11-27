// public/js/admin.js
// Admin console enhancements. Progressive: every page works without this file.
//
// 1. Chart choreography: each .adm-reveal card plays once when it scrolls into view (adds .is-in,
//    which switches on the CSS animations) and its numbers count up on the SAME easing curve as the
//    bars, so figures and graphics land together. A small button replays a card.
// 2. Stat tiles: numbers count up on load, staggered with the tile entrance.
// 3. Tooltips: one tooltip that glides from mark to mark; donut segments and legend rows highlight each other.

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
    var r = el.getBoundingClientRect();
    place(mouse ? mouse.x : r.left + r.width / 2, mouse ? mouse.y : r.top);
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
    var total = n ? n.textContent : '', lbl = l ? (l.getAttribute('data-default') || l.textContent) : '';
    function swap(node, text) {
      if (!node) { return; }
      node.textContent = text; node.classList.remove('is-swap'); void node.getBBox(); node.classList.add('is-swap');
    }
    function focus(i) {
      var s, r;
      for (s = 0; s < segs.length; s++) {
        var on = i === null ? false : String(i) === segs[s].getAttribute('data-seg');
        segs[s].classList.toggle('is-active', on); segs[s].classList.toggle('is-dim', i !== null && !on);
      }
      for (r = 0; r < rows.length; r++) {
        var ron = i === null ? false : String(i) === rows[r].getAttribute('data-seg');
        rows[r].classList.toggle('is-active', ron); rows[r].classList.toggle('is-dim', i !== null && !ron);
      }
      if (i === null) { if (n) { n._live = 0; n.textContent = total; } swap(l, lbl); return; }
      var seg = host.querySelector('.adm-seg[data-seg="' + i + '"]');
      if (seg && n) {
        if (n._admRaf) { window.cancelAnimationFrame(n._admRaf); }
        swap(n, seg.getAttribute('data-n'));
        var name = seg.getAttribute('data-name') || '';
        swap(l, name.length > 15 ? name.slice(0, 14) + '…' : name);
      }
    }
    function bind(el) {
      var id = el.getAttribute('data-seg');
      el.addEventListener('mouseenter', function () { focus(id); });
      el.addEventListener('mouseleave', function () { focus(null); });
      el.addEventListener('focus', function () { focus(id); });
      el.addEventListener('blur', function () { focus(null); });
    }
    for (var s = 0; s < segs.length; s++) { bind(segs[s]); }
    for (var r = 0; r < rows.length; r++) { bind(rows[r]); }
  }

  function init() {
    var st = document.querySelector('.my-stats');
    if (!still && st) { zero(st); }
    charts();
    donut();
    if (!still) { tiles(); }
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();

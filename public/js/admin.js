// public/js/admin.js
// Admin console enhancements. Progressive: every page works without this file.
// Task 1: animated stat tiles (numbers count up from 0 on load).

(function () {
  'use strict';

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function countUp(el) {
    var target = parseInt(el.getAttribute('data-count'), 10);
    if (isNaN(target) || target < 1) { return; }          // nothing to animate for 0
    var duration = Math.min(1100, 450 + target * 6);      // small numbers stay quick
    var start = null;
    el.textContent = '0';
    function frame(t) {
      if (start === null) { start = t; }
      var p = Math.min((t - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3);                 // ease-out
      el.textContent = String(Math.round(target * eased));
      if (p < 1) { window.requestAnimationFrame(frame); } else { el.textContent = String(target); }
    }
    window.requestAnimationFrame(frame);
  }

  function init() {
    if (reduce) { return; }                               // reduced motion: show final numbers at once
    var nodes = document.querySelectorAll('[data-count]');
    for (var i = 0; i < nodes.length; i++) { countUp(nodes[i]); }
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();

// Task 3: hover / keyboard-focus tooltips for the charts. Any element with data-tip="..." gets one.
(function () {
  'use strict';
  var tip = null;
  function ensure() {
    if (!tip) { tip = document.createElement('div'); tip.className = 'adm-tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
    return tip;
  }
  function show(el) {
    var t = ensure(), r = el.getBoundingClientRect();
    t.textContent = el.getAttribute('data-tip');
    t.style.left = (r.left + r.width / 2) + 'px';
    t.style.top = r.top + 'px';
    t.classList.add('is-on');
  }
  function hide() { if (tip) { tip.classList.remove('is-on'); } }
  function target(e) { return e.target && e.target.closest ? e.target.closest('[data-tip]') : null; }
  document.addEventListener('mouseover', function (e) { var el = target(e); if (el) { show(el); } });
  document.addEventListener('mouseout', function (e) { if (target(e)) { hide(); } });
  document.addEventListener('focusin', function (e) { var el = target(e); if (el) { show(el); } });
  document.addEventListener('focusout', hide);
  window.addEventListener('scroll', hide, { passive: true });
})();

// Task 6: idle chart animations pause while their card is scrolled out of view.
(function () {
  'use strict';
  if (!('IntersectionObserver' in window)) { return; }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { e.target.classList.toggle('adm-idle', !e.isIntersecting); });
  });
  var cards = document.querySelectorAll('.adm-card');
  for (var i = 0; i < cards.length; i++) { io.observe(cards[i]); }
})();

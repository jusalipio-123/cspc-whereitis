// public/js/celebrate.js
// A small confetti burst when the flash banner marks an item as reunited with its owner.
// Progressive: without this file the flash banner still shows the same message.
// Skipped for visitors who prefer reduced motion.

(function () {
  'use strict';

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var banner = document.querySelector('.flash[data-celebrate]');
  if (!banner) { return; }

  // The flash lives in the URL (?flash=...). Remove it so a reload does not replay the celebration.
  try {
    var url = new URL(window.location.href);
    if (url.searchParams.has('flash')) {
      url.searchParams.delete('flash');
      window.history.replaceState(null, '', url.pathname + (url.search || '') + url.hash);
    }
  } catch (e) { /* old browser: leave the URL alone */ }

  if (reduce) { return; }

  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  var canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999';
  var ctx = canvas.getContext('2d');
  if (!ctx) { return; }
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);

  var colors = [cssVar('--green', '#1b6e43'), cssVar('--brand', '#10427a'), cssVar('--accent', '#ffb703'), cssVar('--accent-red', '#a8281f')];
  var r = banner.getBoundingClientRect();
  var ox = r.left + Math.min(r.width, 600) / 2;
  var oy = Math.max(r.top + r.height / 2, 80);
  var bits = [];
  for (var i = 0; i < 90; i++) {
    var angle = Math.random() * Math.PI * 2, speed = 3 + Math.random() * 7;
    bits.push({
      x: ox, y: oy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 4,
      w: 4 + Math.random() * 4, h: 7 + Math.random() * 5, rot: Math.random() * 6, vr: (Math.random() - .5) * .4,
      life: 70 + Math.random() * 40, c: colors[i % colors.length]
    });
  }

  function frame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var alive = 0;
    for (var j = 0; j < bits.length; j++) {
      var b = bits[j];
      if (b.life <= 0) { continue; }
      alive++;
      b.x += b.vx; b.y += b.vy; b.vy += .24; b.vx *= .99; b.rot += b.vr; b.life--;
      ctx.save();
      ctx.globalAlpha = Math.min(1, b.life / 25);
      ctx.translate(b.x, b.y); ctx.rotate(b.rot);
      ctx.fillStyle = b.c; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      ctx.restore();
    }
    if (alive) { window.requestAnimationFrame(frame); } else if (canvas.parentNode) { canvas.parentNode.removeChild(canvas); }
  }
  window.requestAnimationFrame(frame);
})();

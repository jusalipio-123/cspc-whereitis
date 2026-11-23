// public/js/futura.js
// Progressive enhancement: command palette, campus concierge, voice search,
// live suggestions, glass motion. Pages work without this file.

(function () {
  'use strict';

  var Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // -------------------------------------------------------------------
  // Voice search — fills the nearest search field, then optionally submits.
  // -------------------------------------------------------------------
  function attachVoice(btn, input, onresult) {
    if (!Speech || !btn || !input) return;
    btn.hidden = false;
    var rec = null;
    btn.addEventListener('click', function () {
      if (rec) { try { rec.stop(); } catch (e) {} rec = null; btn.classList.remove('is-on'); return; }
      rec = new Speech();
      rec.lang = 'en-PH';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = function (ev) {
        var text = ev.results && ev.results[0] && ev.results[0][0] ? ev.results[0][0].transcript : '';
        if (text) {
          input.value = text;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof onresult === 'function') onresult(text);
        }
      };
      rec.onend = function () { rec = null; btn.classList.remove('is-on'); };
      rec.onerror = function () { rec = null; btn.classList.remove('is-on'); };
      try { rec.start(); btn.classList.add('is-on'); } catch (e) { rec = null; }
    });
  }

  var heroQ = document.getElementById('hero-q');
  var heroMic = $('[data-voice-search]');
  if (heroQ && heroMic && heroMic.closest('.hero__search')) {
    attachVoice(heroMic, heroQ, function () {
      var form = heroQ.closest('form');
      if (form) form.submit();
    });
  }
  $$('[data-voice-search]').forEach(function (btn) {
    if (btn.closest('.hero__search')) return;
    var form = btn.closest('form');
    var input = form && (form.querySelector('textarea, input[type="search"], input[type="text"]'));
    attachVoice(btn, input, null);
  });

  // -------------------------------------------------------------------
  // Command palette
  // -------------------------------------------------------------------
  var palette = $('[data-cmdk]');
  var pInput = $('[data-cmdk-input]');
  var pList = $('[data-cmdk-list]');
  var signedIn = !!(document.querySelector('.profile-menu') || document.querySelector('a.nav-icon'));

  var COMMANDS = [
    { id: 'home', label: 'Home', hint: 'Campus overview', href: '/', keys: 'home start' },
    { id: 'nexus', label: 'Nexus', hint: 'Radar · scanner · pulse', href: '/nexus', keys: 'nexus radar scan pulse' },
    { id: 'reports', label: 'All reports', hint: 'Browse the board', href: '/reports', keys: 'reports list board' },
    { id: 'lost', label: 'Lost items', hint: 'Open lost reports', href: '/reports?kind=lost', keys: 'lost missing' },
    { id: 'found', label: 'Found items', hint: 'Open found reports', href: '/reports?kind=found', keys: 'found recovered' },
    { id: 'new-lost', label: 'Report a lost item', hint: 'File in two minutes', href: '/reports/new?kind=lost', keys: 'report lost new' },
    { id: 'new-found', label: 'Report a found item', hint: 'File in two minutes', href: '/reports/new?kind=found', keys: 'report found new' },
    { id: 'help', label: 'User guide', hint: 'How the system works', href: '/help', keys: 'help guide faq' },
    { id: 'about', label: 'About', hint: 'What WhereITis is', href: '/about', keys: 'about' },
  ];
  if (signedIn) {
    COMMANDS.push(
      { id: 'mine', label: 'My reports', hint: 'Your filings, claims, bookmarks', href: '/my-reports', keys: 'my reports account' },
      { id: 'inbox', label: 'Inbox', hint: 'Notifications & messages', href: '/notifications', keys: 'inbox notifications messages' }
    );
  } else {
    COMMANDS.push(
      { id: 'signin', label: 'Sign in', hint: 'Student account', href: '/sign-in', keys: 'sign in login' },
      { id: 'register', label: 'Create an account', hint: 'New student', href: '/register', keys: 'register sign up' }
    );
  }

  var active = 0;
  var shown = [];

  function filterCommands(q) {
    q = String(q || '').trim().toLowerCase();
    var rows = [];
    if (q.length >= 2) {
      rows.push({
        id: 'search',
        label: 'Search reports for “' + q + '”',
        hint: 'Open the board',
        href: '/reports?q=' + encodeURIComponent(q),
        keys: '',
      });
      rows.push({
        id: 'scan',
        label: 'Scan matches for “' + q + '”',
        hint: 'Explainable scorer',
        href: '/nexus?q=' + encodeURIComponent(q),
        keys: '',
      });
    }
    COMMANDS.forEach(function (c) {
      if (!q || (c.label + ' ' + c.hint + ' ' + c.keys).toLowerCase().indexOf(q) !== -1) rows.push(c);
    });
    return rows;
  }

  function renderPalette() {
    shown = filterCommands(pInput ? pInput.value : '');
    if (active >= shown.length) active = 0;
    pList.innerHTML = shown.map(function (c, i) {
      return '<li><a class="cmdk__item' + (i === active ? ' is-active' : '') + '" href="' + c.href + '" data-i="' + i + '">' +
        '<span>' + c.label + '</span><small>' + (c.hint || '') + '</small></a></li>';
    }).join('') || '<li class="cmdk__item">No matches</li>';
  }

  function openPalette() {
    if (!palette) return;
    palette.hidden = false;
    active = 0;
    if (pInput) { pInput.value = ''; pInput.focus(); }
    renderPalette();
  }
  function closePalette() {
    if (!palette) return;
    palette.hidden = true;
  }

  if (palette && pInput && pList) {
    document.addEventListener('keydown', function (e) {
      var meta = e.ctrlKey || e.metaKey;
      if (meta && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (palette.hidden) openPalette(); else closePalette();
        return;
      }
      if (palette.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, shown.length - 1); renderPalette(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); renderPalette(); }
      if (e.key === 'Enter' && shown[active]) {
        e.preventDefault();
        window.location.href = shown[active].href;
      }
    });
    pInput.addEventListener('input', function () { active = 0; renderPalette(); });
    palette.addEventListener('click', function (e) {
      if (e.target.closest('[data-cmdk-close]')) closePalette();
    });
  }

  // -------------------------------------------------------------------
  // Concierge — rules-based campus helper (honest: not a neural net)
  // -------------------------------------------------------------------
  var fab = $('[data-concierge-open]');
  var panel = $('[data-concierge]');
  var log = $('[data-concierge-log]');
  var form = $('[data-concierge-form]');
  var cInput = $('[data-concierge-input]');
  var cClose = $('[data-concierge-close]');

  var REPLIES = [
    { test: /hello|hi|hey|kamusta|good (morning|afternoon|evening)/i, say: 'Kamusta. I can help you report something, search the board, or run a match scan. What went missing — or what did you find?' },
    { test: /how (do i |to )?report|file a report|nawala|nakita/i, say: 'Tap Report lost item or Report found item. Guests can file a found item without an account; lost items need a sign-in. You will get a reference like LF-2026-0007.' },
    { test: /claim|this is mine|akin (ito|to)/i, say: 'Open the found report, then “This is mine — file a claim”. You will need to describe proof of ownership. The finder (or staff) reviews it.' },
    { test: /match|scanner|score/i, say: 'Matching is a fixed rubric, not AI: same category, same location, close dates, overlapping words. Open Nexus to scan a description — every point comes with a reason.' },
    { test: /nexus|radar|pulse/i, say: 'Nexus is the campus command centre: a radar of open reports by zone, a match scanner, and a live pulse. Open it from the nav, or press Ctrl+K and type Nexus.' },
    { test: /sign ?in|account|password|google/i, say: 'Use Sign in with your student email, or Google if it is configured. Forgot a password? There is a reset link on the sign-in page.' },
    { test: /theme|dark|light|glass/i, say: 'Use the sun/moon button in the header to switch light and dark. Frosted glass panels stay in both modes.' },
    { test: /voice|mic|speak/i, say: 'If your browser supports it, the mic on the home search box and on the Nexus scanner will type what you say. Allow the microphone when asked.' },
    { test: /ctrl|command palette|shortcut|keyboard/i, say: 'Press Ctrl+K (Cmd+K on a Mac) from any page to jump, search, or send a description to the scanner.' },
    { test: /privacy|data|guest/i, say: 'Guest found-item reports are held for staff review. Contact details on guest reports are never shown on public pages. See Privacy in the footer.' },
    { test: /help|guide/i, say: 'The user guide walks through reporting, searching, and claiming, step by step.', href: '/help', link: 'Open the user guide' },
  ];

  function addMsg(text, who, href, linkText) {
    if (!log) return;
    var li = document.createElement('li');
    li.className = who === 'me' ? 'is-me' : 'is-bot';
    li.textContent = text;
    if (href && linkText) {
      li.appendChild(document.createTextNode(' '));
      var a = document.createElement('a');
      a.href = href;
      a.textContent = linkText;
      li.appendChild(a);
    }
    log.appendChild(li);
    log.scrollTop = log.scrollHeight;
  }

  function replyTo(text) {
    var i, hit;
    for (i = 0; i < REPLIES.length; i++) {
      if (REPLIES[i].test.test(text)) { hit = REPLIES[i]; break; }
    }
    if (hit) {
      addMsg(hit.say, 'bot', hit.href, hit.link);
      return;
    }
    if (text.trim().length >= 3) {
      addMsg('I can search the board or run an explainable scan for that.', 'bot');
      fetch('/api/nexus/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ q: text.trim() }),
      }).then(function (r) { return r.json(); }).then(function (data) {
        if (!data || !data.matches || !data.matches.length) {
          addMsg('No strong matches yet. Try the reports list — keywords still work.', 'bot', '/reports?q=' + encodeURIComponent(text.trim()), 'Search reports');
          return;
        }
        var top = data.matches[0];
        var why = (top.reasons || []).slice(0, 3).join('; ');
        addMsg('Best hit: ' + top.report.title + ' (' + top.report.reference_no + ', score ' + top.score + '). ' + why,
          'bot', '/reports/' + top.report.reference_no, 'Open report');
      }).catch(function () {
        addMsg('The scanner is offline. You can still browse reports.', 'bot', '/reports', 'Open reports');
      });
      return;
    }
    addMsg('Try “how to report”, “claim”, “Nexus”, or describe the item in a few words.', 'bot');
  }

  function openConcierge() {
    if (!panel || !fab) return;
    panel.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    if (log && log.children.length === 0) {
      addMsg('Nexus online. Ask how to report, claim, or scan — or just describe an item.', 'bot');
    }
    if (cInput) cInput.focus();
  }
  function closeConcierge() {
    if (!panel || !fab) return;
    panel.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
    fab.focus();
  }

  if (fab && panel) {
    fab.hidden = false;
    fab.addEventListener('click', function () {
      if (panel.hidden) openConcierge(); else closeConcierge();
    });
    if (cClose) cClose.addEventListener('click', closeConcierge);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel && !panel.hidden) closeConcierge();
    });
    if (form && cInput) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var text = cInput.value.trim();
        if (!text) return;
        addMsg(text, 'me');
        cInput.value = '';
        replyTo(text);
      });
    }
  }

  // -------------------------------------------------------------------
  // Handover beacon sigil — deterministic 7×7 grid from the reference no.
  // -------------------------------------------------------------------
  $$('[data-beacon]').forEach(function (el) {
    var ref = el.getAttribute('data-ref') || '';
    var grid = el.querySelector('[data-beacon-grid]');
    if (!grid) return;
    var h = 2166136261;
    var i;
    for (i = 0; i < ref.length; i++) h = Math.imul(h ^ ref.charCodeAt(i), 16777619);
    grid.innerHTML = '';
    for (i = 0; i < 49; i++) {
      var bit = ((h >>> (i % 31)) ^ (h >>> ((i * 3) % 31))) & 1;
      // Keep a quiet frame so it reads as a badge, not noise.
      var x = i % 7, y = Math.floor(i / 7);
      var edge = x === 0 || y === 0 || x === 6 || y === 6;
      var cell = document.createElement('span');
      if (edge || bit) cell.className = 'on';
      if (edge && (x + y) % 2 === 0) cell.className = '';
      grid.appendChild(cell);
    }
    var copyBtn = el.querySelector('[data-beacon-copy]');
    if (copyBtn && navigator.clipboard) {
      copyBtn.addEventListener('click', function () {
        var url = el.getAttribute('data-url') || window.location.href;
        if (url.charAt(0) === '/') url = window.location.origin + url;
        navigator.clipboard.writeText(url).then(function () {
          copyBtn.textContent = 'Copied';
          setTimeout(function () { copyBtn.textContent = 'Copy link'; }, 1600);
        }).catch(function () {});
      });
    }
    var shareBtn = el.querySelector('[data-beacon-share]');
    if (shareBtn) {
      if (!navigator.share) { shareBtn.hidden = true; return; }
      shareBtn.addEventListener('click', function () {
        var shareUrl = el.getAttribute('data-url') || window.location.href;
        if (shareUrl.charAt(0) === '/') shareUrl = window.location.origin + shareUrl;
        navigator.share({
          title: el.getAttribute('data-title') || 'CSPC WhereITis',
          text: ref,
          url: shareUrl,
        }).catch(function () {});
      });
    }
  });

  // -------------------------------------------------------------------
  // Live search suggestions on the home search box
  // -------------------------------------------------------------------
  (function liveSearch() {
    var form = $('[data-live-search]');
    var input = form && form.querySelector('#hero-q');
    var list = form && $('[data-suggest]', form);
    if (!form || !input || !list) return;
    var timer = null, last = '', active = -1, items = [];

    function hide() {
      list.hidden = true; list.innerHTML = ''; active = -1; items = [];
      input.setAttribute('aria-expanded', 'false');
    }
    function render() {
      if (!items.length) { hide(); return; }
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      list.innerHTML = items.map(function (it, i) {
        return '<li><a class="' + (i === active ? 'is-active' : '') + '" role="option" href="/reports/' + esc(it.reference_no) + '">' +
          '<span class="suggest__kind suggest__kind--' + esc(it.kind) + '">' + esc(it.kind) + '</span>' +
          '<span class="suggest__title">' + esc(it.title) + '</span>' +
          '<span class="suggest__meta">' + esc(it.location_name || '') + ' · ' + esc(it.reference_no) + '</span></a></li>';
      }).join('');
    }
    function query(q) {
      fetch('/api/nexus/suggest?q=' + encodeURIComponent(q), { headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (input.value.trim() !== q) return;
          items = (data && data.items) || [];
          active = -1;
          render();
        })
        .catch(function () { hide(); });
    }
    input.addEventListener('input', function () {
      var q = input.value.trim();
      clearTimeout(timer);
      if (q.length < 2) { hide(); return; }
      if (q === last) return;
      last = q;
      timer = setTimeout(function () { query(q); }, 180);
    });
    input.addEventListener('keydown', function (e) {
      if (list.hidden || !items.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, items.length - 1); render(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); render(); }
      if (e.key === 'Enter' && active >= 0 && items[active]) {
        e.preventDefault();
        window.location.href = '/reports/' + items[active].reference_no;
      }
      if (e.key === 'Escape') hide();
    });
    document.addEventListener('click', function (e) {
      if (!form.contains(e.target)) hide();
    });
  })();

  // -------------------------------------------------------------------
  // Scroll progress + magnetic glass cards
  // -------------------------------------------------------------------
  (function motion() {
    var bar = $('[data-scroll-progress]');
    if (bar) {
      var ticking = false;
      function paint() {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        var p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
        bar.style.width = (p * 100).toFixed(2) + '%';
        ticking = false;
      }
      window.addEventListener('scroll', function () {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(paint);
      }, { passive: true });
      paint();
    }

    var dock = $('.glass-dock');
    if (dock) {
      var path = location.pathname;
      $$('.glass-dock a').forEach(function (a) {
        var href = a.getAttribute('href');
        if (href === path || (href !== '/' && path.indexOf(href) === 0)) a.setAttribute('aria-current', 'page');
      });
    }

    if (reduce) return;
    var fine = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!fine) return;
    var SEL = '.report-card, .nexus-tile, .how__steps li, .scan-hit';
    document.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse' || !e.target.closest) return;
      var card = e.target.closest(SEL);
      if (!card) return;
      var r = card.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      card.style.setProperty('--ry', (px * 8).toFixed(2) + 'deg');
      card.style.setProperty('--rx', (-py * 8).toFixed(2) + 'deg');
    }, { passive: true });
    document.addEventListener('pointerleave', function (e) {
      var card = e.target && e.target.closest && e.target.closest(SEL);
      if (card) { card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg'); }
    }, true);
  })();
})();

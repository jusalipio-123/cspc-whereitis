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
  // Concierge v3 — AI help assistant with a rule-based safety net.
  //
  // When the server has an API key (GET /api/assistant/status), questions go
  // to POST /api/assistant/chat. If the AI is off, busy, or unreachable, the
  // same question is answered by the original rules + the Nexus scanner, so
  // the helper never goes dark. Instant local answers (greetings, thanks,
  // reference numbers) never spend an AI call.
  // -------------------------------------------------------------------
  var fab = $('[data-concierge-open]');
  var panel = $('[data-concierge]');
  var log = $('[data-concierge-log]');
  var form = $('[data-concierge-form]');
  var cInput = $('[data-concierge-input]');
  var cClose = $('[data-concierge-close]');
  var cNote = $('.concierge__note');
  var NOTE_RULES = cNote ? cNote.textContent : '';
  var NOTE_AI = 'AI-assisted. It can make mistakes, so check details on the pages it links to.';

  // <routing-data>
  // Rule-based fallback. Order matters: first match wins. \b everywhere so
  // "hi" cannot fire inside "white" or "something".
  var REF_RE = /\bLF-\d{4}-\d{3,}\b/i;
  var LOST_RE = /\b(lost|nawala|nawawala|missing|naiwan|nahulog|can'?t find|cannot find)\b/i;
  var FOUND_RE = /\b(found|nakita|napulot|natagpuan|picked up)\b/i;

  var TOPICS = [
    { local: true, test: /^\s*(hello|hi|hey|yo|kamusta|kumusta|good\s+(morning|afternoon|evening))\b[\s!.,?]*(po|there)?[\s!.,?]*$/i,
      say: 'Kamusta. I can walk you through the system, look up a report, or help you find an item. What do you need?', chips: true },
    { local: true, test: /^\s*(thanks|thank you|salamat)\b[\s!.,]*(po)?[\s!.,]*$/i,
      say: 'Walang anuman. Ask again any time.' },
    { test: /\b(how|paano|pano)\b[^.?!]*\b(report|file|post|mag-?report)\b|\bfile a report\b|\bhow to report\b/i,
      say: 'Tap Report lost item or Report found item. Guests can file a found item without an account; lost items need a sign-in. You will get a reference like LF-2026-0007.',
      links: [{ href: '/reports/new', text: 'Start a report' }] },
    { test: /\b(after|next|pagkatapos|happens?)\b[^.?!]*\bclaims?\b|\bclaims?\b[^.?!]*\b(approved|rejected|status|next)\b/i,
      say: 'The person who posted the report reviews your claim and approves or rejects it. If it is approved, the report becomes claimed and you arrange the handover by message. Bring your student ID when you collect. Once the item is handed over it is marked returned. If a claim is rejected and you believe the item is yours, contact Student Affairs.',
      links: [{ href: '/help', text: 'Open the user guide' }] },
    { test: /\bclaim(s|ed|ing)?\b|\bthis is mine\b|\bakin (ito|to)\b/i,
      say: 'Open the found report, then tap “This is mine — file a claim”. You will need to describe proof of ownership. The person who posted the report reviews it.' },
    { test: /\b(match|matches|matching|scanner|score)\b/i,
      say: 'Matching is a fixed rubric, not AI: same category, same location, close dates, overlapping words. Open Nexus to scan a description. Every point comes with a reason.',
      links: [{ href: '/nexus', text: 'Open Nexus' }] },
    { test: /\b(nexus|radar|pulse)\b/i,
      say: 'Nexus is the campus command centre: a radar of open reports by zone, a match scanner, and a live pulse. Press Ctrl+K and type Nexus from any page.',
      links: [{ href: '/nexus', text: 'Open Nexus' }] },
    { test: /\b(forgot|reset)\b[^.?!]*\bpassword\b|\bpassword\b[^.?!]*\b(forgot|reset)\b/i,
      say: 'Use Forgot password on the sign-in page and we will email a reset link. If it does not arrive, check spam, then see the IT office with your student ID.',
      links: [{ href: '/forgot-password', text: 'Reset my password' }] },
    { test: /\b(sign\s?in|log\s?in|password|google|account|register|sign\s?up)\b/i,
      say: 'Sign in with your CSPC email and password, or Google if it is available. New here? Register first and verify your email.',
      links: [{ href: '/sign-in', text: 'Go to sign in' }, { href: '/register', text: 'Create an account' }] },
    { test: /\b(theme|dark mode|light mode|glass)\b/i,
      say: 'Use the sun/moon button in the header to switch light and dark.' },
    { test: /\b(voice|microphone|mic|speak|speech)\b/i,
      say: 'If your browser supports it, the mic on the home search box and on the Nexus scanner will type what you say. Allow the microphone when asked.' },
    { test: /\b(ctrl|cmd|command palette|shortcut|shortcuts|keyboard)\b/i,
      say: 'Press Ctrl+K (Cmd+K on a Mac) from any page to jump, search, or send a description to the scanner.' },
    { test: /\b(privacy|guest|personal data|my data)\b/i,
      say: 'Guest found-item reports are held for staff review. Contact details on guest reports are never shown on public pages.',
      links: [{ href: '/privacy', text: 'Read the privacy page' }] },
    { test: /\b(help|guide|faq|tulong)\b/i,
      say: 'The user guide walks through reporting, searching, and claiming, step by step.',
      links: [{ href: '/help', text: 'Open the user guide' }] },
  ];

  // Quick-action cards. `icon` is a static SVG path set (no user input), so innerHTML is safe here.
  var CHIPS = [
    { label: 'Report an item', hint: 'Lost or found, step by step', say: 'How do I report an item?',
      icon: '<path d="M12 5v14M5 12h14"/>' },
    { label: 'Claim an item', hint: 'Prove it is yours', say: 'How do I claim an item?',
      icon: '<path d="M12 3 4.5 6v5.5c0 4.4 3.1 8 7.5 9.5 4.4-1.5 7.5-5.1 7.5-9.5V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>' },
    { label: 'After I claim', hint: 'What happens next', say: 'What happens after I file a claim?',
      icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
    { label: 'I lost something', hint: 'Describe it, I will search', prefill: 'I lost my ',
      icon: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>' },
  ];

  function inferKind(text) {
    var lost = LOST_RE.test(text);
    var found = FOUND_RE.test(text);
    if (lost && !found) return 'lost';
    if (found && !lost) return 'found';
    return '';
  }

  function findTopic(text) {
    for (var i = 0; i < TOPICS.length; i++) {
      if (TOPICS[i].test.test(text)) return TOPICS[i];
    }
    return null;
  }
  // </routing-data>

  var STORE_KEY = 'whereitis.concierge.v3';
  var MAX_SAVED = 30;
  var saved = [];
  var busy = false;
  var aiOn = null;          // null = unknown, true/false once checked
  var statusAsked = false;

  function loadSaved() {
    try {
      var raw = window.sessionStorage.getItem(STORE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.slice(-MAX_SAVED) : [];
    } catch (e) { return []; }
  }
  function persist() {
    try { window.sessionStorage.setItem(STORE_KEY, JSON.stringify(saved.slice(-MAX_SAVED))); } catch (e) {}
  }

  // ---- safe mini-markdown: **bold** and [label](/site/path) only --------
  var RICH_RE = /(\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(\/[^)\s]*\))/g;
  function safePath(p) {
    return p.charAt(0) === '/' && p.charAt(1) !== '/' && !/["'<>\\]/.test(p);
  }
  function appendInline(parent, line) {
    line.split(RICH_RE).forEach(function (part) {
      if (!part) return;
      var b = part.match(/^\*\*([^*]+)\*\*$/);
      if (b) {
        var s = document.createElement('strong');
        s.textContent = b[1];
        parent.appendChild(s);
        return;
      }
      var l = part.match(/^\[([^\]]+)\]\((\/[^)\s]*)\)$/);
      if (l && safePath(l[2])) {
        var a = document.createElement('a');
        a.href = l[2];
        a.textContent = l[1];
        parent.appendChild(a);
        return;
      }
      parent.appendChild(document.createTextNode(part));
    });
  }
  function appendRich(parent, text) {
    String(text).split(/\r?\n/).forEach(function (line) {
      if (!line.trim()) return;
      var row = document.createElement('div');
      row.className = 'concierge__line';
      appendInline(row, line);
      parent.appendChild(row);
    });
  }

  function buildEntry(e) {
    var li = document.createElement('li');
    li.className = e.who === 'me' ? 'is-me' : 'is-bot';
    if (e.text) {
      if (e.rich) appendRich(li, e.text);
      else li.appendChild(document.createTextNode(e.text));
    }

    if (e.items && e.items.length) {
      var wrap = document.createElement('div');
      wrap.className = 'concierge__hits';
      e.items.forEach(function (it) {
        var a = document.createElement('a');
        a.className = 'concierge__hit';
        a.href = it.href;
        var t = document.createElement('strong');
        t.textContent = it.title;
        var m = document.createElement('span');
        m.textContent = it.meta;
        a.appendChild(t);
        a.appendChild(m);
        if (it.why) {
          var w = document.createElement('span');
          w.textContent = it.why;
          a.appendChild(w);
        }
        wrap.appendChild(a);
      });
      li.appendChild(wrap);
    }

    if (e.links && e.links.length) {
      var row = document.createElement('div');
      row.className = 'concierge__links';
      e.links.forEach(function (l) {
        var a = document.createElement('a');
        a.href = l.href;
        a.textContent = l.text;
        row.appendChild(a);
      });
      li.appendChild(row);
    }
    return li;
  }

  function scrollLog() { if (log) log.scrollTop = log.scrollHeight; }

  function say(entry) {
    if (!log) return null;
    var li = buildEntry(entry);
    log.appendChild(li);
    saved.push(entry);
    persist();
    scrollLog();
    return li;
  }

  function showChips() {
    if (!log) return;
    var li = document.createElement('li');
    li.className = 'concierge__chips';
    CHIPS.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'concierge__chip';
      var ico = document.createElement('span');
      ico.className = 'concierge__chip-ico';
      ico.setAttribute('aria-hidden', 'true');
      ico.innerHTML = '<svg viewBox="0 0 24 24">' + c.icon + '</svg>';
      var txt = document.createElement('span');
      txt.className = 'concierge__chip-label';
      txt.appendChild(document.createTextNode(c.label));
      var hint = document.createElement('span');
      hint.className = 'concierge__chip-hint';
      hint.textContent = c.hint;
      txt.appendChild(hint);
      b.appendChild(ico);
      b.appendChild(txt);
      if (c.prefill) b.setAttribute('data-prefill', c.prefill);
      else b.setAttribute('data-say', c.say);
      li.appendChild(b);
    });
    log.appendChild(li);
    scrollLog();
  }

  function clearChips() {
    if (!log) return;
    $$('.concierge__chips, .concierge__suggest', log).forEach(function (el) { el.remove(); });
  }

  // Follow-up questions the AI offers after a reply (tap to ask). Own scoped
  // style, injected once, so no shared stylesheet is touched.
  var suggestCssAdded = false;
  function showSuggestions(list) {
    if (!log || !Array.isArray(list) || !list.length) return;
    if (!suggestCssAdded) {
      suggestCssAdded = true;
      var st = document.createElement('style');
      st.textContent =
        '.concierge__log li.concierge__suggest{align-self:stretch;max-width:100%;padding:0;background:none;border:0;box-shadow:none;' +
        'display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.1rem}' +
        '.concierge__log li.concierge__suggest .concierge__chip{display:inline-block;flex:0 1 auto;padding:.3rem .7rem;border-radius:999px;' +
        'font-size:.8rem;font-weight:500;line-height:1.3;text-align:left}' +
        '.concierge__log li.concierge__suggest .concierge__chip:hover,.concierge__log li.concierge__suggest .concierge__chip:focus-visible{transform:none}';
      document.head.appendChild(st);
    }
    var li = document.createElement('li');
    li.className = 'concierge__suggest';
    list.slice(0, 3).forEach(function (q) {
      if (typeof q !== 'string' || !q.trim()) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'concierge__chip';
      b.setAttribute('data-say', q.trim().slice(0, 80));
      b.textContent = q.trim().slice(0, 60);
      li.appendChild(b);
    });
    if (!li.children.length) return;
    log.appendChild(li);
    scrollLog();
  }

  function showTyping(label) {
    var el = buildEntry({ who: 'bot', text: label });
    el.classList.add('is-typing');
    var dots = document.createElement('span');
    dots.className = 'concierge__dots';
    dots.setAttribute('aria-hidden', 'true');
    dots.innerHTML = '<i></i><i></i><i></i>';
    el.appendChild(dots);
    log.appendChild(el);
    scrollLog();
    return el;
  }

  var cMode = $('[data-concierge-mode]');
  function setNote() {
    if (cMode) cMode.textContent = aiOn ? 'AI-assisted \u00b7 replies in seconds' : 'Guided helper \u00b7 instant answers';
    if (!cNote || !cNote.firstChild || cNote.firstChild.nodeType !== 3) return;
    cNote.firstChild.nodeValue = aiOn ? NOTE_AI : NOTE_RULES;
  }

  // ---- AI availability ---------------------------------------------------
  function checkStatus(then) {
    if (aiOn !== null) { then(); return; }
    if (statusAsked) { then(); return; }
    statusAsked = true;
    fetch('/api/assistant/status', { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { aiOn = !!(d && d.enabled); })
      .catch(function () { aiOn = false; })
      .then(function () { setNote(); then(); });
  }

  // Conversation memory for the AI: the visible text turns, newest last.
  function historyForAI() {
    var turns = [];
    saved.forEach(function (e) {
      if (!e.text) return;
      if (e.who === 'me') turns.push({ role: 'user', content: e.text });
      else if (e.who === 'bot') turns.push({ role: 'assistant', content: e.text });
    });
    return turns.slice(-10);
  }

  function askAI(text) {
    busy = true;
    var typing = showTyping('Thinking…');
    function done() {
      busy = false;
      if (typing.parentNode) typing.parentNode.removeChild(typing);
    }
    fetch('/api/assistant/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ messages: historyForAI() }),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, data: d || {} }; });
    }).then(function (out) {
      done();
      if (out.ok && out.data.reply) {
        say({ who: 'bot', text: out.data.reply, rich: true });
        showSuggestions(out.data.suggestions);
        return;
      }
      if (out.data.fallback) {
        // AI off or failing: answer with the built-in rules instead.
        if (out.status === 503 && /not turned on/i.test(out.data.error || '')) { aiOn = false; setNote(); }
        ruleRoute(text);
        return;
      }
      say({ who: 'bot', text: out.data.error || 'Something went wrong. Please try again.' });
    }).catch(function () {
      done();
      ruleRoute(text);
    });
  }

  // ---- rule-based path (fallback) ----------------------------------------
  function afterNoMatch(text, kind) {
    var links = [{ href: '/reports?q=' + encodeURIComponent(text), text: 'Search the full board' }];
    if (kind === 'lost') links.push({ href: '/reports/new?kind=lost', text: 'File a lost report' });
    else if (kind === 'found') links.push({ href: '/reports/new?kind=found', text: 'File a found report' });
    say({ who: 'bot', text: 'No strong match yet. New reports are added all the time, so check back.', links: links });
  }

  function scanFor(text) {
    var kind = inferKind(text);
    busy = true;
    var typing = showTyping('Checking the board…');
    function done() {
      busy = false;
      if (typing.parentNode) typing.parentNode.removeChild(typing);
    }
    fetch('/api/nexus/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ q: text, kind: kind }),
    }).then(function (r) {
      return r.json().then(function (data) { return { ok: r.ok, data: data || {} }; });
    }).then(function (out) {
      done();
      if (!out.ok) {
        say({ who: 'bot', text: out.data.error || 'The scanner had a problem. Try again in a moment.',
          links: [{ href: '/reports?q=' + encodeURIComponent(text), text: 'Search reports instead' }] });
        return;
      }
      var matches = (out.data.matches || []).slice(0, 3);
      if (!matches.length) { afterNoMatch(text, kind); return; }
      var intro = kind === 'lost' ? 'These found reports look closest to what you lost:'
        : kind === 'found' ? 'These lost reports look closest to what you found:'
        : 'Closest reports I could find:';
      var items = matches.map(function (m) {
        var r = m.report || {};
        return {
          href: '/reports/' + encodeURIComponent(r.reference_no),
          title: r.title || 'Untitled report',
          meta: [r.kind, r.location_name, r.reference_no].filter(Boolean).join(' · '),
          why: (m.reasons || []).slice(0, 2).join(', ') + ' (score ' + m.score + ')',
        };
      });
      say({ who: 'bot', text: intro, items: items });
      if (kind === 'lost') say({ who: 'bot', text: 'If one is yours, open it and tap “This is mine — file a claim”.' });
    }).catch(function () {
      done();
      say({ who: 'bot', text: 'The scanner is offline. You can still browse reports.',
        links: [{ href: '/reports', text: 'Open reports' }] });
    });
  }

  function ruleRoute(text) {
    var topic = findTopic(text);
    if (topic) {
      say({ who: 'bot', text: topic.say, links: topic.links });
      if (topic.chips) showChips();
      return;
    }
    if (text.length < 3) {
      say({ who: 'bot', text: 'Pick one below, or describe the item in a few words.' });
      showChips();
      return;
    }
    scanFor(text);
  }

  // ---- entry point for every user message --------------------------------
  function handle(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    clearChips();
    say({ who: 'me', text: text });

    var ref = text.match(REF_RE);
    if (ref && text.length <= 60) {
      var no = ref[0].toUpperCase();
      say({ who: 'bot', text: 'Here is ' + no + '. Its page shows the current status.',
        links: [{ href: '/reports/' + encodeURIComponent(no), text: 'Open ' + no }] });
      return;
    }

    var topic = findTopic(text);
    if (topic && topic.local) {
      say({ who: 'bot', text: topic.say });
      if (topic.chips) showChips();
      return;
    }

    busy = true;                       // hold the door while we learn if AI is on
    checkStatus(function () {
      busy = false;
      if (aiOn) askAI(text); else ruleRoute(text);
    });
  }

  function resetChat() {
    if (!log) return;
    log.innerHTML = '';
    saved = [];
    persist();
    greet();
  }

  function greet() {
    say({ who: 'bot', text: 'Hi! Ask me anything about WhereITis, or describe an item and I will look for it.' });
    showChips();
  }

  function openConcierge() {
    if (!panel || !fab) return;
    panel.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    checkStatus(function () {});
    if (log && log.children.length === 0) greet();
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

    var cClear = $('[data-concierge-clear]');
    if (cClear) cClear.addEventListener('click', function () {
      if (busy) return;
      resetChat();
      if (cInput) cInput.focus();
    });

    if (log) {
      log.setAttribute('aria-live', 'polite');
      loadSaved().forEach(function (entry) {
        log.appendChild(buildEntry(entry));
        saved.push(entry);
      });
      scrollLog();
      log.addEventListener('click', function (e) {
        var chip = e.target.closest && e.target.closest('.concierge__chip');
        if (!chip) return;
        var prefill = chip.getAttribute('data-prefill');
        if (prefill) {
          clearChips();
          if (cInput) { cInput.value = prefill; cInput.focus(); cInput.setSelectionRange(prefill.length, prefill.length); }
        } else {
          handle(chip.getAttribute('data-say'));
        }
      });
    }
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
        if (!text || busy) return;
        cInput.value = '';
        handle(text);
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

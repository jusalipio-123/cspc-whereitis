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
      say: 'Use Forgot password on the sign-in page and we will email a 6-digit code. Type it with your new password. If it does not arrive, check spam, then see the IT office with your student ID.',
      links: [{ href: '/forgot-password', text: 'Reset my password' }] },
    { test: /\b(sign\s?in|log\s?in|password|google|account|register|sign\s?up)\b/i,
      say: 'Sign in with your CSPC email and password, or Google if it is available. New here? Register with your CSPC email and type the 6-digit code we send you.',
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

  // ---- text to speech ------------------------------------------------------
  // Uses the browser's built-in voices (Web Speech API): no server, no key, no cost.
  // Each bot reply gets a small speaker button; a header toggle reads new replies
  // aloud automatically. Quietly absent in browsers without speech support.
  var synth = ('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window) ? window.speechSynthesis : null;
  var ttsOK = !!synth;
  var TTS_KEY = 'whereitis.concierge.tts';
  var SPEAK_LABEL = 'Read this reply aloud';
  var autoRead = false;
  try { autoRead = window.localStorage.getItem(TTS_KEY) === '1'; } catch (err) { /* storage blocked */ }
  var speakingBtn = null;
  var micAbort = null;               // set below when the chat mic exists
  var speakToken = 0;
  var voiceList = [];

  function loadVoices() { if (synth) voiceList = synth.getVoices() || []; }
  if (synth) {
    loadVoices();
    if (synth.addEventListener) synth.addEventListener('voiceschanged', loadVoices);
  }

  var FIL_RE = /\b(ang|ng|sa|mga|ako|ko|mo|ka|po|ba|na|ay|kung|paano|pano|saan|kailan|anong|ano|nawala|nawalang|nakita|salamat|kumusta|kamusta|bukas|ngayon|gamit|bagay|naman|din|rin|lang|namin|natin|niyo|ito|iyon|yung|wala|hindi|opo|oo)\b/gi;
  function looksFilipino(t) {
    var hits = (t.match(FIL_RE) || []).length;
    var words = t.split(/\s+/).length || 1;
    return hits >= 2 && hits / words >= 0.2;
  }

  function pickVoice(fil) {
    var prefs = fil ? ['fil', 'tl'] : ['en-ph', 'en-us', 'en'];
    for (var i = 0; i < prefs.length; i++) {
      for (var j = 0; j < voiceList.length; j++) {
        if (String(voiceList[j].lang || '').toLowerCase().indexOf(prefs[i]) === 0) return voiceList[j];
      }
    }
    return null;
  }

  // Plain speakable text: no markdown, reference numbers spelled out.
  function cleanForSpeech(text) {
    return String(text || '')
      .replace(/\[([^\]]+)\]\(\/[^)\s]*\)/g, '$1')
      .replace(/\*\*/g, '')
      .replace(/\bLF-(\d{4})-(\d+)\b/gi, 'L F $1, $2')
      .replace(/([.!?:])\s*\n+\s*/g, '$1 ')
      .replace(/\s*\n+\s*/g, '. ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Some browsers cut long utterances short, so speak sentence-sized pieces.
  function chunkText(text) {
    var parts = text.match(/[^.!?]+[.!?]*\s*/g) || [text];
    var out = [];
    var cur = '';
    parts.forEach(function (p) {
      if (cur && (cur + p).length > 180) { out.push(cur.trim()); cur = ''; }
      cur += p;
    });
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  function markSpeaking(btn, on) {
    if (!btn) return;
    btn.classList.toggle('is-speaking', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('aria-label', on ? 'Stop reading' : SPEAK_LABEL);
    btn.title = on ? 'Stop' : 'Listen';
  }

  function stopSpeaking() {
    if (!synth) return;
    speakToken += 1;                 // makes any pending "finished" callback a no-op
    synth.cancel();
    markSpeaking(speakingBtn, false);
    speakingBtn = null;
  }

  function speak(text, btn) {
    if (!synth) return;
    stopSpeaking();
    var clean = cleanForSpeech(text);
    if (!clean) return;
    var fil = looksFilipino(clean);
    var voice = pickVoice(fil);
    var parts = chunkText(clean);
    var token = speakToken;
    speakingBtn = btn || null;
    markSpeaking(btn, true);
    parts.forEach(function (part, i) {
      var u = new window.SpeechSynthesisUtterance(part);
      u.lang = voice ? voice.lang : (fil ? 'fil-PH' : 'en-PH');
      if (voice) u.voice = voice;
      u.rate = 1;
      if (i === parts.length - 1) {
        var finished = function () {
          if (token !== speakToken) return;
          markSpeaking(speakingBtn, false);
          speakingBtn = null;
        };
        u.onend = finished;
        u.onerror = finished;
      }
      synth.speak(u);
    });
  }

  function makeSpeakButton(text) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'concierge__speak';
    b.setAttribute('aria-label', SPEAK_LABEL);
    b.setAttribute('aria-pressed', 'false');
    b.title = 'Listen';
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a8 8 0 0 1 0 11"/></svg>';
    b._speakText = text;
    return b;
  }

  if (ttsOK) {
    var ttsCss = document.createElement('style');
    ttsCss.textContent =
      '.concierge__speak{display:inline-flex;align-items:center;justify-content:center;align-self:flex-start;width:26px;height:26px;margin:.3rem 0 0;padding:0;border:0;border-radius:999px;background:transparent;color:inherit;opacity:.6;cursor:pointer}' +
      '.concierge__speak svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}' +
      '.concierge__speak:hover,.concierge__speak:focus-visible{opacity:1;background:rgba(127,127,127,.2)}' +
      '.concierge__speak.is-speaking{opacity:1;background:rgba(56,140,220,.25)}' +
      '.concierge__tool[data-concierge-tts] .tts-slash{display:none}' +
      '.concierge__tool[data-concierge-tts][aria-pressed="false"] .tts-slash{display:inline}' +
      '.concierge__tool[data-concierge-tts][aria-pressed="true"]{background:rgba(56,140,220,.25)}';
    document.head.appendChild(ttsCss);
    window.addEventListener('pagehide', function () { if (synth) synth.cancel(); });
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

    if (ttsOK && e.who === 'bot' && e.text && !e.noSpeak) li.appendChild(makeSpeakButton(e.text));
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
    if (autoRead && ttsOK && entry.who === 'bot' && entry.text && !entry.noAuto) {
      speak(entry.text, li.querySelector('.concierge__speak'));
    }
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
    var el = buildEntry({ who: 'bot', text: label, noSpeak: true });
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
    stopSpeaking();
    log.innerHTML = '';
    saved = [];
    persist();
    greet();
  }

  function greet() {
    say({ who: 'bot', text: 'Hi! Ask me anything about WhereITis, or describe an item and I will look for it.', noAuto: true });
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
    stopSpeaking();
    if (micAbort) micAbort();
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
        var sp = e.target.closest && e.target.closest('.concierge__speak');
        if (sp) {
          if (speakingBtn === sp) stopSpeaking(); else speak(sp._speakText, sp);
          return;
        }
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

    // Header toggle: read new replies aloud automatically (remembered on this device).
    var cTools = $('.concierge__tools');
    if (ttsOK && cTools) {
      var tb = document.createElement('button');
      tb.type = 'button';
      tb.className = 'concierge__tool';
      tb.setAttribute('data-concierge-tts', '');
      tb.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a8 8 0 0 1 0 11"/><path class="tts-slash" d="M3.5 3.5l17 17"/></svg>';
      var syncTts = function () {
        tb.setAttribute('aria-pressed', autoRead ? 'true' : 'false');
        tb.setAttribute('aria-label', autoRead ? 'Turn off reading replies aloud' : 'Read replies aloud');
        tb.title = autoRead ? 'Reading replies aloud: on' : 'Read replies aloud: off';
      };
      syncTts();
      tb.addEventListener('click', function () {
        autoRead = !autoRead;
        try { window.localStorage.setItem(TTS_KEY, autoRead ? '1' : '0'); } catch (err) { /* ignore */ }
        if (!autoRead) stopSpeaking();
        syncTts();
      });
      cTools.insertBefore(tb, cTools.firstChild);
    }
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

    // ---- microphone: talk instead of typing -------------------------------
    // Tap the mic and speak. Your words appear in the box as you talk and are
    // sent automatically when you stop. EN / FIL picks the language it listens for.
    var sendBtn = form ? form.querySelector('.concierge__send') : null;
    if (Speech && form && cInput && sendBtn) {
      var MIC_LANG_KEY = 'whereitis.concierge.lang';
      var micLang = 'en-PH';
      try { if (window.localStorage.getItem(MIC_LANG_KEY) === 'fil-PH') micLang = 'fil-PH'; } catch (err) { /* ignore */ }
      var basePlaceholder = cInput.getAttribute('placeholder') || '';
      var hintTimer = null;
      var recog = null;

      var micCss = document.createElement('style');
      micCss.textContent =
        '.concierge__mic{flex:none;display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;padding:0;border:0;border-radius:999px;background:transparent;color:inherit;cursor:pointer}' +
        '.concierge__mic svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}' +
        '.concierge__mic:hover,.concierge__mic:focus-visible{background:rgba(127,127,127,.2)}' +
        '.concierge__mic.is-on{background:#d93a3a;color:#fff;animation:conciergeMic 1.2s ease-in-out infinite}' +
        '@keyframes conciergeMic{0%,100%{box-shadow:0 0 0 0 rgba(217,58,58,.5)}50%{box-shadow:0 0 0 7px rgba(217,58,58,0)}}' +
        '@media (prefers-reduced-motion:reduce){.concierge__mic.is-on{animation:none}}' +
        '.concierge__mic-lang{flex:none;padding:.35rem .35rem;border:0;border-radius:6px;background:transparent;color:inherit;font-size:.68rem;font-weight:700;letter-spacing:.04em;line-height:1;opacity:.75;cursor:pointer}' +
        '.concierge__mic-lang:hover,.concierge__mic-lang:focus-visible{opacity:1;background:rgba(127,127,127,.2)}';
      document.head.appendChild(micCss);

      var micBtn = document.createElement('button');
      micBtn.type = 'button';
      micBtn.className = 'concierge__mic';
      micBtn.setAttribute('aria-pressed', 'false');
      micBtn.setAttribute('aria-label', 'Speak your question');
      micBtn.title = 'Speak';
      micBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6"/></svg>';

      var langBtn = document.createElement('button');
      langBtn.type = 'button';
      langBtn.className = 'concierge__mic-lang';
      var syncLang = function () {
        var fil = micLang === 'fil-PH';
        langBtn.textContent = fil ? 'FIL' : 'EN';
        langBtn.setAttribute('aria-label', 'Speech language: ' + (fil ? 'Filipino' : 'English') + '. Tap to switch.');
        langBtn.title = langBtn.getAttribute('aria-label');
      };
      syncLang();
      langBtn.addEventListener('click', function () {
        micLang = micLang === 'fil-PH' ? 'en-PH' : 'fil-PH';
        try { window.localStorage.setItem(MIC_LANG_KEY, micLang); } catch (err) { /* ignore */ }
        syncLang();
      });

      form.insertBefore(langBtn, sendBtn);
      form.insertBefore(micBtn, langBtn);

      var hint = function (msg) {
        cInput.placeholder = msg;
        clearTimeout(hintTimer);
        hintTimer = setTimeout(function () { cInput.placeholder = basePlaceholder; }, 4500);
      };
      var micIdle = function () {
        micBtn.classList.remove('is-on');
        micBtn.setAttribute('aria-pressed', 'false');
        micBtn.setAttribute('aria-label', 'Speak your question');
        micBtn.title = 'Speak';
      };

      micAbort = function () {
        var r = recog;
        recog = null;
        micIdle();
        cInput.placeholder = basePlaceholder;
        if (r) { try { r.abort(); } catch (err) { /* ignore */ } }
      };

      micBtn.addEventListener('click', function () {
        if (recog) { try { recog.stop(); } catch (err) { /* ignore */ } return; }   // stop = send what was heard
        if (busy) return;
        stopSpeaking();                       // don't listen to our own voice
        clearTimeout(hintTimer);
        var r = new Speech();
        var finalText = '';
        var failure = '';
        r.lang = micLang;
        r.interimResults = true;
        r.maxAlternatives = 1;
        r.continuous = false;
        r.onresult = function (ev) {
          var interim = '';
          for (var i = ev.resultIndex; i < ev.results.length; i++) {
            var piece = ev.results[i][0].transcript;
            if (ev.results[i].isFinal) finalText += piece; else interim += piece;
          }
          cInput.value = (finalText + interim).slice(0, 300);
          cInput.dispatchEvent(new Event('input', { bubbles: true }));
        };
        r.onerror = function (ev) { failure = (ev && ev.error) || 'error'; };
        r.onend = function () {
          if (recog !== r) return;            // aborted or replaced
          recog = null;
          micIdle();
          cInput.placeholder = basePlaceholder;
          var text = cInput.value.trim();
          if (failure === 'not-allowed' || failure === 'service-not-allowed') {
            hint('Microphone is blocked. Allow it for this site in your browser.');
            return;
          }
          if (failure === 'network') { hint('Voice needs an internet connection. Try typing instead.'); return; }
          if (!text) { hint("I didn't catch that. Tap the mic and try again."); return; }
          if (typeof form.requestSubmit === 'function') form.requestSubmit();
          else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        };
        cInput.value = '';
        recog = r;
        try {
          r.start();
          micBtn.classList.add('is-on');
          micBtn.setAttribute('aria-pressed', 'true');
          micBtn.setAttribute('aria-label', 'Stop listening and send');
          micBtn.title = 'Stop';
          cInput.placeholder = micLang === 'fil-PH' ? 'Nakikinig… magsalita na' : 'Listening… go ahead';
        } catch (err) {
          recog = null;
          micIdle();
        }
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

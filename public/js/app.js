// public/js/app.js
// Progressive enhancement ONLY. This file adds convenience behaviours on top of
// a fully-working server-rendered app. If JavaScript is off, every feature
// still works because the server is the source of truth. Permitted and nothing
// more:
//   1. Confirm before submitting a destructive form
//   2. Auto-dismiss the flash banner
//   3. Remember the My Reports student number (localStorage ONLY, never the PIN)
//   4. Character counter under textareas
//   5. Show/hide the holding_location field based on kind (Lost vs Found)
//   6. Dark / light mode toggle (stores 'light' or 'dark' in localStorage; nothing else)
//   7. Cosmetic polish only (see "Visual polish" at the bottom): header shadow on scroll,
//      scroll-reveal of cards, count-up of the stat numbers. No data, no requests.
//   8. Press "/" to jump to the home-page search box
// NO fetch, NO rendering, NO state management, NO framework.

document.addEventListener('DOMContentLoaded', function () {

  // -------------------------------------------------------------------
  // 1. Destructive form confirm
  // -------------------------------------------------------------------
  document.querySelectorAll('form[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      if (!confirm(form.dataset.confirm)) {
        e.preventDefault();
      }
    });
  });

  // -------------------------------------------------------------------
  // 2. Auto-dismiss flash
  // -------------------------------------------------------------------
  function dismissFlash(flashEl) {
    flashEl.classList.add('flash--leaving');
    setTimeout(function () {
      if (flashEl.parentNode) {
        flashEl.parentNode.removeChild(flashEl);
      }
    }, 300);
  }

  document.querySelectorAll('[data-autodismiss]').forEach(function (flashEl) {
    const delay = parseInt(flashEl.dataset.autodismiss, 10) || 6000;
    setTimeout(function () {
      dismissFlash(flashEl);
    }, delay);
  });

  document.querySelectorAll('[data-dismiss-flash]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const flashEl = btn.closest('.flash');
      if (flashEl) {
        dismissFlash(flashEl);
      }
    });
  });

  // -------------------------------------------------------------------
  // 3. Remember me (My Reports student number) — localStorage ONLY,
  // NEVER the PIN. The PIN field is never read or written by this file.
  // -------------------------------------------------------------------
  const STUDENT_NO_KEY = 'whereitis_student_no';
  const studentNoField = document.querySelector('#student_no');
  const rememberCheckbox = document.querySelector('input[data-remember-student-no]');
  const signInForm = document.querySelector('form[action="/sign-in"], form[action="/my-reports/sign-in"]');

  if (studentNoField) {
    try {
      const savedStudentNo = localStorage.getItem(STUDENT_NO_KEY);
      if (savedStudentNo && !studentNoField.value) {
        studentNoField.value = savedStudentNo;
        if (rememberCheckbox) {
          rememberCheckbox.checked = true;
        }
      }
    } catch (err) {
      // localStorage may be unavailable (private browsing, disabled) —
      // fail silently, the form still works without this convenience.
    }
  }

  if (signInForm && studentNoField && rememberCheckbox) {
    signInForm.addEventListener('submit', function () {
      try {
        if (rememberCheckbox.checked) {
          localStorage.setItem(STUDENT_NO_KEY, studentNoField.value);
        } else {
          localStorage.removeItem(STUDENT_NO_KEY);
        }
      } catch (err) {
        // Same as above — never let storage failures block submission.
      }
    });
  }

  // -------------------------------------------------------------------
  // 4. Character counter
  // -------------------------------------------------------------------
  document.querySelectorAll('textarea[data-charcount]').forEach(function (textarea) {
    const min = parseInt(textarea.dataset.charcountMin, 10) || 0;
    const max = parseInt(textarea.dataset.charcountMax, 10) || null;

    const counter = document.createElement('p');
    counter.className = 'charcount';
    textarea.insertAdjacentElement('afterend', counter);

    function update() {
      const length = textarea.value.length;
      counter.textContent = max ? (length + ' / ' + max + ' characters') : (length + ' characters');

      const belowMin = length < min;
      const nearMax = max ? length > max * 0.9 : false;

      if (belowMin || nearMax) {
        counter.classList.add('charcount--warn');
        counter.classList.remove('charcount--ok');
      } else {
        counter.classList.add('charcount--ok');
        counter.classList.remove('charcount--warn');
      }
    }

    textarea.addEventListener('input', update);
    update();
  });

  // -------------------------------------------------------------------
  // 5. Kind toggle on report form — show/hide + enable/disable
  // holding_location based on the selected kind. Server-side validation
  // remains the source of truth: a curl request that bypasses this
  // entirely is still validated and rejected server-side if invalid.
  // -------------------------------------------------------------------
  document.querySelectorAll('form[action="/reports"], form[action$="/edit"]').forEach(function (form) {
    const kindRadios = form.querySelectorAll('input[type="radio"][name="kind"]');
    const foundOnlyEls = form.querySelectorAll('[data-found-only]');

    if (kindRadios.length === 0 || foundOnlyEls.length === 0) {
      return;
    }

    function applyToggle() {
      const checkedRadio = form.querySelector('input[type="radio"][name="kind"]:checked');
      const isFound = checkedRadio && checkedRadio.value === 'found';

      foundOnlyEls.forEach(function (el) {
        el.style.display = isFound ? '' : 'none';
        const input = el.querySelector('input, select, textarea');
        if (input) {
          input.disabled = !isFound;
          input.required = !!isFound;
        }
      });
    }

    kindRadios.forEach(function (radio) {
      radio.addEventListener('change', applyToggle);
    });

    applyToggle();
  });

  // -------------------------------------------------------------------
  // 6. Report an item form (progressive enhancement only)
  // -------------------------------------------------------------------
  const reportForm = document.querySelector('form[data-report-form]');
  if (reportForm) {
    // 6a. Wording and help panels follow the selected kind (lost / found).
    const kindOf = function () {
      const r = reportForm.querySelector('input[name="kind"]:checked');
      return r ? r.value : 'none';
    };
    const syncKind = function () {
      const kind = kindOf();
      document.querySelectorAll('[data-kind-label]').forEach(function (el) {
        if (kind === 'lost' || kind === 'found') { el.textContent = el.dataset[kind]; }
      });
      document.querySelectorAll('[data-show-for]').forEach(function (el) {
        el.hidden = el.dataset.showFor !== kind;
      });
    };
    reportForm.querySelectorAll('input[name="kind"]').forEach(function (r) { r.addEventListener('change', syncKind); });
    syncKind();

    // 6b. Cap tags at the server's limit (3).
    const picker = reportForm.querySelector('[data-max-tags]');
    if (picker) {
      const maxTags = parseInt(picker.dataset.maxTags, 10) || 3;
      const boxes = picker.querySelectorAll('input[type="checkbox"]');
      const syncTags = function () {
        const checked = picker.querySelectorAll('input[type="checkbox"]:checked').length;
        boxes.forEach(function (b) { b.disabled = !b.checked && checked >= maxTags; });
      };
      boxes.forEach(function (b) { b.addEventListener('change', syncTags); });
      syncTags();
    }

    // 6c. Photo link preview.
    const photoInput = reportForm.querySelector('#photo_url');
    const preview = reportForm.querySelector('[data-photo-preview]');
    if (photoInput && preview) {
      const img = preview.querySelector('[data-photo-img]');
      const msg = preview.querySelector('[data-photo-msg]');
      let timer = null;
      const showPreview = function () {
        const v = photoInput.value.trim();
        msg.hidden = true; img.hidden = false;
        if (!/^https?:\/\//i.test(v)) { preview.hidden = true; img.removeAttribute('src'); return; }
        preview.hidden = false; img.src = v;
      };
      img.addEventListener('error', function () { img.hidden = true; msg.hidden = false; });
      photoInput.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(showPreview, 400); });
      showPreview();

      // Chosen file: check size/type up front and preview it locally (the server re-checks everything).
      const fileInput = reportForm.querySelector('[data-photo-file]');
      if (fileInput) {
        fileInput.addEventListener('change', function () {
          const f = fileInput.files && fileInput.files[0];
          fileInput.setCustomValidity('');
          if (!f) { showPreview(); return; }
          if (f.size > 5 * 1024 * 1024) {
            fileInput.setCustomValidity('That photo is larger than 5 MB. Choose a smaller image.');
            fileInput.reportValidity(); return;
          }
          if (!/^image\/(jpeg|png|gif|webp)$/.test(f.type)) {
            fileInput.setCustomValidity('Photos must be JPG, PNG, GIF or WebP images.');
            fileInput.reportValidity(); return;
          }
          msg.hidden = true; img.hidden = false; preview.hidden = false;
          img.src = URL.createObjectURL(f);
        });
      }
    }

    // 6d. Validate with the browser first, then lock the button so a double click cannot post twice.
    const submitBtn = reportForm.querySelector('[data-submit]');
    reportForm.addEventListener('submit', function (e) {
      if (!reportForm.checkValidity()) {
        e.preventDefault();
        reportForm.reportValidity();
        return;
      }
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting\u2026'; }
    });

    // After a failed server-side validation, bring the error summary into view.
    const alertBox = document.getElementById('form-alert');
    if (alertBox) { alertBox.focus(); }
  }

  // -------------------------------------------------------------------
  // 7. Sign-in page: show/hide PIN, digits only, focus, no double submit
  // -------------------------------------------------------------------
  const authForm = document.querySelector('form[data-auth-form]');
  if (authForm) {
    const pin = authForm.querySelector('#pin');
    const toggle = authForm.querySelector('[data-toggle-pin]');
    if (pin && toggle) {
      toggle.addEventListener('click', function () {
        const show = pin.type === 'password';
        pin.type = show ? 'text' : 'password';
        toggle.textContent = show ? 'Hide' : 'Show';
        toggle.setAttribute('aria-pressed', show ? 'true' : 'false');
      });
      pin.addEventListener('input', function () { pin.value = pin.value.replace(/\D/g, '').slice(0, 4); });
    }
    const pin2 = authForm.querySelector('#pin_confirm');
    if (pin2) { pin2.addEventListener('input', function () { pin2.value = pin2.value.replace(/\D/g, '').slice(0, 4); }); }
    const fullName = authForm.querySelector('#full_name');
    const sn = authForm.querySelector('#student_no');
    if (fullName) { if (!authForm.querySelector('.field-error')) fullName.focus(); }
    else if (sn && pin) { (sn.value ? pin : sn).focus(); }

    const btn = authForm.querySelector('[data-submit]');
    authForm.addEventListener('submit', function (e) {
      if (pin2 && pin.value !== pin2.value) {
        e.preventDefault(); pin2.setCustomValidity('The two PINs do not match.'); pin2.reportValidity(); return;
      }
      if (pin2) pin2.setCustomValidity('');
      if (!authForm.checkValidity()) { e.preventDefault(); authForm.reportValidity(); return; }
      if (btn) { btn.disabled = true; btn.textContent = pin2 ? 'Creating account\u2026' : 'Signing in\u2026'; }
    });
  }

});


// ---------------------------------------------------------------------
// Visual polish — COSMETIC ONLY. Pages work identically without it.
// Skipped entirely for visitors who prefer reduced motion.
// ---------------------------------------------------------------------
(function () {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Header gets a soft shadow once the page is scrolled.
  const header = document.querySelector('.site-header');
  if (header) {
    let ticking = false;
    const apply = function () {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
      ticking = false;
    };
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(apply); }
    }, { passive: true });
    apply();
  }

  if (reduce || !('IntersectionObserver' in window)) { return; }

  // Switching a status tab / sort / filter / page on the page you are already on is a refinement, not a new
  // page: no entrance effects (head.ejs marks <html class="nav-refine">), so nothing hides, pops or counts up
  // again. A prerendered page is only marked once it is shown, so wait for that before deciding.
  function visualPolish() {
  const refining = document.documentElement.classList.contains('nav-refine');
  if (refining) { return; }

  // Scroll reveal: only content that starts BELOW the fold is hidden, then eased in as it
  // scrolls into view (so nothing flickers on first paint, and no-JS users see everything).
  const revealSel = '.card-grid > li, .board > li, .missing-list > li, .cat-tiles li, ' +
                    '.section-header, .expiring, .detail__body, .form-section, .empty-state';
  const below = Array.prototype.filter.call(document.querySelectorAll(revealSel), function (el) {
    return el.getBoundingClientRect().top > window.innerHeight * 0.92;
  });
  if (below.length) {
    const io = new IntersectionObserver(function (entries) {
      let n = 0;
      entries.forEach(function (en) {
        if (!en.isIntersecting) { return; }
        en.target.style.setProperty('--d', (Math.min(n++, 6) * 70) + 'ms');   // gentle stagger
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    below.forEach(function (el) { el.classList.add('reveal'); io.observe(el); });
  }

  // Count-up for the stat numbers (the real number is already in the HTML).
  document.querySelectorAll('.stat-card strong, .counter strong').forEach(function (el) {
    const target = parseInt(el.textContent.replace(/[^\d]/g, ''), 10);
    if (!isFinite(target) || target < 1) { return; }
    const text = el.textContent;
    const run = function () {
      const t0 = performance.now(), dur = 900;
      const step = function (now) {
        const p = Math.min((now - t0) / dur, 1);
        el.textContent = p < 1 ? String(Math.round(target * (1 - Math.pow(1 - p, 3)))) : text;
        if (p < 1) { window.requestAnimationFrame(step); }
      };
      window.requestAnimationFrame(step);
    };
    const seen = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { seen.disconnect(); run(); }
    }, { threshold: 0.4 });
    seen.observe(el);
  });
  }
  if (document.prerendering) { document.addEventListener('prerenderingchange', visualPolish, { once: true }); }
  else { visualPolish(); }
})();


// ---------------------------------------------------------------------
// Dark / light mode. The saved choice is applied before paint by a tiny script in head.ejs;
// this part only wires up the button. Without JS the page simply follows the device setting.
// ---------------------------------------------------------------------
(function () {
  const btn = document.querySelector('[data-theme-toggle]');
  if (!btn) { return; }
  const root = document.documentElement;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const KEY = 'whereitis_theme';

  const current = function () { return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; };
  const label = function () {
    const text = current() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    btn.setAttribute('aria-label', text);
    btn.setAttribute('title', text);
  };
  const set = function (theme) {
    root.setAttribute('data-theme', theme);
    try { localStorage.setItem(KEY, theme); } catch (err) { /* private mode: still works for this visit */ }
    label();
  };

  btn.hidden = false;
  label();

  btn.addEventListener('click', function () {
    const next = current() === 'dark' ? 'light' : 'dark';
    if (reduce || !document.startViewTransition) { set(next); return; }

    // circular reveal that grows from the button
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    root.classList.add('theme-switching');
    const vt = document.startViewTransition(function () { set(next); });
    vt.ready.then(function () {
      root.animate(
        { clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + radius + 'px at ' + x + 'px ' + y + 'px)'] },
        { duration: 650, easing: 'cubic-bezier(.22, 1, .36, 1)', pseudoElement: '::view-transition-new(root)' }
      );
    }).catch(function () { /* transition skipped: theme is already switched */ });
    vt.finished.finally(function () { root.classList.remove('theme-switching'); });
  });

  // Follow the device setting live, but only until the visitor makes their own choice.
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
      let saved = null;
      try { saved = localStorage.getItem(KEY); } catch (err) {}
      if (saved !== 'light' && saved !== 'dark') { root.setAttribute('data-theme', e.matches ? 'dark' : 'light'); label(); }
    });
  }
})();


// ---------------------------------------------------------------------
// Press "/" to focus the search box on the home page (ignored while typing in a field).
// ---------------------------------------------------------------------
(function () {
  const q = document.getElementById('hero-q');
  if (!q) { return; }
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) { return; }
    const t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) { return; }
    e.preventDefault();
    q.focus();
    q.select();
  });
})();


// ---------------------------------------------------------------------
// FX pass — COSMETIC ONLY (same rules as "Visual polish" above: no data, no requests, no state).
// Adds classes / CSS variables that the "FX PASS" block at the end of style.css reacts to.
//   a. spotlight that follows the cursor over cards
//   b. match score -> meter width + strength colour
//   c. holding-period bars wait until they are seen, then fill
//   d. photos: shimmer while loading, soft focus-in when ready
//   e. phones: header slides away when scrolling down, back when scrolling up
// ---------------------------------------------------------------------
(function () {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  // b. Match score -> meter. 125 is the most the rubric in lib/matching.js can award. Static, so reduced-motion users get it too.
  document.querySelectorAll('.match-card').forEach(function (card) {
    const ribbon = card.querySelector('.match-card__ribbon');
    const m = ribbon && /Score\s+(\d+)/i.exec(ribbon.textContent);
    if (!m) { return; }
    const s = Math.max(0, Math.min(1, Number(m[1]) / 125));
    card.style.setProperty('--score', s.toFixed(3));
    card.dataset.strength = s >= 0.64 ? 'high' : s >= 0.44 ? 'mid' : 'low';
  });

  if (reduce) { return; }

  // a. Spotlight
  if (fine) {
    const SEL = '.report-card, .custody, .missing, .match-card, .stat-card, .how__steps li';
    let raf = 0, el = null, px = 0, py = 0;
    document.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse' || !e.target.closest) { return; }
      const hit = e.target.closest(SEL);
      if (!hit) { return; }
      el = hit; px = e.clientX; py = e.clientY;
      if (raf) { return; }
      raf = window.requestAnimationFrame(function () {
        raf = 0;
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', (px - r.left) + 'px');
        el.style.setProperty('--my', (py - r.top) + 'px');
      });
    }, { passive: true });
  }

  // c. Holding bars below the fold wait (bar empty) until they scroll into view. Bars already on screen just animate on load.
  if ('IntersectionObserver' in window) {
    const bars = Array.prototype.filter.call(document.querySelectorAll('.retention'), function (r) {
      return r.getBoundingClientRect().top > window.innerHeight * 0.95;
    });
    if (bars.length) {
      const io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) { return; }
          en.target.classList.remove('fx-wait');
          io.unobserve(en.target);
        });
      }, { threshold: 0.6 });
      bars.forEach(function (r) { r.classList.add('fx-wait'); io.observe(r); });
    }
  }

  // d. Photos that are not loaded yet get a shimmer; once loaded they ease in. (The report page's own photo is left
  //    alone on purpose: it is the target of the card -> report morph and must be ready when the morph lands.)
  document.querySelectorAll('.report-card__photo-wrap img, .custody__photo img, .registry__thumb img').forEach(function (img) {
    if (img.complete) { return; }
    const wrap = img.parentElement;
    wrap.classList.add('img-pending');
    const done = function (ok) { wrap.classList.remove('img-pending'); if (ok) { img.classList.add('img-in'); } };
    img.addEventListener('load', function () { done(true); }, { once: true });
    img.addEventListener('error', function () { done(false); }, { once: true });
  });

  // e. Header tucks away on phones while reading (CSS only applies this at <= 860px, and never while focus is inside it).
  const header = document.querySelector('.site-header');
  if (header) {
    let last = window.scrollY, ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) { return; }
      ticking = true;
      window.requestAnimationFrame(function () {
        const y = window.scrollY, d = y - last;
        if (Math.abs(d) >= 8) {
          header.classList.toggle('is-tucked', d > 0 && y > 200);
          last = y;
        }
        ticking = false;
      });
    }, { passive: true });
  }
})();
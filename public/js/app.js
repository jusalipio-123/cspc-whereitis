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
  const signInForm = document.querySelector('form[action="/my-reports/sign-in"]');

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
        }
      });
    }

    kindRadios.forEach(function (radio) {
      radio.addEventListener('change', applyToggle);
    });

    applyToggle();
  });

});
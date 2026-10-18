// public/js/chat.js
// CSPC WhereITis — chat page behaviour: open at the newest message, auto-growing
// input, Enter to send (Shift+Enter = new line), send button state, char counter,
// and protection against double-sending.
(function () {
  'use strict';

  var log = document.getElementById('chat-log');
  var form = document.getElementById('chat-form');
  if (!log || !form) return;

  var input = form.querySelector('[data-chat-input]');
  var send = form.querySelector('[data-chat-send]');
  var count = form.querySelector('[data-chat-count]');
  var max = input ? parseInt(input.getAttribute('data-max'), 10) || 1000 : 1000;

  // Open the conversation at the newest message (no animation on first paint).
  function toBottom(smooth) {
    if (!smooth) log.style.scrollBehavior = 'auto';
    log.scrollTop = log.scrollHeight;
    if (!smooth) log.style.scrollBehavior = '';
  }
  toBottom(false);
  window.addEventListener('load', function () { toBottom(false); });

  if (!input || !send) return;

  function grow() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 150) + 'px';
  }

  function update() {
    var len = input.value.length;
    send.disabled = input.value.trim().length === 0;
    if (count) {
      if (len >= max * 0.8) {
        count.hidden = false;
        count.textContent = len + ' / ' + max;
        count.classList.toggle('is-near', len >= max * 0.95);
      } else {
        count.hidden = true;
      }
    }
    grow();
  }

  input.addEventListener('input', update);

  // Enter sends; Shift+Enter inserts a new line. Ignored while composing (IME).
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      if (input.value.trim().length > 0) {
        if (typeof form.requestSubmit === 'function') form.requestSubmit();
        else form.submit();
      }
    }
  });

  var sending = false;
  form.addEventListener('submit', function (e) {
    if (sending || input.value.trim().length === 0) {
      e.preventDefault();
      return;
    }
    sending = true;
    send.disabled = true;
  });

  update();
  // If the server sent the form back with an error, keep the cursor in the box.
  if (input.getAttribute('aria-invalid') === 'true') {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
})();

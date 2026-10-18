// public/js/nav-menu.js
// CSPC WhereITis — the profile dropdown in the header (<details data-profile-menu>).
// The menu opens and closes natively; this only adds the "close" behaviours people expect:
// click elsewhere, press Escape, tab away, or follow a link.
(function () {
  'use strict';
  var menu = document.querySelector('[data-profile-menu]');
  if (!menu) return;

  function close(returnFocus) {
    if (!menu.open) return;
    menu.open = false;
    if (returnFocus) {
      var s = menu.querySelector('summary');
      if (s) s.focus();
    }
  }

  document.addEventListener('click', function (e) {
    if (menu.open && !menu.contains(e.target)) close(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && menu.open) close(true);
  });
  menu.addEventListener('focusout', function (e) {
    // focus moved somewhere outside the menu (e.g. Tab past the last item)
    if (menu.open && e.relatedTarget && !menu.contains(e.relatedTarget)) close(false);
  });
  menu.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () { close(false); });
  });
})();

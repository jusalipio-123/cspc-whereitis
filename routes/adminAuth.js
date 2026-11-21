// routes/adminAuth.js
// /admin/login is no longer a separate sign-in form. It is kept only as a
// compatibility redirect to the shared /sign-in page so old bookmarks still
// work. Admin authorization is enforced by middleware/roles.js on /admin.

const express = require('express');

const router = express.Router();

function toSharedSignIn(req, res) {
  return res.redirect(303, '/sign-in?next=%2Fadmin');
}

router.get('/', toSharedSignIn);
router.post('/', toSharedSignIn);

module.exports = router;

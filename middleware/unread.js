// middleware/unread.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// Puts two small things about the signed-in user on res.locals so the nav
// can show them on every page:
//   - unreadCount : unread-notification count (badge on "Inbox")
//   - profileName : the user's full name (revealed when hovering the
//                   profile icon)
// Signed-in users only; one indexed COUNT and one primary-key lookup, run
// together. A failure just hides the badge / falls back to the student
// number; it never breaks the page.
// -----------------------------------------------------------------------

const notificationModel = require('../models/notificationModel');
const userModel = require('../models/userModel');

module.exports = async function unread(req, res, next) {
  res.locals.unreadCount = 0;
  res.locals.profileName = '';
  if (!req.identity) return next();

  const [count, user] = await Promise.allSettled([
    notificationModel.unreadCount(req.identity.userId),
    userModel.findById(req.identity.userId),
  ]);
  if (count.status === 'fulfilled') res.locals.unreadCount = count.value;
  if (user.status === 'fulfilled' && user.value && user.value.full_name) {
    res.locals.profileName = user.value.full_name;
  }
  next();
};

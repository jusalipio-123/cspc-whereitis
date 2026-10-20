// middleware/navInfo.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// Puts two small things about the signed-in user on res.locals so the nav
// can show them on every page:
//   - pendingClaims : number of claims on the user's reports that still
//                     wait for their decision (badge on the profile icon)
//   - profileName   : the user's full name (shown in the account menu)
// Signed-in users only; one COUNT and one primary-key lookup, run together.
// A failure just hides the badge / falls back to the student number; it
// never breaks the page.
// -----------------------------------------------------------------------

const claimModel = require('../models/claimModel');
const userModel = require('../models/userModel');

module.exports = async function navInfo(req, res, next) {
  res.locals.pendingClaims = 0;
  res.locals.profileName = '';
  if (!req.identity) return next();

  const [count, user] = await Promise.allSettled([
    claimModel.countPendingForOwner(req.identity.userId),
    userModel.findById(req.identity.userId),
  ]);
  if (count.status === 'fulfilled') res.locals.pendingClaims = count.value;
  if (user.status === 'fulfilled' && user.value && user.value.full_name) {
    res.locals.profileName = user.value.full_name;
  }
  next();
};

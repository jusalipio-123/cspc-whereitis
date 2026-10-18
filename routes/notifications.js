// routes/notifications.js
// In-app notifications for registered users (claim filed on my report, status
// changed, my claim decided, new message). Registered users only.
// Rule: every POST redirects with 303 and shows a flash. Every GET is safe and
// idempotent.

const express = require('express');
const router = express.Router();
const notificationModel = require('../models/notificationModel');
const validate = require('../middleware/validate');
const { requireIdentity } = require('../middleware/identity');

router.use(requireIdentity);

// GET /notifications
router.get('/', async (req, res, next) => {
  try {
    const notifications = await notificationModel.listByUser(req.identity.userId, 50);
    res.render('notifications/index', { title: 'Notifications', notifications });
  } catch (err) {
    next(err);
  }
});

// POST /notifications/read-all
router.post('/read-all', async (req, res, next) => {
  try {
    await notificationModel.markAllRead(req.identity.userId);
    res.redirect(303, '/notifications?flash=ok:All%20notifications%20marked%20as%20read');
  } catch (err) {
    next(err);
  }
});

// POST /notifications/:id/read
router.post('/:id/read', async (req, res, next) => {
  try {
    const idResult = validate.isInt({ min: 1 }, 'Notification')(req.params.id);
    if (idResult.ok) await notificationModel.markRead(idResult.value, req.identity.userId);
    res.redirect(303, '/notifications');
  } catch (err) {
    next(err);
  }
});

module.exports = router;

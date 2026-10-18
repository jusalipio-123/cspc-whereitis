// routes/messages.js
// Direct messages between REGISTERED users. A thread is always about one
// report: it is started from that report's page and goes to the report's owner.
// Rule: every POST redirects with 303 and shows a flash. Every GET is safe and
// idempotent in effect (opening a thread marks its messages read, and
// repeating that changes nothing further).

const express = require('express');
const router = express.Router();
const messageModel = require('../models/messageModel');
const reportModel = require('../models/reportModel');
const notificationModel = require('../models/notificationModel');
const validate = require('../middleware/validate');
const { requireIdentity } = require('../middleware/identity');

const MAX_MESSAGES_PER_HOUR = 20;

router.use(requireIdentity);

const bodyRule = validate.compose(
  validate.required('Message'),
  validate.maxLen(1000, 'Message')
);

async function overLimit(userId) {
  return (await messageModel.countRecentBySender(userId, 60)) >= MAX_MESSAGES_PER_HOUR;
}

// who can be messaged about this report? Returns { report } or { error, status }.
async function messageableReport(reference, viewerId) {
  const report = await reportModel.findByReference(reference);
  // Withdrawn reports are visible to their uploader only.
  if (!report || !reportModel.canView(report, { userId: viewerId })) return { status: 404 };
  if (report.user_id === viewerId) return { status: 422, error: 'This is your own report.' };
  return { report };
}

// GET /messages  (inbox)
router.get('/', async (req, res, next) => {
  try {
    const conversations = await messageModel.listForUser(req.identity.userId);
    res.render('messages/inbox', { title: 'Messages', conversations, me: req.identity.userId });
  } catch (err) {
    next(err);
  }
});

// GET /messages/new?report=LF-YYYY-NNNN
router.get('/new', async (req, res, next) => {
  try {
    const result = await messageableReport(String(req.query.report || ''), req.identity.userId);
    if (result.status === 404) return res.status(404).render('errors/404', { title: 'Not found' });
    if (result.error) {
      return res.redirect(303, '/reports/' + encodeURIComponent(req.query.report) + '?flash=err:' + encodeURIComponent(result.error));
    }
    // One thread per person per report: reopen it instead of starting another.
    const existing = await messageModel.findExisting(result.report.id, req.identity.userId);
    if (existing) return res.redirect(303, '/messages/' + existing);

    res.render('messages/new', { title: 'Send a message', report: result.report, values: {}, errors: {} });
  } catch (err) {
    next(err);
  }
});

// POST /messages  (start a thread + first message)
router.post('/', async (req, res, next) => {
  try {
    const result = await messageableReport(String(req.body.report_reference || ''), req.identity.userId);
    if (result.status === 404) return res.status(404).render('errors/404', { title: 'Not found' });
    if (result.error) {
      return res.redirect(303, '/reports/' + encodeURIComponent(req.body.report_reference) + '?flash=err:' + encodeURIComponent(result.error));
    }
    const report = result.report;

    const bodyResult = bodyRule(req.body.body);
    if (!bodyResult.ok) {
      return res.status(422).render('messages/new', {
        title: 'Send a message', report, values: { body: bodyResult.value }, errors: { body: bodyResult.error },
      });
    }
    if (await overLimit(req.identity.userId)) {
      return res.status(429).render('messages/new', {
        title: 'Send a message', report, values: { body: bodyResult.value },
        errors: { body: 'You have sent a lot of messages in the last hour. Please try again later.' },
      });
    }

    const convId = await messageModel.findOrCreateConversation(report.id, report.user_id, req.identity.userId);
    await messageModel.addMessage(convId, req.identity.userId, bodyResult.value);
    await notificationModel.create({
      user_id: report.user_id,
      type: 'message_received',
      report_id: report.id,
      body: 'New message about ' + report.reference_no,
      link: '/messages/' + convId,
    });

    res.redirect(303, '/messages/' + convId + '?flash=ok:Message%20sent');
  } catch (err) {
    next(err);
  }
});

// GET /messages/:id
router.get('/:id', async (req, res, next) => {
  try {
    const idResult = validate.isInt({ min: 1 }, 'Conversation')(req.params.id);
    const conv = idResult.ok ? await messageModel.getForUser(idResult.value, req.identity.userId) : null;
    if (!conv) return res.status(404).render('errors/404', { title: 'Not found' });

    await messageModel.markThreadRead(conv.id, req.identity.userId);
    await notificationModel.markLinkRead(req.identity.userId, '/messages/' + conv.id);
    const messages = await messageModel.listMessages(conv.id);

    res.render('messages/thread', {
      title: 'Messages about ' + conv.reference_no,
      conv,
      messages,
      me: req.identity.userId,
      values: {},
      errors: {},
    });
  } catch (err) {
    next(err);
  }
});

// POST /messages/:id  (reply)
router.post('/:id', async (req, res, next) => {
  try {
    const idResult = validate.isInt({ min: 1 }, 'Conversation')(req.params.id);
    const conv = idResult.ok ? await messageModel.getForUser(idResult.value, req.identity.userId) : null;
    if (!conv) return res.status(404).render('errors/404', { title: 'Not found' });

    const bodyResult = bodyRule(req.body.body);
    let error = bodyResult.ok ? null : bodyResult.error;
    if (!error && (await overLimit(req.identity.userId))) {
      error = 'You have sent a lot of messages in the last hour. Please try again later.';
    }
    if (error) {
      const messages = await messageModel.listMessages(conv.id);
      return res.status(error.includes('hour') ? 429 : 422).render('messages/thread', {
        title: 'Messages about ' + conv.reference_no,
        conv, messages, me: req.identity.userId,
        values: { body: bodyResult.value }, errors: { body: error },
      });
    }

    await messageModel.addMessage(conv.id, req.identity.userId, bodyResult.value);
    const other = conv.owner_user_id === req.identity.userId ? conv.starter_user_id : conv.owner_user_id;
    await notificationModel.create({
      user_id: other,
      type: 'message_received',
      report_id: conv.report_id,
      body: 'New message about ' + conv.reference_no,
      link: '/messages/' + conv.id,
    });

    res.redirect(303, '/messages/' + conv.id + '#latest');
  } catch (err) {
    next(err);
  }
});

module.exports = router;

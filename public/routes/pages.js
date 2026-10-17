// routes/pages.js
// Static content routes — About, Privacy, Terms, Cookies, Accessibility, Help.
// Each renders a view under views/pages/ with a unique title.

const express = require('express');
const router = express.Router();

router.get('/about', (req, res) => {
  res.render('pages/about', { title: 'About' });
});

router.get('/privacy', (req, res) => {
  res.render('pages/privacy', { title: 'Privacy Notice' });
});

router.get('/terms', (req, res) => {
  res.render('pages/terms', { title: 'Terms of Use' });
});

router.get('/cookies', (req, res) => {
  res.render('pages/cookies', { title: 'Cookie Notice' });
});

router.get('/accessibility', (req, res) => {
  res.render('pages/accessibility', { title: 'Accessibility Statement' });
});

router.get('/help', (req, res) => {
  res.render('pages/help', { title: 'User guide' });
});

module.exports = router;
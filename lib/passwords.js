// lib/passwords.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// Password rules + slow, salted hashing.
//
// WHY scrypt: it is deliberately slow AND memory-hungry, so a hacker who
// steals the database cannot cheaply try billions of guesses (a plain
// SHA-256 hash can be tested at billions per second on a gaming GPU).
// It ships with Node, so there is nothing extra to install.
//
// Stored format (one string, so the cost can be raised later without
// breaking old passwords):
//     scrypt$N$r$p$<salt hex>$<hash hex>
// -----------------------------------------------------------------------

const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);

const PARAMS = { N: 32768, r: 8, p: 3 };   // OWASP-recommended scrypt setting (about 32 MiB per hash)
const KEY_LEN = 64;
const MAX_MEM = 128 * 1024 * 1024;

const MIN_LENGTH = 10;
const MAX_LENGTH = 128;

function normalise(password) {
  // NFKC so the "same" password typed on different keyboards hashes the same.
  return String(password).normalize('NFKC');
}

async function derive(password, salt, params) {
  return scrypt(normalise(password), salt, KEY_LEN, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: MAX_MEM,
  });
}

// hash: returns the single string to store in users.password_hash.
async function hash(password) {
  const salt = crypto.randomBytes(16);
  const key = await derive(password, salt, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('hex'), key.toString('hex')].join('$');
}

// verify: true only if the password matches the stored string.
// Uses a constant-time comparison.
async function verify(password, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (![N, r, p].every(Number.isInteger) || N < 1024 || N > 1 << 20 || r < 1 || r > 16 || p < 1 || p > 16) {
    return false;
  }

  const salt = Buffer.from(parts[4], 'hex');
  const expected = Buffer.from(parts[5], 'hex');
  if (salt.length === 0 || expected.length === 0) return false;

  const actual = await scrypt(normalise(password), salt, expected.length, { N, r, p, maxmem: MAX_MEM });
  return crypto.timingSafeEqual(actual, expected);
}

// dummyVerify: do the same amount of work as a real check. Called when the
// student number does not exist, so response time never reveals whether an
// account exists.
const DUMMY_SALT = Buffer.alloc(16, 7);
async function dummyVerify(password) {
  await derive(password, DUMMY_SALT, PARAMS);
  return false;
}

// ---------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------

// Passwords that people (and attackers) try first. Compared after lower-casing,
// swapping look-alike symbols (p@ssw0rd -> password) and dropping trailing digits.
const COMMON = new Set([
  'password', 'passw0rd', 'password1', 'pass', 'passcode', 'passphrase', 'admin', 'administrator', 'root',
  'welcome', 'welcome1', 'letmein', 'login', 'secret', 'iloveyou', 'iloveu', 'ilovegod', 'godisgood',
  'qwerty', 'qwertyuiop', 'qwertyui', 'asdfghjkl', 'asdfgh', 'zxcvbnm', 'azerty', '1q2w3e4r', '1qaz2wsx',
  'abc', 'abcd', 'abcde', 'abcdef', 'abcdefg', 'abcdefgh', 'abcdefghij', 'abcd1234', 'abc12345', 'abc123456',
  'monkey', 'dragon', 'master', 'shadow', 'sunshine', 'princess', 'football', 'baseball', 'basketball',
  'superman', 'batman', 'trustno1', 'starwars', 'pokemon', 'whatever', 'freedom', 'michael', 'jordan',
  'liverpool', 'chelsea', 'barcelona', 'lakers', 'hello', 'helloworld', 'test', 'testing', 'tester', 'guest',
  'user', 'default', 'changeme', 'student', 'teacher', 'school', 'college', 'university', 'computer',
  'internet', 'pilipinas', 'philippines', 'filipino', 'pinoy', 'pinay', 'manila', 'bicol', 'naga',
  'nagacity', 'camarinessur', 'camarines', 'iriga', 'cspc', 'cspcnaga', 'cspcstudent', 'cspcwhereitis',
  'whereitis', 'lostandfound', 'lostfound', 'mahalkita', 'iloveyoupo', 'kapatid', 'maganda', 'gwapo',
  'bahaykubo', 'mabuhay', 'angel', 'angelo', 'angela', 'jessica', 'jennifer', 'michelle', 'ashley',
  'nicole', 'daniel', 'joshua', 'andrew', 'christian', 'kenneth', 'mark', 'john', 'johnpaul', 'maria',
  'jose', 'juan', 'juandelacruz', 'delacruz', 'santos', 'reyes', 'garcia', 'bautista', 'villanueva',
  'rizal', 'bonifacio', 'lovely', 'loveyou', 'lovers', 'forever', 'forevermore', 'friends', 'family',
  'happy', 'happiness', 'blessed', 'jesus', 'jesuschrist', 'godbless', 'mylove', 'myself', 'cookie',
  'chocolate', 'banana', 'orange', 'purple', 'rainbow', 'summer', 'winter', 'flower', 'butterfly',
  'cheese', 'pepper', 'ginger', 'killer', 'hunter', 'ranger', 'soccer', 'hockey', 'tennis', 'golfer',
  'mustang', 'harley', 'ferrari', 'porsche', 'yamaha', 'honda', 'toyota', 'nissan', 'gamer', 'gaming',
  'minecraft', 'fortnite', 'roblox', 'mobilelegends', 'genshin', 'naruto', 'goku', 'anime', 'kpop', 'bts',
]);

const LEET = { '@': 'a', '4': 'a', '0': 'o', '1': 'i', '!': 'i', '3': 'e', '$': 's', '5': 's', '7': 't' };

function decodeLetters(s) {
  return s.toLowerCase().replace(/[@4013$!57]/g, (c) => LEET[c]).replace(/[^a-z]/g, '');
}

// Same as decodeLetters, but first drops digits/symbols stuck on the end
// ("P@ssw0rd!!" -> "p@ssw0rd" -> "password").
function stripToLetters(s) {
  return decodeLetters(s);
}

function isCommon(password) {
  const lower = password.toLowerCase();
  const plain = lower.replace(/[^a-z0-9]/g, '');
  const noTrailing = plain.replace(/[0-9]+$/, '');
  const trimmed = lower.replace(/[^a-z]+$/, '').replace(/[0-9!@#$%^&*()_+=.,?-]+$/, '');
  return (
    COMMON.has(plain) ||
    COMMON.has(noTrailing) ||
    COMMON.has(decodeLetters(trimmed)) ||
    COMMON.has(decodeLetters(lower))
  );
}

const SEQUENCES = [
  'abcdefghijklmnopqrstuvwxyz',
  '0123456789012345678901234567890',
  'qwertyuiopasdfghjklzxcvbnm',
  'qazwsxedcrfvtgbyhnujmikolp',
];

function isSequenceOrRepeat(password) {
  const p = password.toLowerCase().replace(/\s+/g, '');
  if (p.length === 0) return true;
  if (/^(.)\1*$/.test(p)) return true;                                 // aaaaaaaaaa
  if (/^(.{1,4})\1+$/.test(p)) return true;                            // abcabcabcabc, 12341234
  const rev = p.split('').reverse().join('');
  const core = p.replace(/[0-9]+$/, '');                               // abcdefghijk1 (sequence + a digit)
  const coreRev = core.split('').reverse().join('');
  return SEQUENCES.some((seq) =>
    seq.includes(p) || seq.includes(rev) || (core.length >= 8 && (seq.includes(core) || seq.includes(coreRev)))
  );                                                                   // 1234567890, qwertyuiop
}

function alnum(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// containsPersonalInfo: the password must not be built from the account's own details.
function containsPersonalInfo(password, ctx) {
  const pw = alnum(password);
  const pwLetters = stripToLetters(password);

  const digits = String(ctx.student_no || '').replace(/\D/g, '');
  if (digits.length >= 6 && pw.includes(digits)) return true;

  const local = alnum(String(ctx.email || '').split('@')[0]);
  const localLetters = local.replace(/[0-9]/g, '');
  if (local.length >= 4 && pw.includes(local)) return true;
  if (localLetters.length >= 4 && pwLetters.includes(localLetters)) return true;

  const nameParts = String(ctx.full_name || '').toLowerCase().split(/[^a-z\u00c0-\u024f]+/).filter((w) => w.length >= 4);
  return nameParts.some((w) => pwLetters.includes(alnum(w)));
}

// validate: returns an error message (string) or null when the password is acceptable.
// ctx = { student_no, email, full_name } of the person choosing it.
function validate(password, ctx) {
  ctx = ctx || {};
  if (typeof password !== 'string' || password.length === 0) return 'Please enter a password.';
  if (password.length < MIN_LENGTH) return 'Password must be at least ' + MIN_LENGTH + ' characters long.';
  if (password.length > MAX_LENGTH) return 'Password must be ' + MAX_LENGTH + ' characters or fewer.';
  if (!/\p{L}/u.test(password) || !/[^\p{L}]/u.test(password)) {
    return 'Mix letters with numbers, symbols or spaces. A passphrase like "blue mango river 42" works well.';
  }
  if (isSequenceOrRepeat(password)) return 'That password is too predictable (repeats or a keyboard/number sequence). Choose something less guessable.';
  if (containsPersonalInfo(password, ctx)) return 'Your password must not contain your name, student number or email.';
  if (isCommon(password)) return 'That password is too common and is one of the first things attackers try. Choose something less guessable.';
  return null;
}

module.exports = { hash, verify, dummyVerify, validate, MIN_LENGTH, MAX_LENGTH };

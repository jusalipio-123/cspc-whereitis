// scripts/check.js
// Dependency-free smoke check for the "does it even load?" class of bugs:
//   - every .js file parses (node --check)
//   - every .ejs template compiles (so missing/mistyped tags are caught)
//
// This would have caught the syntax error that kept routes/admin.js from
// ever loading while the router was unmounted. Run with: npm run check
// No database connection is needed.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const jsRoots = ['app.js', 'server.js', 'db.js', 'lib', 'middleware', 'models', 'routes', 'scripts', 'views/partials'];
const ejsRoots = ['views'];

function walk(relPath, extension) {
  const abs = path.join(root, relPath);
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
    return abs.endsWith(extension) ? [relPath] : [];
  }
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((entry) =>
    walk(path.join(relPath, entry.name), extension)
  );
}

let failures = 0;

for (const jsRoot of jsRoots) {
  for (const file of walk(jsRoot, '.js')) {
    try {
      execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' });
    } catch (err) {
      failures++;
      console.error(`JS syntax error: ${file}`);
      console.error(String(err.stderr || err.message).trim());
    }
  }
}

let ejs;
try {
  ejs = require('ejs');
} catch (err) {
  failures++;
  console.error('ejs is not installed — run "npm install" before "npm run check".');
}

if (ejs) {
  const templates = ejsRoots.flatMap((dir) => walk(dir, '.ejs'));
  for (const file of templates) {
    const abs = path.join(root, file);
    try {
      ejs.compile(fs.readFileSync(abs, 'utf8'), { filename: abs });
    } catch (err) {
      failures++;
      console.error(`EJS error: ${file} — ${err.message}`);
    }
  }
  console.log(`Checked ${templates.length} EJS templates.`);
}

if (failures) {
  console.error(`\n${failures} problem(s) found.`);
  process.exit(1);
}
console.log('All checks passed.');

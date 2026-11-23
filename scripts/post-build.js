const fs = require('fs');
const path = require('path');

const rootDist = path.join(__dirname, '..', 'dist');
const browserDist = path.join(rootDist, 'dashboard-angular', 'browser');

if (!fs.existsSync(browserDist)) {
  console.error('[post-build] Error: browser dist does not exist at', browserDist);
  process.exit(1);
}

const targets = [
  path.join(rootDist, 'cloudflare'),
  path.join(rootDist, 'browser'),
  path.join(rootDist, 'public'),
  path.join(rootDist, 'dashboard-angular')
];

for (const target of targets) {
  fs.mkdirSync(target, { recursive: true });
  fs.cpSync(browserDist, target, { recursive: true });
}

// Copy directly to root dist as well so if output directory is "dist", index.html is found immediately
const files = fs.readdirSync(browserDist);
for (const file of files) {
  const srcFile = path.join(browserDist, file);
  const destFile = path.join(rootDist, file);
  if (!fs.statSync(srcFile).isDirectory()) {
    fs.copyFileSync(srcFile, destFile);
  }
}

// Ensure _redirects is present everywhere
const redirectsSrc = path.join(__dirname, '..', 'public', '_redirects');
if (fs.existsSync(redirectsSrc)) {
  for (const target of [...targets, rootDist, browserDist]) {
    fs.copyFileSync(redirectsSrc, path.join(target, '_redirects'));
  }
}

console.log('[post-build] Successfully populated all target directories:');
console.log(' - dist/ (direct)');
console.log(' - dist/cloudflare/');
console.log(' - dist/dashboard-angular/browser/');
console.log(' - dist/dashboard-angular/');
console.log(' - dist/browser/');

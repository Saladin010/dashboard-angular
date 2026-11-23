const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'dist', 'dashboard-angular', 'browser');
const targets = [
  path.join(__dirname, '..', 'dist', 'cloudflare'),
  path.join(__dirname, '..', 'dist', 'browser'),
  path.join(__dirname, '..', 'dist', 'public')
];

if (fs.existsSync(src)) {
  for (const target of targets) {
    fs.mkdirSync(target, { recursive: true });
    fs.cpSync(src, target, { recursive: true });
  }
  const redirectsSrc = path.join(__dirname, '..', 'public', '_redirects');
  if (fs.existsSync(redirectsSrc)) {
    for (const target of targets) {
      fs.copyFileSync(redirectsSrc, path.join(target, '_redirects'));
    }
    fs.copyFileSync(redirectsSrc, path.join(src, '_redirects'));
  }
  console.log('[post-build] Copied build outputs to dist/cloudflare and all fallback paths with _redirects.');
} else {
  console.warn('[post-build] Source directory not found:', src);
}

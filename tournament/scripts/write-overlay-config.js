// Writes public/overlays/config.js: which Firebase project the stream
// overlays read their live settings from. The overlays are plain pages
// outside the app's bundle, so they can't read the build's environment
// themselves. Run before every start and build (see package.json).
//
// The values are the same web config the app's own bundle carries; access is
// governed by the security rules, not by keeping them secret. The file is
// still left out of the repository, like .env.local.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

// The build's environment first (Vercel), then the local files CRA reads.
const env = { ...process.env };
for (const file of ['.env.local', '.env']) {
  let text = '';
  try {
    text = fs.readFileSync(path.join(root, file), 'utf8');
  } catch (err) {
    continue;
  }
  for (const line of text.split('\n')) {
    const found = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (found && env[found[1]] == null) env[found[1]] = found[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const config = {
  apiKey: env.REACT_APP_FIREBASE_API_KEY,
  authDomain: env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: env.REACT_APP_FIREBASE_PROJECT_ID,
  appId: env.REACT_APP_FIREBASE_APP_ID,
};

const out = path.join(root, 'public', 'overlays', 'config.js');
fs.writeFileSync(out, `/* Written by scripts/write-overlay-config.js. Not kept in the repository. */\nwindow.OVERLAY_FIREBASE = ${JSON.stringify(config.projectId ? config : {})};\n`);
console.log(config.projectId ? 'overlay config written' : 'overlay config: no Firebase project set, overlays will not update live');

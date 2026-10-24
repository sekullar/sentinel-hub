const { app } = require('electron');
const fs = require('fs');
const path = require('path');

// The catalog lives in the Hub's own repo, so adding an app is a one-line commit; no Hub release needed.
// Order of trust: fresh remote copy, last cached copy, copy bundled with the installer.
const REMOTE_URL = 'https://raw.githubusercontent.com/sekullar/sentinel-hub/main/catalog.json';
const bundledFile = path.join(__dirname, '..', 'catalog.json');
const cacheFile = () => path.join(app.getPath('userData'), 'catalog.cache.json');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

function isValid(catalog) {
  return catalog && Array.isArray(catalog.apps) && catalog.apps.length > 0 && catalog.apps.every((a) => (
    typeof a.id === 'string' && typeof a.name === 'string' && a.description && typeof a.description === 'object'
    && /^[\w.-]+\/[\w.-]+$/.test(a.repo || '')
  ));
}

let current = null;

function loadCatalog() {
  if (current) return current;
  for (const file of [cacheFile(), bundledFile]) {
    try {
      const catalog = readJson(file);
      if (isValid(catalog)) {
        current = catalog;
        return current;
      }
    } catch {}
  }
  throw new Error('No usable catalog');
}

async function refreshCatalog() {
  try {
    const res = await fetch(REMOTE_URL, { headers: { 'User-Agent': 'SentinelHub' }, signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const catalog = await res.json();
      if (isValid(catalog)) {
        current = catalog;
        fs.mkdirSync(path.dirname(cacheFile()), { recursive: true });
        fs.writeFileSync(cacheFile(), JSON.stringify(catalog, null, 2));
      }
    }
  } catch {}
  return loadCatalog();
}

module.exports = { loadCatalog, refreshCatalog };

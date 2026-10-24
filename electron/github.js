const fs = require('fs');

const HEADERS = { 'User-Agent': 'SentinelHub' };

// Latest GitHub release of a repo and its Windows installer. Prefers the asset named "...Setup...".
async function latestRelease(repo) {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { ...HEADERS, Accept: 'application/vnd.github+json' },
  });
  if (res.status === 404) throw new Error('NO_RELEASE');
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const rel = await res.json();
  const exes = (rel.assets || []).filter((a) => /\.exe$/i.test(a.name));
  const asset = exes.find((a) => /setup/i.test(a.name)) || exes[0];
  if (!asset) throw new Error('NO_ASSET');
  return { version: rel.tag_name, asset };
}

async function download(url, dest, onPercent) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Download ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const out = fs.createWriteStream(dest);
  let got = 0;
  for await (const chunk of res.body) {
    out.write(chunk);
    got += chunk.length;
    if (total) onPercent(Math.round((got / total) * 100));
  }
  await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
}

function parseVersion(v) {
  return String(v).replace(/^v/i, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0);
}

function isNewer(latest, current) {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff) return diff > 0;
  }
  return false;
}

module.exports = { latestRelease, download, isNewer };

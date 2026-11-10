const crypto = require('crypto');
const { execFile } = require('child_process');

// Same algorithm as Sentinel Business (backend/license.py), so the Hub install and the app share one device binding.
function machineGuid() {
  return new Promise((resolve, reject) => {
    execFile('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { windowsHide: true }, (err, out) => {
      const m = !err && /MachineGuid\s+REG_SZ\s+(\S+)/.exec(out);
      m ? resolve(m[1]) : reject(new Error('DEVICE_ID'));
    });
  });
}

async function deviceId() {
  return crypto.createHash('sha256').update(`sentinel-business|${await machineGuid()}`).digest('hex').slice(0, 32);
}

const KEY_RE = /^[A-Z0-9]{2,4}(-[A-Z0-9]{4}){2,4}$/;
const normalize = (k) => String(k || '').trim().toUpperCase();

// Asks the license server for the latest installer. dry=true only validates and returns version/size.
async function fetchRelease(serverUrl, key, dry) {
  key = normalize(key);
  if (!KEY_RE.test(key)) throw new Error('LICENSE_FORMAT');
  let res;
  try {
    res = await fetch(`${serverUrl}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, device: await deviceId(), dry: !!dry }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    if (e.message === 'DEVICE_ID') throw e;
    throw new Error('LICENSE_NETWORK');
  }
  const body = await res.json().catch(() => ({}));
  if (res.ok) return { key, ...body };
  if (body.code === 'NO_RELEASE' || body.code === 'NO_ASSET') throw new Error('NO_RELEASE');
  if (res.status === 429) throw new Error('LICENSE_RATE');
  throw new Error(`LICENSE: ${body.error || res.status}`);
}

module.exports = { fetchRelease, normalize, KEY_RE };

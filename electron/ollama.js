const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { download } = require('./github');

const HOST = 'http://127.0.0.1:11434';
const SETUP_URL = 'https://ollama.com/download/OllamaSetup.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(p, opts = {}, ms = 2000) {
  const res = await fetch(HOST + p, { ...opts, signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  return res;
}

async function running() {
  try { await api('/api/tags'); return true; } catch { return false; }
}

// Names of models already pulled ("qwen3:8b", "nomic-embed-text:latest" -> also "nomic-embed-text").
async function installedModels() {
  try {
    const { models = [] } = await (await api('/api/tags')).json();
    return models.flatMap((m) => (m.name.endsWith(':latest') ? [m.name, m.name.slice(0, -7)] : [m.name]));
  } catch { return []; }
}

function exePath() {
  const p = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe');
  return fs.existsSync(p) ? p : null;
}

function vramGB() {
  return new Promise((resolve) => {
    execFile('nvidia-smi', ['--query-gpu=memory.total', '--format=csv,noheader,nounits'], { windowsHide: true, timeout: 4000 }, (err, out) => {
      const mb = err ? 0 : Math.max(0, ...String(out).split(/\r?\n/).map((l) => parseInt(l, 10) || 0));
      resolve(Math.round(mb / 1024));
    });
  });
}

async function hardware() {
  return { ramGB: Math.round(os.totalmem() / 1024 ** 3), vramGB: await vramGB() };
}

// Makes sure the Ollama server answers on 127.0.0.1:11434, installing Ollama silently when it is missing.
async function ensure(send, tmpDir) {
  if (await running()) return;
  let exe = exePath();
  if (!exe) {
    const installer = path.join(tmpDir, 'OllamaSetup.exe');
    send({ stage: 'ollamaDownload', percent: 0 });
    await download(SETUP_URL, installer, (percent) => send({ stage: 'ollamaDownload', percent }));
    send({ stage: 'ollama' });
    try {
      await new Promise((resolve, reject) => {
        const c = spawn(installer, ['/VERYSILENT', '/NORESTART', '/SP-'], { windowsHide: true });
        c.on('error', reject);
        c.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Ollama installer exit ${code}`))));
      });
    } finally { fs.rm(installer, { force: true }, () => {}); }
    exe = exePath();
  }
  if (!(await waitRunning(15000)) && exe) {
    spawn(exe, ['serve'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  }
  if (!(await waitRunning(45000))) throw new Error('OLLAMA_START');
}

async function waitRunning(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await running()) return true; await sleep(1000); }
  return false;
}

// Streams `ollama pull`; reports the percent of the layer being downloaded.
async function pull(model, onPercent) {
  const res = await fetch(`${HOST}/api/pull`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, stream: true }) });
  if (!res.ok) throw new Error(`Ollama pull ${res.status}`);
  let buf = '';
  const handle = (line) => {
    if (!line.trim()) return;
    const j = JSON.parse(line);
    if (j.error) throw new Error(`MODEL_PULL: ${j.error}`);
    if (j.total) onPercent(Math.min(100, Math.round((j.completed / j.total) * 100)));
  };
  for await (const chunk of res.body) {
    buf += Buffer.from(chunk).toString('utf8');
    const lines = buf.split('\n');
    buf = lines.pop();
    lines.forEach(handle);
  }
  handle(buf);
}

module.exports = { running, installedModels, hardware, ensure, pull };

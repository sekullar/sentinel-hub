// Game mode: closes every installed Sentinel app while a game runs and starts them again afterwards.
// It can be switched on by hand (tray / Settings) or automatically when a listed game process appears.
const { execFile } = require('child_process');
const path = require('path');

const DEFAULT_GAMES = ['VALORANT-Win64-Shipping.exe'];
const POLL_MS = 5000;
const GONE_POLLS = 3; // an auto-started game mode ends only after the game has been missing this many polls in a row
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const lower = (s) => String(s).toLowerCase();

function runningImages() {
  return new Promise((resolve) => {
    execFile('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, out) => {
      const names = new Set();
      if (!err) {
        for (const line of String(out).split(/\r?\n/)) {
          const m = /^"([^"]+)"/.exec(line);
          if (m) names.add(lower(m[1]));
        }
      }
      resolve(names);
    });
  });
}

// Without force this asks the app to close its windows (so it can save); with force it ends the process tree.
function kill(image, force) {
  return new Promise((resolve) => {
    execFile('taskkill', ['/IM', image, '/T', ...(force ? ['/F'] : [])], { windowsHide: true }, () => resolve());
  });
}

// deps: installed() -> { id: exePath }, getCfg() -> { auto, games }, loadClosed(), saveClosed(ids), launch(id), onChange(status)
function createGameMode(deps) {
  let active = false;
  let source = null; // 'manual' | 'auto'
  let closed = [];
  let busy = false;
  let manualOff = false; // the user ended an auto game mode while the game is still running: do not start it again
  let missing = 0;
  let timer = null;

  const status = () => ({ active, source, busy, closed: [...closed] });
  const emit = () => deps.onChange(status());

  async function stopApps() {
    const running = await runningImages();
    const hit = Object.entries(deps.installed()).filter(([, exe]) => running.has(lower(path.basename(exe))));
    closed = hit.map(([id]) => id);
    deps.saveClosed(closed); // remembered on disk so a Hub restart can still bring them back
    await Promise.all(hit.map(([, exe]) => kill(path.basename(exe), false)));
    for (let i = 0; i < 8; i++) {
      await sleep(500);
      const now = await runningImages();
      if (!hit.some(([, exe]) => now.has(lower(path.basename(exe))))) return;
    }
    await Promise.all(hit.map(([, exe]) => kill(path.basename(exe), true)));
  }

  async function enter(src) {
    if (active || busy) return;
    busy = true; active = true; source = src; manualOff = false; missing = 0;
    emit();
    try { await stopApps(); } finally { busy = false; emit(); }
  }

  async function exit() {
    if (!active || busy) return;
    busy = true;
    const ids = closed;
    active = false; source = null; closed = []; missing = 0;
    deps.saveClosed([]);
    emit();
    for (const id of ids) {
      try { deps.launch(id); } catch { /* app was removed meanwhile */ }
      await sleep(400);
    }
    busy = false; emit();
  }

  // Manual switch. Ending an auto game mode while the game still runs must not restart it on the next poll.
  async function toggle() {
    if (active) {
      if (source === 'auto') manualOff = true;
      await exit();
    } else {
      await enter('manual');
    }
  }

  async function poll() {
    const cfg = deps.getCfg();
    if (!cfg.auto) {
      if (active && source === 'auto') { source = 'manual'; emit(); } // auto turned off mid-game: keep it until the user ends it
      return;
    }
    const games = cfg.games.map(lower).filter(Boolean);
    if (!games.length) return;
    const running = await runningImages();
    const playing = games.some((g) => running.has(g));
    if (playing) {
      missing = 0;
      if (!active && !manualOff && !busy) await enter('auto');
    } else {
      manualOff = false;
      if (active && source === 'auto' && !busy && ++missing >= GONE_POLLS) await exit();
      if (!active) missing = 0;
    }
  }

  async function init() {
    closed = deps.loadClosed();
    if (closed.length) {
      // The Hub was closed or restarted while game mode was on: either the game is still running, or the apps must come back.
      const cfg = deps.getCfg();
      const running = await runningImages();
      const playing = cfg.auto && cfg.games.some((g) => running.has(lower(g)));
      if (playing) { active = true; source = 'auto'; emit(); }
      else { active = true; source = 'manual'; await exit(); }
    }
    timer = setInterval(() => { poll().catch(() => {}); }, POLL_MS);
  }

  return { init, toggle, exit, status, stop: () => clearInterval(timer) };
}

module.exports = { createGameMode, DEFAULT_GAMES };

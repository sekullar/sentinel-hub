const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } = require('electron');
const { spawn, execFile } = require('child_process');
// original-fs, not fs: Electron's asar-aware fs opens every app.asar it walks past (the installed Electron apps have one)
// and keeps it locked, which made updating or removing an app fail with ENOTEMPTY.
const fs = require('original-fs');
const path = require('path');
const { loadCatalog, refreshCatalog } = require('./catalog');
const { latestRelease, download, isNewer } = require('./github');
const { checkHubUpdate, applyHubUpdate } = require('./hubUpdate');
const { createGameMode, DEFAULT_GAMES } = require('./gameMode');
const ollama = require('./ollama');
const licensing = require('./license');
const MODEL_RE = /^[a-z0-9][a-z0-9._-]{0,60}(\/[a-z0-9][a-z0-9._-]{0,60})?(:[A-Za-z0-9][A-Za-z0-9._-]{0,40})?$/;
const crypto = require('crypto');

// The Hub lives in the tray: closing the window only hides it, so game mode and auto-detection keep working.
const LOGIN_ARGS = ['--hidden'];
const startHidden = process.argv.includes('--hidden');
let win = null;
let tray = null;
let quitting = false;
let game = null;

const LICENSE_SERVER = 'https://akmhiqugeqxczqrqtxge.supabase.co/functions/v1/license';
const APPS_DIR = path.join(process.env.LOCALAPPDATA || app.getPath('appData'), 'SentinelHub', 'apps');
const stateFile = () => path.join(app.getPath('userData'), 'state.json');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
  } catch {
    return { apps: {} };
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
  fs.writeFileSync(stateFile(), JSON.stringify(state, null, 2));
}

// An app removed outside the Hub (deleted folder, its own uninstaller) should not stay listed as installed.
function pruneState(state) {
  let changed = false;
  for (const [id, info] of Object.entries(state.apps)) {
    if (!fs.existsSync(info.exe)) {
      delete state.apps[id];
      changed = true;
    }
  }
  if (changed) writeState(state);
  return state;
}

function findApp(id) {
  const entry = loadCatalog().apps.find((a) => a.id === id);
  if (!entry) throw new Error(`Unknown app: ${id}`);
  return entry;
}

function run(file, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { windowsVerbatimArguments: true });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Exit code ${code}`))));
  });
}

function findExe(dir) {
  const exe = fs.readdirSync(dir).find((f) => /\.exe$/i.test(f) && !/uninstall/i.test(f));
  if (!exe) throw new Error('Installed executable not found');
  return path.join(dir, exe);
}

function shortcutPath(id) {
  return path.join(app.getPath('desktop'), `${findApp(id).name}.lnk`);
}

// Installs (or replaces) an app. An existing copy is moved aside first and restored if the install fails.
const savedKey = (id) => (hubState().licenses || {})[id] || '';
const licenseUrl = () => LICENSE_SERVER; // fixed on purpose: the (remote) catalog must not be able to redirect license checks

// Where the licensed app picks up its first-run setup (license key + chosen models). Matches SENTINEL_DATA_DIR of the app.
function setupFile(entry) {
  const dir = /^[\w ]+([\\/][\w ]+)*$/.test(entry.dataDir || '') ? entry.dataDir : entry.name.replace(/[^\w ]/g, '');
  return path.join(process.env.LOCALAPPDATA || app.getPath('appData'), ...dir.split(/[\\/]/), 'setup.json');
}

// Testing an installer before it is released: SENTINEL_HUB_LOCAL="sentinel=C:\path\Sentinel Setup 0.2.0.exe;other=..."
// (developer machines only; the variable is never set by the Hub itself).
function localInstaller(id) {
  if (app.isPackaged) return null;   // developer override: never honoured in the installed Hub
  for (const pair of (process.env.SENTINEL_HUB_LOCAL || '').split(';')) {
    const i = pair.indexOf('=');
    if (i < 1 || pair.slice(0, i).trim() !== id) continue;
    const file = pair.slice(i + 1).trim();
    if (!/\.exe$/i.test(file) || !fs.existsSync(file)) return null;
    const m = path.basename(file).match(/(\d+\.\d+\.\d+)/);
    return { version: m ? m[1] : '0.0.0', url: require('url').pathToFileURL(file).href, name: path.basename(file) };
  }
  return null;
}

// opts: { key (licensed apps), models: [name...], model, waModel, vision } — key from the dialog, otherwise the saved one.
async function installApp(id, send, opts = {}) {
  const entry = findApp(id);
  const licensed = entry.license === 'required';
  const key = licensed ? (opts.key || savedKey(id)) : '';
  if (licensed && !key) throw new Error('LICENSE_REQUIRED');

  send({ id, stage: 'fetching' });
  let version, url, name, local, sha256 = null;
  if (licensed) {
    const rel = await licensing.fetchRelease(licenseUrl(entry), key, false);
    ({ version, url, name, sha256 } = rel);
  } else if ((local = localInstaller(id))) {
    ({ version, url, name } = local);
  } else {
    const r = await latestRelease(entry.repo);
    ({ version } = r);
    url = r.asset.browser_download_url;
    name = r.asset.name;
  }

  // Ollama + models first: the app is useless without them, and a failure here must not leave a half-installed app.
  // only models the catalog offers (the renderer is not trusted to name arbitrary pulls)
  if (entry.ollama && opts.models) {
    // catalog models plus free-typed Ollama names (strict pattern: only registry-style names, never a path or URL)
    const ok = new Set([entry.ollama.embed, ...entry.ollama.models.map((m) => m.id), ...(entry.ollama.extras || []).map((m) => m.id)]);
    const allowed = (m) => typeof m === 'string' && (ok.has(m) || MODEL_RE.test(m));
    opts = { ...opts, models: [...new Set(opts.models.filter(allowed))] };
    if (!allowed(opts.model) || !opts.models.includes(opts.model)) opts.model = undefined;
    if (!allowed(opts.waModel) || !opts.models.includes(opts.waModel)) opts.waModel = undefined;
    if (!allowed(opts.vision) || !opts.models.includes(opts.vision)) opts.vision = undefined;
  }
  // Ollama and every chosen model are skipped when already there (ensure/installedModels).
  if (entry.ollama && opts.models && opts.models.length) {
    await ollama.ensure((p) => send({ id, ...p }), app.getPath('temp'));
    const have = await ollama.installedModels();
    for (const m of opts.models.filter((m) => !have.includes(m))) {
      send({ id, stage: 'model', model: m, percent: 0 });
      await ollama.pull(m, (percent) => send({ id, stage: 'model', model: m, percent }));
    }
  }

  const installer = path.join(app.getPath('temp'), `SentinelHub-${id}-${name}`);
  send({ id, stage: 'downloading', percent: 0 });
  if (url.startsWith('file:')) fs.copyFileSync(new URL(url), installer);
  else await download(url, installer, (percent) => send({ id, stage: 'downloading', percent }));
  if (sha256) {
    const got = crypto.createHash('sha256').update(fs.readFileSync(installer)).digest('hex');
    if (got !== sha256.toLowerCase()) { fs.rmSync(installer, { force: true }); throw new Error('CHECKSUM'); }
  }

  const dir = path.join(APPS_DIR, id);
  const backup = `${dir}.bak`;
  const hadOld = fs.existsSync(dir);
  send({ id, stage: 'installing' });
  try {
    if (hadOld) {
      fs.rmSync(backup, { recursive: true, force: true });
      fs.renameSync(dir, backup);
    }
    fs.mkdirSync(dir, { recursive: true });
    await run(installer, ['/S', `/D=${dir}`]);
    const exe = findExe(dir);
    shell.writeShortcutLink(shortcutPath(id), { target: exe, cwd: dir, description: entry.name });

    const state = readState();
    state.apps[id] = { version, dir, exe, installedAt: new Date().toISOString() };
    if (licensed) {
      state.hub = { ...(state.hub || {}), licenses: { ...((state.hub || {}).licenses || {}), [id]: key } };
      // consumed (and deleted) by the app on first start: activates the license and applies the chosen models
      if (opts.models && opts.models.length) {
        const f = setupFile(entry);
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, JSON.stringify({ license_key: key, model: opts.model || opts.models[0], wa_model: opts.waModel || opts.model || opts.models[0], embed: entry.ollama && entry.ollama.embed }));
      }
    } else if (entry.ollama && opts.models && opts.models.length) {
      // free apps read this on every start (not consumed); it only names the models picked in the dialog
      const f = setupFile(entry);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, JSON.stringify({ model: opts.model || opts.models[0], embed: entry.ollama.embed, ...(opts.vision ? { vision: opts.vision } : {}) }, null, 2));
    }
    writeState(state);
    if (hadOld) fs.rm(backup, { recursive: true, force: true }, () => {});
    return state;
  } catch (err) {
    if (hadOld && fs.existsSync(backup)) {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.renameSync(backup, dir);
    }
    throw err;
  } finally {
    fs.rm(installer, { force: true }, () => {});
  }
}

async function uninstallApp(id) {
  const state = readState();
  const info = state.apps[id];
  if (!info) return state;
  if (fs.existsSync(info.dir)) {
    const uninstaller = fs.readdirSync(info.dir).find((f) => /uninstall.*\.exe$/i.test(f));
    if (uninstaller) await run(path.join(info.dir, uninstaller), ['/S', `_?=${info.dir}`]).catch(() => {});
    fs.rmSync(info.dir, { recursive: true, force: true });
  }
  fs.rmSync(shortcutPath(id), { force: true });
  await reg(['delete', RUN_KEY, '/v', runValue(id), '/f']);
  delete state.apps[id];
  writeState(state);
  return state;
}

const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const runValue = (id) => `SentinelHub-${id}`;

function reg(args) {
  return new Promise((resolve) => {
    execFile('reg', args, { windowsHide: true }, (err) => resolve(!err));
  });
}

function startupEnabled(id) {
  return reg(['query', RUN_KEY, '/v', runValue(id)]);
}

async function setStartup(id, enabled) {
  const info = readState().apps[id];
  if (!info) throw new Error('Not installed');
  const ok = enabled
    ? await reg(['add', RUN_KEY, '/v', runValue(id), '/t', 'REG_SZ', '/d', `"${info.exe}"`, '/f'])
    : await reg(['delete', RUN_KEY, '/v', runValue(id), '/f']);
  if (!ok && enabled) throw new Error('Could not update Windows startup');
  return withStartup(readState());
}

async function withStartup(state) {
  const ids = Object.keys(state.apps);
  const flags = await Promise.all(ids.map(startupEnabled));
  ids.forEach((id, i) => { state.apps[id].startup = flags[i]; });
  return state;
}

async function checkUpdates() {
  const state = pruneState(readState());
  const result = {};
  await Promise.all(Object.entries(state.apps).map(async ([id, info]) => {
    try {
      const e = findApp(id);
      const { version } = e.license === 'required'
        ? await licensing.fetchRelease(licenseUrl(e), savedKey(id), true)
        : await latestRelease(e.repo);
      result[id] = { latest: version, hasUpdate: isNewer(version, info.version) };
    } catch {
      result[id] = { latest: null, hasUpdate: false };
    }
  }));
  return result;
}

// The NSIS installer cannot overwrite a running app, so stop it before updating.
// Resolves true when the app was running, so the caller can start it again afterwards.
function stopApp(id) {
  const info = readState().apps[id];
  if (!info) return Promise.resolve(false);
  return new Promise((resolve) => {
    execFile('taskkill', ['/IM', path.basename(info.exe), '/F'], { windowsHide: true }, (err) => resolve(!err));
  });
}

function launchApp(id) {
  const info = readState().apps[id];
  if (!info) throw new Error('Not installed');
  spawn(info.exe, [], { cwd: info.dir, detached: true, stdio: 'ignore' }).unref();
}

async function updateApp(id, send) {
  const wasRunning = await stopApp(id);
  if (wasRunning) await sleep(600);
  try {
    const state = await installApp(id, send);
    if (wasRunning) launchApp(id);
    return state;
  } catch (err) {
    if (wasRunning) launchApp(id); // the old copy was restored, bring it back
    throw err;
  }
}

const hubState = () => readState().hub || {};
const patchHub = (patch) => {
  const state = readState();
  state.hub = { ...(state.hub || {}), ...patch };
  writeState(state);
};
const gameCfg = () => {
  const h = hubState();
  return { auto: !!h.gameAuto, games: Array.isArray(h.gameList) ? h.gameList : DEFAULT_GAMES };
};
const hubLang = () => hubState().lang || (app.getLocale().startsWith('tr') ? 'tr' : 'en');

const TRAY_TEXT = {
  tr: { open: "Sentinel Hub'ı aç", game: 'Oyun modu', quit: 'Çık', tipOn: 'Sentinel Hub · Oyun modu açık', tipOff: 'Sentinel Hub' },
  en: { open: 'Open Sentinel Hub', game: 'Game mode', quit: 'Quit', tipOn: 'Sentinel Hub · Game mode on', tipOff: 'Sentinel Hub' },
};

function showWindow() {
  if (!win || win.isDestroyed()) win = createWindow(true);
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function refreshTray() {
  if (!tray) return;
  const s = TRAY_TEXT[hubLang()] || TRAY_TEXT.en;
  const st = game ? game.status() : { active: false, busy: false };
  tray.setToolTip(st.active ? s.tipOn : s.tipOff);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: s.open, click: showWindow },
    { label: s.game, type: 'checkbox', checked: st.active, enabled: !st.busy, click: () => game.toggle() },
    { type: 'separator' },
    { label: s.quit, click: () => app.quit() },
  ]));
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.on('click', showWindow);
  refreshTray();
}

function createWindow(show = true) {
  const w = new BrowserWindow({
    show,
    width: 1000,
    height: 680,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: '#0a1224',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  w.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    w.hide();
  });
  w.on('closed', () => { if (win === w) win = null; });
  w.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  return w;
}

const loginOn = () => app.getLoginItemSettings({ args: LOGIN_ARGS }).openAtLogin;

// Hub starts with Windows by default (set once on first run); the user can turn it off in Settings.
// It starts hidden in the tray ("--hidden"); an older entry without that flag is upgraded once.
function initAutostart() {
  if (!app.isPackaged) return;
  const state = readState();
  if (!state.hub) state.hub = {};
  // The Run entry is keyed by app name, so a copy started from somewhere else (win-unpacked, an old folder) can own it. Whichever
  // copy registered last wins at login, which made an old build start every day and ask for the same update again.
  // If an entry exists but points to another exe, the running one takes it over.
  const mine = (app.getLoginItemSettings().launchItems || []).filter((i) => /(^|\.)sentinel hub$/i.test(i.name));
  if (mine.length && mine.some((i) => path.resolve(i.path).toLowerCase() !== process.execPath.toLowerCase())) {
    app.setLoginItemSettings({ openAtLogin: true, args: LOGIN_ARGS });
  }
  if (!state.hub.autostartInit) {
    app.setLoginItemSettings({ openAtLogin: true, args: LOGIN_ARGS });
    state.hub.autostartInit = true;
    state.hub.autostartHidden = true;
    writeState(state);
  } else if (!state.hub.autostartHidden) {
    if (app.getLoginItemSettings().openAtLogin) app.setLoginItemSettings({ openAtLogin: true, args: LOGIN_ARGS });
    state.hub.autostartHidden = true;
    writeState(state);
  }
}

const reply = (fn) => async (_event, ...args) => {
  try {
    return { ok: true, ...(await fn(...args)) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
};

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else app.on('second-instance', showWindow);

let restored = false;
app.on('before-quit', (e) => {
  quitting = true;
  // Never leave the user's apps closed: bring them back before the Hub exits.
  if (game && game.status().active && !restored) {
    e.preventDefault();
    restored = true;
    game.exit().finally(() => app.quit());
  }
});

app.whenReady().then(() => {
  if (!gotLock) return;
  initAutostart();
  win = createWindow(!startHidden);
  const send = (payload) => { if (win && !win.isDestroyed()) win.webContents.send('install:progress', payload); };

  game = createGameMode({
    installed: () => Object.fromEntries(Object.entries(readState().apps).map(([id, info]) => [id, info.exe])),
    getCfg: gameCfg,
    loadClosed: () => hubState().gameClosed || [],
    saveClosed: (ids) => patchHub({ gameClosed: ids }),
    launch: launchApp,
    onChange: (status) => {
      refreshTray();
      if (win && !win.isDestroyed()) win.webContents.send('game:changed', status);
    },
  });
  createTray();
  game.init();

  ipcMain.handle('hub:info', () => ({ version: app.getVersion(), packaged: app.isPackaged }));
  ipcMain.handle('hub:checkUpdate', () => checkHubUpdate());
  ipcMain.handle('hub:applyUpdate', reply(async () => { await applyHubUpdate(send); return {}; }));
  ipcMain.handle('hub:getAutostart', () => ({ supported: app.isPackaged, enabled: loginOn() }));
  ipcMain.handle('hub:setAutostart', (_e, enabled) => {
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!enabled, args: LOGIN_ARGS });
    return { supported: app.isPackaged, enabled: loginOn() };
  });

  ipcMain.handle('game:get', () => ({ ...gameCfg(), status: game.status() }));
  ipcMain.handle('game:toggle', () => game.toggle());
  ipcMain.handle('game:setCfg', (_e, cfg) => {
    const patch = {};
    if (typeof cfg.auto === 'boolean') patch.gameAuto = cfg.auto;
    if (Array.isArray(cfg.games)) {
      patch.gameList = cfg.games.map((g) => String(g).trim()).filter((g) => /^[\w .()+-]{1,80}\.exe$/i.test(g)).slice(0, 30);
    }
    patchHub(patch);
    return gameCfg();
  });
  ipcMain.on('hub:setLang', (_e, lang) => {
    if (lang === 'tr' || lang === 'en') { patchHub({ lang }); refreshTray(); }
  });

  ipcMain.handle('catalog:get', () => refreshCatalog());
  ipcMain.handle('state:get', async () => withStartup(pruneState(readState())));
  ipcMain.handle('updates:check', () => checkUpdates());

  ipcMain.handle('app:install', reply(async (id, opts) => ({ state: await withStartup(await installApp(id, send, opts || {})) })));
  // Install dialog data for licensed apps: hardware, Ollama status, which catalog models are already on disk.
  ipcMain.handle('app:plan', reply(async (id) => {
    const e = findApp(id);
    const [hw, up, have] = await Promise.all([ollama.hardware(), ollama.running(), ollama.installedModels()]);
    return { plan: { key: savedKey(id), hw, ollamaRunning: up, have, ollama: e.ollama || null } };
  }));
  // The Hub carries the install/update logic for every app, so a newer Hub must come first.
  ipcMain.handle('app:update', reply(async (id) => {
    if ((await checkHubUpdate()).hasUpdate) throw new Error('HUB_UPDATE_FIRST');
    return { state: await withStartup(await updateApp(id, send)) };
  }));
  ipcMain.handle('app:uninstall', reply(async (id) => ({ state: await withStartup(await uninstallApp(id)) })));
  ipcMain.handle('app:startup', reply(async (id, enabled) => ({ state: await setStartup(id, enabled) })));
  ipcMain.handle('app:launch', reply(async (id) => { launchApp(id); return {}; }));
  ipcMain.handle('open:extra', (_e, id) => {
    const url = loadCatalog().apps.find((a) => a.id === id)?.extra?.url;
    if (url && url.startsWith('https://')) shell.openExternal(url);
  });
});

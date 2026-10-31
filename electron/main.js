const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } = require('electron');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { loadCatalog, refreshCatalog } = require('./catalog');
const { latestRelease, download, isNewer } = require('./github');
const { checkHubUpdate, applyHubUpdate } = require('./hubUpdate');
const { createGameMode, DEFAULT_GAMES } = require('./gameMode');

// The Hub lives in the tray: closing the window only hides it, so game mode and auto-detection keep working.
const LOGIN_ARGS = ['--hidden'];
const startHidden = process.argv.includes('--hidden');
let win = null;
let tray = null;
let quitting = false;
let game = null;

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
async function installApp(id, send) {
  const entry = findApp(id);
  if (entry.license === 'required') throw new Error('LICENSE_REQUIRED');

  send({ id, stage: 'fetching' });
  const { version, asset } = await latestRelease(entry.repo);

  const installer = path.join(app.getPath('temp'), `SentinelHub-${id}-${asset.name}`);
  send({ id, stage: 'downloading', percent: 0 });
  await download(asset.browser_download_url, installer, (percent) => send({ id, stage: 'downloading', percent }));

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
      const { version } = await latestRelease(findApp(id).repo);
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

  ipcMain.handle('app:install', reply(async (id) => ({ state: await withStartup(await installApp(id, send)) })));
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

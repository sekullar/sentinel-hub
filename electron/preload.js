const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hub', {
  getCatalog: () => ipcRenderer.invoke('catalog:get'),
  getState: () => ipcRenderer.invoke('state:get'),
  install: (id) => ipcRenderer.invoke('app:install', id),
  uninstall: (id) => ipcRenderer.invoke('app:uninstall', id),
  setStartup: (id, enabled) => ipcRenderer.invoke('app:startup', id, enabled),
  checkUpdates: () => ipcRenderer.invoke('updates:check'),
  update: (id) => ipcRenderer.invoke('app:update', id),
  openExtra: (id) => ipcRenderer.invoke('open:extra', id),
  getAutostart: () => ipcRenderer.invoke('hub:getAutostart'),
  setAutostart: (enabled) => ipcRenderer.invoke('hub:setAutostart', enabled),
  hubInfo: () => ipcRenderer.invoke('hub:info'),
  checkHubUpdate: () => ipcRenderer.invoke('hub:checkUpdate'),
  applyHubUpdate: () => ipcRenderer.invoke('hub:applyUpdate'),
  launch: (id) => ipcRenderer.invoke('app:launch', id),
  getGame: () => ipcRenderer.invoke('game:get'),
  toggleGame: () => ipcRenderer.invoke('game:toggle'),
  setGameCfg: (cfg) => ipcRenderer.invoke('game:setCfg', cfg),
  setLang: (lang) => ipcRenderer.send('hub:setLang', lang),
  onGame: (cb) => {
    const handler = (_e, status) => cb(status);
    ipcRenderer.on('game:changed', handler);
    return () => ipcRenderer.removeListener('game:changed', handler);
  },
  onProgress: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('install:progress', handler);
    return () => ipcRenderer.removeListener('install:progress', handler);
  },
});

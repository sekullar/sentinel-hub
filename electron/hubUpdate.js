const { app } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const { latestRelease, download, isNewer } = require('./github');

const HUB_REPO = 'sekullar/sentinel-hub';

// Only the installed build can replace itself; a dev run (npm start) never offers an update.
async function checkHubUpdate() {
  const current = app.getVersion();
  if (!app.isPackaged) return { current, latest: null, hasUpdate: false };
  try {
    const { version } = await latestRelease(HUB_REPO);
    return { current, latest: version, hasUpdate: isNewer(version, current) };
  } catch {
    return { current, latest: null, hasUpdate: false };
  }
}

// Downloads the new installer, starts it silently and quits so it can replace the running files.
// "--updated" makes the electron-builder installer launch the new version when it finishes.
async function applyHubUpdate(send) {
  if (!app.isPackaged) throw new Error('Updates only work in the installed build');
  const { asset } = await latestRelease(HUB_REPO);
  const installer = path.join(app.getPath('temp'), `SentinelHub-self-${asset.name}`);
  send({ id: 'hub', stage: 'downloading', percent: 0 });
  await download(asset.browser_download_url, installer, (percent) => send({ id: 'hub', stage: 'downloading', percent }));
  send({ id: 'hub', stage: 'installing' });
  spawn(installer, ['/S', '--updated'], { detached: true, stdio: 'ignore' }).unref();
  setTimeout(() => app.quit(), 400);
}

module.exports = { checkHubUpdate, applyHubUpdate };

// Local Windows build without admin rights. electron-builder's code-signing tools need symlinks (admin / Developer Mode),
// so we skip signing, embed the icon with the rcedit it already downloaded, then build the installer from that folder.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
const builder = ['electron-builder', '--win'];
const flags = ['-c.win.signAndEditExecutable=false'];

fs.rmSync(path.join(root, 'release'), { recursive: true, force: true });
run('npx', ['vite', 'build']);
run('npx', [...builder, '--dir', ...flags]);

const cache = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'electron-builder', 'Cache', 'winCodeSign');
const rcedit = fs.readdirSync(cache).map((d) => path.join(cache, d, 'rcedit-x64.exe')).find((f) => fs.existsSync(f));
if (!rcedit) throw new Error('rcedit-x64.exe not found in the electron-builder cache; run "npm run dist" once as admin');
execFileSync(rcedit, [
  path.join(root, 'release', 'win-unpacked', 'Sentinel Hub.exe'),
  '--set-icon', path.join(root, 'build', 'icon.ico'),
  '--set-version-string', 'FileDescription', 'Sentinel Hub',
  '--set-version-string', 'ProductName', 'Sentinel Hub',
]);

run('npx', [...builder, 'nsis', '--prepackaged', 'release/win-unpacked', ...flags]);

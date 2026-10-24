# Sentinel Hub

A small desktop "app store" for the Sentinel family of apps: browse them, install them, keep them up to date and
launch them from one place. Windows, built with Electron + React. [Türkçe README](README.tr.md)

> **The apps work without Sentinel Hub.** Every app in the catalog is a normal, standalone Windows program with its own
> installer on GitHub. Sentinel Hub is optional. With it, the apps run in a more tuned, more detailed way and keep
> receiving updates continuously: one place to install, one click to update, per-app settings such as
> "start with Windows", desktop shortcuts and launch/stop buttons.

## What it does

- **Catalog:** lists the apps (name, description, icon). The list is a single `catalog.json` in this repo, fetched
  on startup (with a cached and a bundled fallback), so adding an app never needs a new Hub release.
- **Install / uninstall:** downloads the latest GitHub Release installer of an app, installs it silently into
  `%LOCALAPPDATA%\SentinelHub\apps\<app>` and puts a shortcut on the desktop.
- **Updates:** compares the installed version with the latest Release, shows a green **Update** button, stops the app,
  installs the new version and starts it again. If the install fails, the previous copy is restored.
- **Per-app settings:** "Open at Windows startup", uninstall.
- **Self-update:** Sentinel Hub updates itself from this repo's Releases.
- **Start with Windows:** on by default after the first run, can be turned off in Settings.
- **Languages and themes:** Turkish / English, dark / light.

## Apps

| App | Repo |
| --- | --- |
| Spotlight | [sekullar/spotlight-for-windows](https://github.com/sekullar/spotlight-for-windows) |
| Dynamic Bar | [sekullar/dynamic-bar-for-windows](https://github.com/sekullar/dynamic-bar-for-windows) |
| Phoneix | [sekullar/phoneix](https://github.com/sekullar/phoneix) |
| Sentinel | coming soon |
| Sentinel Business | licensed (coming soon) |

## Install

Download `Sentinel.Hub.Setup.<version>.exe` from the [latest release](../../releases/latest) and run it.
The installer is not code-signed, so Windows SmartScreen may ask you to confirm ("More info" → "Run anyway").

## Adding an app (maintainer notes)

Sentinel Hub only carries apps published by the maintainer; it is not an open store and does not accept third-party apps.
These are the steps for adding one of the maintainer's own apps:

1. Make sure the app's repo publishes a GitHub Release with a Windows installer named `*Setup*.exe`
   (electron-builder NSIS does this). The installer must support silent install: `/S` and `/D=<folder>`.
2. Add an entry to [`catalog.json`](catalog.json):

   ```json
   {
     "id": "my-app",
     "name": "My App",
     "description": { "tr": "Açıklama", "en": "Description" },
     "repo": "sekullar/my-app",
     "stack": "electron"
   }
   ```

3. Commit and push to this repo. Hubs pick up the new entry the next time they open.

Optional fields: `extra` (`{ "label": { "tr": "", "en": "" }, "url": "https://..." }`, a link button on the card),
`license: "required"` with `private: true` (shows a disabled "Buy license" button instead of "Install").

## Development

```bash
npm install
npm start          # build the UI and open the app
npm run dist       # installer in release/ (needs admin or Developer Mode on Windows)
npm run dist:local # same installer without admin rights
```

Releases are built by GitHub Actions: pushing a tag such as `v0.1.1` builds the installer and publishes it.
Keep the tag equal to the `version` in `package.json`.

## License

MIT

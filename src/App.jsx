import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppIcon } from './icons.jsx';
import hubLogo from './assets/hub-logo.png';
import { STRINGS, detectLang, detectTheme } from './i18n.js';

function usePref(key, initial) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    try { localStorage.setItem(key, value); } catch {}
  }, [key, value]);
  return [value, setValue];
}

function errorText(t, code) {
  if (code === 'NO_RELEASE' || code === 'NO_ASSET') return t.errNoRelease;
  if (code === 'HUB_UPDATE_FIRST') return t.hubUpdateFirstErr;
  return `${t.errGeneric}: ${code}`;
}

function AppCard({ app, index, t, lang, ctl }) {
  const locked = app.license === 'required';
  const info = ctl.installed[app.id];
  const busy = ctl.progress[app.id];
  const error = ctl.errors[app.id];
  const update = ctl.updates[app.id];

  let action;
  if (locked) {
    action = <button className="btn locked" disabled>{t.buyLicense}</button>;
  } else if (busy) {
    const pct = busy.stage === 'downloading' ? busy.percent : null;
    action = (
      <div className="progress">
        <div className="bar"><div className={pct == null ? 'fill indeterminate' : 'fill'} style={pct == null ? undefined : { width: `${pct}%` }} /></div>
        <span>{t[busy.stage]}{pct != null ? ` ${pct}%` : ''}</span>
      </div>
    );
  } else if (info) {
    action = (
      <>
      {update && update.hasUpdate && (
        <button className="btn update" disabled={ctl.hubUpdatePending} title={ctl.hubUpdatePending ? t.hubUpdateFirstErr : undefined} onClick={() => ctl.update(app.id)}>
          {ctl.hubUpdatePending ? t.hubUpdateFirst : `${t.update} · ${update.latest}`}
        </button>
      )}
      <div className="actions">
        <button className="btn" onClick={() => ctl.launch(app.id)}>{t.open}</button>
        <button className="btn ghost icon-btn" title={t.appSettings} onClick={() => ctl.openSettings(app.id)}>
          <svg viewBox="0 0 24 24"><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0M14 4v4M8 10v4M18 16v4" /></svg>
        </button>
      </div>
      </>
    );
  } else {
    action = <button className="btn" onClick={() => ctl.install(app.id)}>{t.install}</button>;
  }

  return (
    <div className="card" style={{ animationDelay: `${index * 70}ms` }}>
      <div className="icon"><AppIcon id={app.id} name={app.name} /></div>
      <div className="info">
        <h2>{app.name}{info && <small>{info.version}</small>}</h2>
        <p>{app.description[lang] || app.description.en}</p>
      </div>
      {app.extra && (
        <button className="extra-link" onClick={() => window.hub.openExtra(app.id)}>
          <svg viewBox="0 0 24 24"><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></svg>
          {app.extra.label[lang] || app.extra.label.en}
        </button>
      )}
      {error && <div className="error">{errorText(t, error)}</div>}
      {action}
    </div>
  );
}

function CheckButton({ t, ctl }) {
  return (
    <button className="btn ghost check-btn" onClick={ctl.refreshUpdates} disabled={ctl.checking}>
      <svg viewBox="0 0 24 24" className={ctl.checking ? 'spin' : ''}><path d="M20 12a8 8 0 11-2.3-5.7M20 4v5h-5" /></svg>
      {ctl.checking ? t.checking : t.checkUpdates}
    </button>
  );
}

function Store({ apps, t, lang, ctl }) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter((a) => a.name.toLowerCase().includes(q)
      || (a.description[lang] || '').toLowerCase().includes(q));
  }, [apps, query, lang]);

  return (
    <>
      <div className="search">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.search} />
      </div>
      {shown.length ? (
        <div className="grid">
          {shown.map((a, i) => <AppCard key={a.id} app={a} index={i} t={t} lang={lang} ctl={ctl} />)}
        </div>
      ) : (
        <div className="empty"><p>{t.noResults}</p></div>
      )}
    </>
  );
}

function Installed({ apps, t, lang, ctl }) {
  const list = apps.filter((a) => ctl.installed[a.id]);
  if (!list.length) {
    return (
      <div className="empty">
        <div className="empty-icon">▢</div>
        <h3>{t.noInstalled}</h3>
        <p>{t.noInstalledHint}</p>
      </div>
    );
  }
  return (
    <div className="grid">
      {list.map((a, i) => <AppCard key={a.id} app={a} index={i} t={t} lang={lang} ctl={ctl} />)}
    </div>
  );
}

function AppSettingsModal({ app, ctl, t, lang, onClose }) {
  const info = ctl.installed[app.id];
  if (!info) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="icon small"><AppIcon id={app.id} name={app.name} /></div>
          <div>
            <h2>{app.name}</h2>
            <p>{t.appSettings} · {info.version}</p>
          </div>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={!!info.startup}
            disabled={!!ctl.progress[app.id]}
            onChange={(e) => ctl.setStartup(app.id, e.target.checked)}
          />
          <span className="box" />
          <span>
            <strong>{t.runAtStartup}</strong>
            <small>{t.runAtStartupHint}</small>
          </span>
        </label>
        {ctl.errors[app.id] && <div className="error">{errorText(t, ctl.errors[app.id])}</div>}
        <div className="modal-foot">
          <button className="btn ghost danger" onClick={() => { ctl.uninstall(app.id); onClose(); }}>{t.uninstall}</button>
          <button className="btn" onClick={onClose}>{t.close}</button>
        </div>
      </div>
    </div>
  );
}

function Segmented({ value, options, onChange }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function GameList({ games, t, onSave }) {
  const [text, setText] = useState(games.join(', '));
  useEffect(() => { setText(games.join(', ')); }, [games]);
  return (
    <input
      className="text-input"
      value={text}
      spellCheck={false}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onSave(text.split(',').map((s) => s.trim()).filter(Boolean))}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      placeholder="VALORANT-Win64-Shipping.exe"
    />
  );
}

function Settings({ t, lang, setLang, theme, setTheme, game }) {
  const [auto, setAuto] = useState({ supported: false, enabled: false });
  useEffect(() => { window.hub.getAutostart().then(setAuto); }, []);
  return (
    <div className="settings">
      <div className="row">
        <div><h3>{t.gameMode}</h3><p>{t.gameModeHint}</p></div>
        <Segmented
          value={game.status.active ? 'on' : 'off'}
          onChange={(v) => { if ((v === 'on') !== game.status.active && !game.status.busy) window.hub.toggleGame(); }}
          options={[{ value: 'on', label: t.on }, { value: 'off', label: t.off }]}
        />
      </div>
      <div className="row">
        <div><h3>{t.gameAuto}</h3><p>{t.gameAutoHint}</p></div>
        <Segmented
          value={game.auto ? 'on' : 'off'}
          onChange={(v) => game.save({ auto: v === 'on' })}
          options={[{ value: 'on', label: t.on }, { value: 'off', label: t.off }]}
        />
      </div>
      <div className="row stack">
        <div><h3>{t.gameList}</h3><p>{t.gameListHint}</p></div>
        <GameList games={game.games} t={t} onSave={(games) => game.save({ games })} />
      </div>
      <div className="row">
        <div><h3>{t.autostart}</h3><p>{auto.supported ? t.autostartHint : t.autostartDev}</p></div>
        <Segmented
          value={auto.enabled ? 'on' : 'off'}
          onChange={async (v) => setAuto(await window.hub.setAutostart(v === 'on'))}
          options={[{ value: 'on', label: t.on }, { value: 'off', label: t.off }]}
        />
      </div>
      <div className="row">
        <div><h3>{t.language}</h3><p>{t.languageHint}</p></div>
        <Segmented
          value={lang}
          onChange={setLang}
          options={[{ value: 'tr', label: 'Türkçe' }, { value: 'en', label: 'English' }]}
        />
      </div>
      <div className="row">
        <div><h3>{t.theme}</h3><p>{t.themeHint}</p></div>
        <Segmented
          value={theme}
          onChange={setTheme}
          options={[{ value: 'dark', label: t.dark }, { value: 'light', label: t.light }]}
        />
      </div>
    </div>
  );
}

// Left bar: shown once a newer Hub exists (found at start or by "Check for updates"). Other apps can only be updated after this.
function HubUpdateSide({ hub, t, onApply }) {
  const a = hub.applying;
  const pct = a && a.stage === 'downloading' ? a.percent : null;
  const status = a && a.stage === 'error' ? `${t.errGeneric}: ${a.error}` : a ? `${t[a.stage] || t.fetching}${pct != null ? ` ${pct}%` : ''}` : t.hubUpdateHint;
  return (
    <div className="hub-update">
      <button className="btn update" disabled={!!a && a.stage !== 'error'} onClick={onApply}>
        <svg viewBox="0 0 24 24"><path d="M12 16V4m0 0l-4 4m4-4l4 4M5 20h14" /></svg>
        {t.hubUpdateSide} · {hub.update.latest}
      </button>
      <span>{status}</span>
    </div>
  );
}

function GameBanner({ status, t }) {
  return (
    <div className="banner game">
      <div>
        <strong>{t.gameBannerOn}</strong>
        <span>{status.busy ? t.gameBannerBusy : t.gameBannerHint}</span>
      </div>
      <button className="btn" disabled={status.busy} onClick={() => window.hub.toggleGame()}>{t.gameBannerOff}</button>
    </div>
  );
}

const NAV = [
  { id: 'store', icon: 'M4 7l1-3h14l1 3M4 7v13h16V7M4 7h16M9 11h6' },
  { id: 'installed', icon: 'M12 3v12m0 0l-4-4m4 4l4-4M5 20h14' },
  { id: 'settings', icon: 'M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0M14 4v4M8 10v4M18 16v4' },
];

export default function App() {
  const [apps, setApps] = useState([]);
  const [installed, setInstalled] = useState({});
  const [progress, setProgress] = useState({});
  const [errors, setErrors] = useState({});
  const [updates, setUpdates] = useState({});
  const [hub, setHub] = useState({ version: '', update: null, applying: null });
  const [checking, setChecking] = useState(false);
  const [settingsFor, setSettingsFor] = useState(null);
  const [page, setPage] = useState('store');
  const [lang, setLang] = usePref('hub.lang', detectLang());
  const [theme, setTheme] = usePref('hub.theme', detectTheme());
  const [gameCfg, setGameCfg] = useState({ auto: false, games: [] });
  const [gameStatus, setGameStatus] = useState({ active: false, busy: false });
  const t = STRINGS[lang];

  useEffect(() => { window.hub.setLang(lang); }, [lang]);

  useEffect(() => {
    window.hub.getGame().then((g) => { setGameCfg({ auto: g.auto, games: g.games }); setGameStatus(g.status); });
    return window.hub.onGame(setGameStatus);
  }, []);

  const game = useMemo(() => ({
    ...gameCfg,
    status: gameStatus,
    save: async (patch) => setGameCfg(await window.hub.setGameCfg(patch)),
  }), [gameCfg, gameStatus]);

  useEffect(() => {
    window.hub.getCatalog().then((c) => setApps(c.apps));
    window.hub.hubInfo().then((i) => setHub((h) => ({ ...h, version: i.version })));
    window.hub.checkHubUpdate().then((u) => setHub((h) => ({ ...h, update: u.hasUpdate ? u : null })));
    window.hub.getState().then((s) => {
      setInstalled(s.apps);
      if (Object.keys(s.apps).length) window.hub.checkUpdates().then(setUpdates);
    });
    return window.hub.onProgress((p) => {
      if (p.id === 'hub') setHub((h) => ({ ...h, applying: p }));
      else setProgress((prev) => ({ ...prev, [p.id]: p }));
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = lang;
  }, [theme, lang]);

  const finish = useCallback((id, result) => {
    setProgress((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (result.ok) {
      setInstalled(result.state.apps);
      setErrors((prev) => ({ ...prev, [id]: null }));
    } else {
      setErrors((prev) => ({ ...prev, [id]: result.error }));
    }
  }, []);

  const refreshUpdates = useCallback(async () => {
    setChecking(true);
    const [apps, hubUpdate] = await Promise.all([window.hub.checkUpdates(), window.hub.checkHubUpdate()]);
    setUpdates(apps);
    setHub((h) => ({ ...h, update: hubUpdate.hasUpdate ? hubUpdate : null }));
    setChecking(false);
  }, []);

  const hubUpdatePending = !!hub.update;

  const ctl = useMemo(() => ({
    hubUpdatePending,
    updates,
    checking,
    refreshUpdates,
    update: async (id) => {
      setErrors((prev) => ({ ...prev, [id]: null }));
      setProgress((prev) => ({ ...prev, [id]: { id, stage: 'fetching' } }));
      const result = await window.hub.update(id);
      finish(id, result);
      if (result.ok) setUpdates((prev) => ({ ...prev, [id]: { ...prev[id], hasUpdate: false } }));
    },
    installed,
    progress,
    errors,
    install: async (id) => {
      setErrors((prev) => ({ ...prev, [id]: null }));
      setProgress((prev) => ({ ...prev, [id]: { id, stage: 'fetching' } }));
      finish(id, await window.hub.install(id));
    },
    uninstall: async (id) => {
      setProgress((prev) => ({ ...prev, [id]: { id, stage: 'uninstalling' } }));
      finish(id, await window.hub.uninstall(id));
    },
    openSettings: (id) => setSettingsFor(id),
    setStartup: async (id, enabled) => {
      setErrors((prev) => ({ ...prev, [id]: null }));
      const res = await window.hub.setStartup(id, enabled);
      if (res.ok) setInstalled(res.state.apps);
      else setErrors((prev) => ({ ...prev, [id]: res.error }));
    },
    launch: async (id) => {
      const res = await window.hub.launch(id);
      if (!res.ok) setErrors((prev) => ({ ...prev, [id]: res.error }));
    },
  }), [installed, progress, errors, updates, checking, refreshUpdates, finish, hubUpdatePending]);

  return (
    <div className="layout">
      <aside>
        <div className="brand">
          <img className="logo" src={hubLogo} alt="" draggable="false" />
          <span>Sentinel Hub</span>
        </div>
        <nav>
          {NAV.map((n) => (
            <button key={n.id} className={page === n.id ? 'on' : ''} onClick={() => setPage(n.id)}>
              <svg viewBox="0 0 24 24"><path d={n.icon} /></svg>
              {t[n.id]}
            </button>
          ))}
        </nav>
        {hub.update && <HubUpdateSide hub={hub} t={t} onApply={async () => {
          setHub((h) => ({ ...h, applying: { stage: 'fetching' } }));
          const res = await window.hub.applyHubUpdate();
          if (!res.ok) setHub((h) => ({ ...h, applying: { stage: 'error', error: res.error } }));
        }} />}
        <div className="version">{hub.version && `v${hub.version}`}</div>
      </aside>
      <section key={page} className="page">
        {gameStatus.active && <GameBanner status={gameStatus} t={t} />}
        <header>
          <h1>{t[page]}</h1>
          {page === 'store' && <span className="sub">{apps.length} {t.apps}</span>}
          {(page === 'store' || page === 'installed') && <CheckButton t={t} ctl={ctl} />}
        </header>
        {page === 'store' && <Store apps={apps} t={t} lang={lang} ctl={ctl} />}
        {page === 'installed' && <Installed apps={apps} t={t} lang={lang} ctl={ctl} />}
        {page === 'settings' && (
          <Settings t={t} lang={lang} setLang={setLang} theme={theme} setTheme={setTheme} game={game} />
        )}
      </section>
      {settingsFor && installed[settingsFor] && (
        <AppSettingsModal
          app={apps.find((a) => a.id === settingsFor)}
          ctl={ctl}
          t={t}
          lang={lang}
          onClose={() => setSettingsFor(null)}
        />
      )}
    </div>
  );
}

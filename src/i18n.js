export const STRINGS = {
  tr: {
    store: 'Mağaza',
    installed: 'Kurulu',
    settings: 'Ayarlar',
    search: 'Uygulama ara...',
    apps: 'uygulama',
    install: 'Kur',
    open: 'Aç',
    update: 'Güncelle',
    checkUpdates: 'Güncellemeleri denetle',
    checking: 'Denetleniyor...',
    appSettings: 'Uygulama ayarları',
    runAtStartup: 'Windows başlangıcında aç',
    runAtStartupHint: 'Bilgisayar açıldığında uygulama kendiliğinden başlar.',
    close: 'Kapat',
    uninstall: 'Kaldır',
    fetching: 'Sürüm aranıyor...',
    downloading: 'İndiriliyor',
    installing: 'Kuruluyor...',
    uninstalling: 'Kaldırılıyor...',
    errNoRelease: 'Bu uygulamanın henüz yayınlanmış bir sürümü yok.',
    errGeneric: 'Hata',
    buyLicense: 'Lisans satın al',
    noResults: 'Aramana uyan uygulama yok.',
    noInstalled: 'Henüz kurulu uygulama yok.',
    noInstalledHint: 'Mağazadan bir uygulama seçip kurabilirsin.',
    autostart: 'Windows ile başlat',
    autostartHint: 'Bilgisayar açıldığında Sentinel Hub kendiliğinden açılır.',
    autostartDev: 'Yalnızca kurulu (.exe) sürümde çalışır.',
    on: 'Açık',
    off: 'Kapalı',
    hubUpdate: 'Sentinel Hub güncellemesi hazır',
    hubUpdateHint: 'Güncelleyince Hub kapanıp yeni sürümle yeniden açılır.',
    hubUpdateNow: 'Güncelle ve yeniden başlat',
    language: 'Dil',
    languageHint: 'Arayüz dili',
    theme: 'Tema',
    themeHint: 'Görünüm',
    dark: 'Koyu',
    light: 'Açık',
  },
  en: {
    store: 'Store',
    installed: 'Installed',
    settings: 'Settings',
    search: 'Search apps...',
    apps: 'apps',
    install: 'Install',
    open: 'Open',
    update: 'Update',
    checkUpdates: 'Check for updates',
    checking: 'Checking...',
    appSettings: 'App settings',
    runAtStartup: 'Open at Windows startup',
    runAtStartupHint: 'The app starts automatically when you sign in.',
    close: 'Close',
    uninstall: 'Uninstall',
    fetching: 'Looking for release...',
    downloading: 'Downloading',
    installing: 'Installing...',
    uninstalling: 'Removing...',
    errNoRelease: 'This app has no published release yet.',
    errGeneric: 'Error',
    buyLicense: 'Buy license',
    noResults: 'No apps match your search.',
    noInstalled: 'No apps installed yet.',
    noInstalledHint: 'Pick an app from the store to install it.',
    autostart: 'Start with Windows',
    autostartHint: 'Sentinel Hub opens automatically when you sign in.',
    autostartDev: 'Only works in the installed (.exe) build.',
    on: 'On',
    off: 'Off',
    hubUpdate: 'Sentinel Hub update available',
    hubUpdateHint: 'The Hub will close and reopen on the new version.',
    hubUpdateNow: 'Update and restart',
    language: 'Language',
    languageHint: 'Interface language',
    theme: 'Theme',
    themeHint: 'Appearance',
    dark: 'Dark',
    light: 'Light',
  },
};

export function detectLang() {
  try {
    const saved = localStorage.getItem('hub.lang');
    if (saved && STRINGS[saved]) return saved;
  } catch {}
  return navigator.language && navigator.language.startsWith('tr') ? 'tr' : 'en';
}

export function detectTheme() {
  try {
    return localStorage.getItem('hub.theme') || 'dark';
  } catch {
    return 'dark';
  }
}

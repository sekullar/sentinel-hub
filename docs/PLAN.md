# Sentinel Hub - Plan

## Amaç
Kendi uygulamalarımı tek bir masaüstü "uygulama mağazası" altında toplayan Windows GUI: kur, güncelle, başlat, ayarla.
Uygulamalar Hub olmadan da çalışır; Hub ile daha ince ayarlı çalışır ve sürekli güncelleme alır (README'de belirtildi).
Sadece benim uygulamalarım; üçüncü taraf yok.

## Teknoloji
Electron + React + JavaScript (Vite). Veritabanı yok: durum `state.json` (Electron userData). Release'ler GitHub Actions ile.

## Bitenler
- Mağaza arayüzü: katalog, arama, TR/EN, koyu/açık tema, gece mavisi tasarım, animasyonlar, ince kaydırma çubuğu.
- Kur / kaldır / aç: GitHub Release'teki `*Setup*.exe` sessizce (`/S /D=`) kurulur, masaüstü kısayolu oluşur.
- Güncelleme: sürüm karşılaştırma, yeşil "Güncelle" düğmesi, çalışan uygulamayı kapatıp güncelle + yeniden aç.
  Başarısız kurulumda eski kopya geri yüklenir (`<id>.bak`). Hub dışında silinen uygulama listeden düşer.
- Uygulama ayarları: "Windows başlangıcında aç" (HKCU Run), kaldır.
- Hub: Windows ile başlar (ilk çalıştırmada açık, Ayarlar'dan kapatılır), kendini GitHub Release'ten günceller,
  `catalog.json`'u repodan çeker (önbellek + gömülü yedek). Kurulum: `npm run dist:local` (yönetici gerekmez).
- Release'ler hazır: Spotlight, Dynamic Bar, Phoneix (APK dahil).

## Açık işler
1. **Sentinel ve Sentinel Business paketleme.** Önce plan: anahtar/token'lar (Gmail, WhatsApp vb.) pakete girmez, ilk
   açılışta kullanıcıdan alınır. Python uygulamasını tek `.exe` mı (PyInstaller) yoksa Hub'ın kurduğu Python ortamı mı?
   Business için lisans akışı (şu an kartta pasif "Lisans satın al"; özel repo, token/yetkili indirme gerekir).
2. **Kod imzalama** (SmartScreen uyarısı için), maliyet/ihtiyaç değerlendirmesi.
3. Tray simgesi, güncelleme bildirimi, arka planda periyodik güncelleme denetimi.
4. AI not defteri uygulaması: `catalog.json`'a bir satır + uygulamanın Release'i.

## Kural
Uygulama repolarında Release, `*Setup*.exe` adlı NSIS kurulum dosyası içermeli (sessiz kurulum `/S`, `/D=`).
Etiket, `package.json` sürümüyle aynı olmalı.

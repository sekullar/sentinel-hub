# Sentinel Hub

Sentinel uygulamaları için küçük bir masaüstü "uygulama mağazası": uygulamalara göz at, kur, güncel tut ve tek yerden
başlat. Windows için, Electron + React ile yapıldı. [English README](README.md)

> **Uygulamalar Sentinel Hub olmadan da çalışabilir.** Katalogdaki her uygulama kendi kurulum dosyasıyla GitHub'dan
> indirilebilen, bağımsız bir Windows programıdır; Sentinel Hub isteğe bağlıdır. Sentinel Hub ile ise uygulamalar daha
> performanslı, ince ayarlı ve detaylı çalışır, üstelik sürekli güncelleme alır: tek yerden kurulum, tek tıkla güncelleme,
> uygulama başına ayarlar (ör. "Windows ile başlat"), masaüstü kısayolları ve aç/kapat düğmeleri.

## Ne yapar

- **Katalog:** uygulamaları (ad, açıklama, ikon) listeler. Liste, bu repodaki tek bir `catalog.json` dosyasıdır; Hub
  açılırken buradan çekilir (önbellek ve pakete gömülü kopya yedek olarak durur). Yeni uygulama eklemek için Hub'ı
  yeniden yayınlamak gerekmez.
- **Kur / kaldır:** uygulamanın son GitHub Release kurulum dosyasını indirir, `%LOCALAPPDATA%\SentinelHub\apps\<uygulama>`
  altına sessizce kurar ve masaüstüne kısayol koyar.
- **Güncelleme:** kurulu sürümü son Release ile karşılaştırır, yeşil **Güncelle** düğmesini gösterir, uygulamayı kapatır,
  yeni sürümü kurar ve yeniden açar. Kurulum başarısız olursa önceki kopya geri yüklenir.
- **Uygulama başına ayarlar:** "Windows başlangıcında aç", kaldırma.
- **Kendini güncelleme:** Sentinel Hub kendini bu repodaki Release'lerden günceller.
- **Windows ile başlat:** ilk çalıştırmadan sonra varsayılan olarak açıktır, Ayarlar'dan kapatılabilir.
- **Dil ve tema:** Türkçe / English, koyu / açık.

## Uygulamalar

| Uygulama | Repo |
| --- | --- |
| Spotlight | [sekullar/spotlight-for-windows](https://github.com/sekullar/spotlight-for-windows) |
| Dynamic Bar | [sekullar/dynamic-bar-for-windows](https://github.com/sekullar/dynamic-bar-for-windows) |
| Phoneix | [sekullar/phoneix](https://github.com/sekullar/phoneix) |
| Sentinel | yakında |
| Sentinel Business | lisanslı (yakında) |

## Kurulum

[Son sürümden](../../releases/latest) `Sentinel.Hub.Setup.<sürüm>.exe` dosyasını indirip çalıştır.
Kurulum dosyası kod imzalı değildir; Windows SmartScreen onay isteyebilir ("Daha fazla bilgi" → "Yine de çalıştır").

## Uygulama ekleme (geliştirici notları)

Sentinel Hub yalnızca geliştiricinin yayınladığı uygulamaları taşır; açık bir mağaza değildir, üçüncü taraf uygulama kabul etmez.
Aşağıdakiler, geliştiricinin kendi uygulamalarından birini kataloğa eklerken izlediği adımlardır:

1. Uygulamanın reposunda, Windows kurulum dosyası `*Setup*.exe` adında bir GitHub Release yayınlandığından emin ol
   (electron-builder NSIS bunu yapar). Kurulum dosyası sessiz kurulumu desteklemeli: `/S` ve `/D=<klasör>`.
2. [`catalog.json`](catalog.json) dosyasına bir kayıt ekle:

   ```json
   {
     "id": "my-app",
     "name": "My App",
     "description": { "tr": "Açıklama", "en": "Description" },
     "repo": "sekullar/my-app",
     "stack": "electron"
   }
   ```

3. Bu repoya commit'le ve push'la. Hub'lar bir sonraki açılışta yeni kaydı görür.

İsteğe bağlı alanlar: `extra` (`{ "label": { "tr": "", "en": "" }, "url": "https://..." }`, kartta bir bağlantı düğmesi),
`license: "required"` ve `private: true` ("Kur" yerine pasif bir "Lisans satın al" düğmesi gösterir).

## Geliştirme

```bash
npm install
npm start          # arayüzü derler ve uygulamayı açar
npm run dist       # release/ içinde kurulum dosyası (Windows'ta yönetici veya Geliştirici Modu gerekir)
npm run dist:local # aynı kurulum dosyası, yönetici hakkı olmadan
```

Release'ler GitHub Actions ile üretilir: `v0.1.1` gibi bir etiket push'lanınca kurulum dosyası derlenip yayınlanır.
Etiket, `package.json` içindeki `version` ile aynı olmalıdır.

## Lisans

MIT

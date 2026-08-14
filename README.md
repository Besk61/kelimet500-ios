# Kelimet500 v0.6.5 Mobile

## v0.6.8 branding hotfix

- `assets/logo.png` artık `mobile:android` / `mobile:ios` sırasında otomatik native app iconlara dönüştürülür.
- Animasyonlu splash artık dışarıdan branding resmi aramaz; oyun header'ındaki aynı 2×2 K / 5 / 0 / 0 logosunu kullanır.
- Sadece ikon yenilemek için `npm run branding:android` veya `npm run branding:ios` kullanılabilir.


## v0.6.5 — splash + native challenge links

- Native başlangıçta kısa statik launch screen ardından animasyonlu Kelimet500 splash gösterilir.
- Splash altında `BESK Entertainment` ve `Word500’den esinlenen bağımsız bir kelime oyunu.` metni bulunur.
- Kendi logonu `assets/logo.png` koyup `npm run branding:apply` ile Android/iOS ikonları ve splash kaynakları üretilebilir.
- Challenge linkleri artık `/challenge/<token>` formatındadır.
- Kurulu cihazlarda Android App Links / iOS Universal Links uygulamayı açar.
- Uygulama yoksa web challenge oynatmaz; mağaza fallback ekranı gösterir.
- `DEEP_LINK_SETUP.md` doğrulama ve store fallback ayarlarını içerir.


## v0.6.4 native viewport

- Native Android/iOS oyun ekranı artık tek viewporttur; ana sayfa scroll olmaz.
- AdMob `SizeChanged` yüksekliği kadar alan oyun ekranından dinamik olarak ayrılır; banner kontrollerin üstüne binmez.
- Alt safe-area/home-indicator payı banner yerleşimine ve oyun rezervasyonuna eklenir.
- Android 15/16 edge-to-edge için `@capacitor-community/safe-area@8.0.1` eklendi.
- Kısa ekranlarda board/klavye otomatik sıkışır; footer ve klavye yardım metni native sürümde gizlenir.

# Kelimet500 v0.6.3 Mobile

Türkçe, sayı-temelli kelime oyunu. Tek React/TypeScript kod tabanından Web + Android + iOS çalışır.

## v0.6.3 mobile yenilikleri

- Capacitor 8.4.2 tabanına yükseltildi.
- Android ve iOS platformlarını tek komutla oluşturan/senkronlayan scriptler eklendi.
- Native Android/iOS için AdMob adaptive bottom banner eklendi.
- Google UMP consent kontrolü reklam isteğinden önce çalışır.
- Geliştirme build'lerinde Google test reklamları varsayılandır.
- Native banner yüksekliği kadar oyun alanında güvenli boşluk bırakılır.
- Web AdSense slotları native uygulamada gösterilmez.
- Native paylaşım Android/iOS Share Sheet üzerinden yapılır.
- Arkadaş challenge linkleri native WebView adresi yerine her zaman canlı siteyi kullanır.
- Android/iOS AdMob App ID'lerini native projeye otomatik yazan patch scripti eklendi.
- Codemagic için Android signed AAB ve iOS signed IPA workflow'ları eklendi.
- iOS workflow Xcode 26.6 kullanır.
- Android release workflow Java 21 / Capacitor 8 kullanır.

v0.5'teki günlük kelime, iki aşamalı Hint, arkadaş challenge, localStorage save, animasyonlar ve web reklam altyapısı aynen korunur.

## Gereksinim

Native toolchain için Node 22+ kullan:

```bash
npm install
npm run dev
```

Web production build:

```bash
npm run build
```

Android oluştur/senkronla:

```bash
npm run mobile:android
```

iOS oluştur/senkronla (macOS/Codemagic):

```bash
npm run mobile:ios
```

Detaylı mağaza, AdMob, signing ve Codemagic kurulumu için **`MOBILE_RELEASE.md`** dosyasını takip et.

## Web

Canlı challenge/share URL'si varsayılan olarak:

`https://kelimet500.boraeskicioglu.com/`

Web AdSense ayarları için `ADS_SETUP.md` ve `.env.example` dosyalarına bak.

## Lisans / sözlük

Türkçe kelime listesi için `THIRD_PARTY_NOTICES.md` dosyasına bak.


## v0.6.3 hotfix
- Arkadaş meydan okuması linki açılırken özel cevap artık sözlükte aranmaz.
- `AŞKIM`, `CANIM` gibi 5 Türkçe harfli özel cevaplar challenge olarak doğru yüklenir.
- Challenge içindeki diğer yanlış tahminler normal sözlük kontrolünden geçmeye devam eder.


## v0.6.3 Windows hotfix

`mobile-init.mjs` now launches `npm.cmd` / `npx.cmd` through `cmd.exe` on Windows (Node 22 compatible) and prints child-process startup errors instead of exiting silently.


## v0.6.8 challenge fallback
- Arkadaş linkleri uygulama kuruluysa App/Universal Link ile native uygulamayı açar.
- Uygulama kurulu değilse veya bağlantı masaüstünde açılırsa aynı challenge web sürümünde doğrudan oynanır.
- Challenge oluşturma penceresindeki backend/teknik güvenlik notu kaldırıldı.

## v0.6.8 challenge akışı

- Web challenge bağlantısı önce “Arkadaşın sana bir kelime gönderdi” ekranını gösterir.
- Telefonda **Oyuna Git** önce `kelimet500://` ile native uygulamayı açmayı dener; uygulama yoksa aynı challenge webde devam eder.
- Masaüstünde **Oyuna Git** doğrudan web challenge'ını açar.
- Challenge karşılama ekranı, launch splash ile aynı K/5/0/0 `BrandIcon` bileşenini kullanır.
- Challenge oluşturma penceresinde örnek özel kelimeler gösterilmez.

## v0.6.9 — iOS / Codemagic release prep

- Added `IOS_CODEMAGIC_SETUP.md` with the exact Apple + Codemagic setup flow.
- Added `.env.codemagic.example`.
- Added `npm run verify:ios` / `verify:android` to catch App ID (`~`) vs banner unit (`/`) mixups before CI builds.
- Codemagic iOS workflow is pinned to Xcode 26.6 and uploads successful builds to TestFlight.

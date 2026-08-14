KELIMET500 APP ICON — v0.6.6

1) App icon olarak kullanacağın kare PNG'yi buraya:

   assets/logo.png

   adıyla koy. Öneri: 1024x1024 veya daha büyük, kenarlarda biraz güvenli boşluk.

2) Bundan sonra şu komut native iconları OTOMATIK üretir:

   npm run mobile:android
   npm run mobile:ios

Platform zaten oluşmuşsa sadece ikon yenilemek için:

   npm run branding:android
   npm run branding:ios

3) Android'de ikon değişikliğini görmüyorsan eski APK'yı telefondan kaldırıp yeniden kur.
   Launcher'lar eski ikonu cache'leyebiliyor. Android Studio'da Clean/Rebuild de yapabilirsin.

ÖNEMLİ:
- assets/logo.png = APP ICON kaynağıdır.
- Açılıştaki animasyonlu splash, oyunun sol üstündeki K/5/0/0 logosunu koddan çizer.
  Yani app icon dosyan splash'teki K500 işaretini değiştirmez.

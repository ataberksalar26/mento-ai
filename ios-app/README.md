# Mento AI iOS App

Bu klasör doğrudan açılabilir bir SwiftUI/Xcode projesidir. Uygulama `mento-ai.com` içindeki öğrenci panelini açar; geri/yenile kontrolü, çevrimdışı ekranı ve soru fotoğrafı seçme akışı native tarafta bulunur.

## Sabit bilgiler

- App adı: `Mento AI`
- Bundle ID: `com.ataberksalar.mentoai`
- App Store Apple ID: `6796065929`
- İlk sürüm: `1.0.0`
- Minimum iOS: `16.0`

## Windows üzerinden derleme

1. Bu klasör, GitHub deposunda `ios-app` adıyla bulunmalıdır.
2. Aynı deponun kökünde `codemagic.yaml` olmalıdır.
3. Codemagic'te Apple API anahtarının görünen adı tam olarak `mento_app_store_connect` yapılmalıdır.
4. Codemagic uygulamayı imzalar ve `.ipa` dosyasını üretir.

İlk build çıktıktan sonra TestFlight yüklemesini açacağız. App Store ekran görüntüleri, gizlilik bağlantıları ve açıklama da build sonrasında App Store Connect üzerinden tamamlanır.

## Xcode ile açma

Mac'te `MentoAI.xcodeproj` dosyasını aç. `Signing & Capabilities` alanında takım olarak `U3698U6257` seçili olmalıdır. Bundle ID hiçbir yerde değiştirilmemelidir.

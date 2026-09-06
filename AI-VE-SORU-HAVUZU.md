# AI siniri ve hazir test havuzu

AI sinirlari varsayilan olarak IP/IPv6 agi basina gunde 20, dakikada 3;
site genelinde gunde 300 istek, toplam 300000 rezerve cikti tokeni,
ayni anda 3 istek ve cevap basina en fazla 1800 token. Metin 16000 karakterle,
gorselli istek 8 MB ile sinirli. Basarisiz upstream denemeleri de sayilir.
Gun UTC 00:00'da yenilenir. Hazir testler OpenAI cagirmaz.

Ortak konu anlatimi ve kart istekleri 24 saatlik, en fazla 100 kayitlik
bellek onbelleginden sunulur; ayni anda gelen ayni icerik tek istege iner.
Sinirlar AI_DAILY_IP_LIMIT, AI_MINUTE_IP_LIMIT, AI_DAILY_SITE_LIMIT,
AI_DAILY_OUTPUT_TOKENS, AI_CONCURRENT_LIMIT, AI_MAX_OUTPUT_TOKENS ile degisir.
Bu bir dolar butcesi degil, istek/cikti siniridir.

Sayac varsayilan .runtime/ai-usage.json dosyasina cagri ONCESINDE yazilir.
Tek sunucu sureci icindir. Render'da yeniden dagitimlarda sayaci korumak icin
AI_USAGE_FILE kalici disk uzerinde bir yola ayarlanmalidir. Birden fazla instance
icin atomik ortak veri tabani gerekir; yerel dosya instance'lar arasinda paylasilmaz.
Dosya okunamaz/yazilamazsa harcamayi surdurmek yerine AI kapatilir.
TRUST_PROXY=1 yalniz guvenilir reverse proxy arkasinda kullanilmali.
Render ortami otomatik taninir. Istemcinin bildirdigi kullanici ID'sine guvenilmez.

## Icerik durumu

Her konu icin 30 soruluk, yeniden yayin izni uygun bir kaynak henuz bulunamadi.
question-bank.json bilerek bostur. Sahte kaynak ya da uretilmis soru yoktur.
Eksik test 404 QUESTION_BANK_PENDING ve resmi kaynak baglantilarini dondurur.
Eski AI test onbellegi yeni akista kullanilmaz.

Incelenen kaynaklar:
- https://osym.gov.tr/gizlilik-kullanim-ve-telif-haklari
- https://www.osym.gov.tr/verisoru-paylasimi-ve-kullanimina-iliskin-usul-ve-esaslar
- https://ogmmateryal.eba.gov.tr/soru-bankasi
- https://open.metu.edu.tr/handle/11511/70464 (NC-ND; ticari yeniden kullanim icin uygun degil)

Izinli bir kaynaktan alinmis test JSON dosyasi icin:
node scripts/import-question-bank.js dosya.json
Kapsam raporu: node scripts/import-question-bank.js

Dosya version:1 ve tests dizisi icermeli. Her test exam, lesson, topic ve
tam 30 questions icermeli. Her soru id, question, 4 veya 5 options,
correctIndex (0 tabanli), explanation, difficulty (orta/zor), reviewedBy,
source: {title,url,license,permissionReference,origin:"published"} icermeli.
Istege bagli image: /assets/questions/dosya.png (jpg/webp de olur).
permissionReference gercek lisans/izin belgesini gostermelidir.
Semantik dogruluk ve zorluk insan tarafindan kontrol edilmelidir;
sematik dogrulama yayin izninin veya cevabin dogrulugunun kaniti degildir.

# Psych Engine Admin Server

Duyuru + Liderlik tablosu backend'i. Render'a (ücretsiz) deploy etmek için:

## 1) Render'a Yükleme

1. Bu klasörü bir GitHub reposuna yükle (yeni boş repo aç, bu dosyaları içine koy, push et).
2. https://render.com adresine git, GitHub ile giriş yap.
3. **New +** → **Web Service** → reponu seç.
4. Ayarlar:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
5. **Create Web Service** de. Birkaç dakika sonra sana şöyle bir URL verecek:
   `https://senin-servisin.onrender.com`

Admin panele tarayıcıdan şu adresten girersin (şifresiz):
`https://senin-servisin.onrender.com/admin.html`

> Not: Ücretsiz planda sunucu 15 dk kullanılmayınca uyur, ilk istekte birkaç saniye
> gecikme olur — duyuru/skor sistemi için sorun teşkil etmez.

## 2) Psych Engine (Haxe) Tarafına Ekleme

Aşağıdaki kodları kaynak koda (kaynak kod projesini bulduğunda) ekle.
`SUNUCU_URL` yerine kendi Render adresini yaz.

### a) Duyuru gösterme (MainMenuState.hx içine, `create()` fonksiyonunun sonuna)

```haxe
import haxe.Http;
import haxe.Json;

// ... create() fonksiyonunun içine ekle:
var http = new Http("https://senin-servisin.onrender.com/announcement");
http.onData = function(data:String) {
    var res = Json.parse(data);
    if (res.message != null && res.message != "") {
        var duyuruText = new FlxText(0, 20, FlxG.width, res.message);
        duyuruText.setFormat(Paths.font("vcr.ttf"), 24, FlxColor.WHITE, CENTER);
        duyuruText.screenCenter(X);
        add(duyuruText);
    }
}
http.onError = function(err) trace("Duyuru alinamadi: " + err);
http.request(false);
```

### b) Skor gönderme (PlayState.hx içine — maç bittiğinde çağrılan yerin, örn. `endSong()` fonksiyonunun içine)

```haxe
import haxe.Http;
import haxe.Json;

// endSong() içinde, sky (miss) olmadan tamamlanan her 100 nota için 1 puan:
if (!songMisses && songHits) {
    var puan = Math.floor(songHits / 100); // 100 nota = 1 puan
    if (puan > 0) {
        var http = new Http("https://senin-servisin.onrender.com/score");
        http.setHeader("Content-Type", "application/json");
        http.setPostData(Json.stringify({
            player: ClientPrefs.data.playerName != null ? ClientPrefs.data.playerName : "Oyuncu",
            points: puan
        }));
        http.onData = function(_) trace("Skor gonderildi");
        http.onError = function(err) trace("Skor gonderilemedi: " + err);
        http.request(true); // true = POST
    }
}
```

> Not: `songMisses` / `songHits` değişken isimleri Psych Engine sürümüne göre
> değişebilir (örn. `songScore`, `misses` gibi) — kaynak kodu yükleyince
> PlayState.hx içindeki gerçek değişken isimlerine göre bu satırı birlikte
> düzenleriz.

### c) Oyuncu ismi (ClientPrefs — opsiyonel)

Eğer oyuncuların kendi ismini girebileceği bir alan yoksa, Options menüsüne
basit bir metin girişi eklenmesi gerekir (`ClientPrefs.data.playerName` gibi
yeni bir ayar). Kaynak kodu yükleyince Options dosyasına bunu da ekleriz.

## 3) Sırada ne var?

Bu backend + admin panel şimdiden çalışır durumda (deploy edip test edebilirsin).
Haxe tarafını gerçek kaynak koda entegre etmek için `source/` klasörünü
(sadece `.hx` dosyaları + `Project.xml`, `assets/` olmadan — birkaç MB) yükle,
gerçek dosya/değişken isimlerine göre kodu senin projene uyarlarım.

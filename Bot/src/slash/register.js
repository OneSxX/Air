const crypto = require("crypto");

function getGlobalCommandsBody() {
  return [
    // Voice manager
    {
      name: "setcreate",
      description: "Join-to-create voice kanalini ayarla",
      type: 1,
      dm_permission: false,
      default_member_permissions: "32",
      options: [
        {
          name: "kanal",
          description: "Oda olusturma voice kanali",
          type: 7,
          required: true,
          channel_types: [2],
        },
      ],
    },
    {
      name: "setup",
      description: "Secilen voice kanala panel kur",
      type: 1,
      dm_permission: false,
      default_member_permissions: "32",
      options: [
        {
          name: "kanal",
          description: "Hedef voice kanal",
          type: 7,
          required: false,
          channel_types: [2],
        },
      ],
    },
    {
      name: "panel",
      description: "Voice panelini bas veya guncelle",
      type: 1,
      dm_permission: false,
    },
    {
      name: "voice",
      description: "Voice oda yonetim komutlari",
      type: 1,
      dm_permission: false,
      default_member_permissions: "32",
      options: [
        {
          type: 1,
          name: "kapat",
          description: "Secilen voice kanal yonetimini kapat",
          options: [
            {
              name: "kanal",
              description: "Hedef voice kanal",
              type: 7,
              required: false,
              channel_types: [2],
            },
          ],
        },
      ],
    },

    // Ticket
    {
      name: "ticket",
      description: "Ticket sistemi",
      type: 1,
      dm_permission: false,
      default_member_permissions: "32",
      options: [
        {
          type: 1,
          name: "setup",
          description: "Ticket sistemini kur",
          options: [
            {
              name: "kategori",
              description: "Ticket kanallarinin acilacagi kategori",
              type: 7,
              required: true,
              channel_types: [4],
            },
            {
              name: "panel",
              description: "Ticket panelinin atilacagi kanal",
              type: 7,
              required: true,
              channel_types: [0, 5],
            },
            {
              name: "log",
              description: "Ticket log kanali",
              type: 7,
              required: false,
              channel_types: [0, 5],
            },
            {
              name: "yetkili_rol",
              description: "Yetkili rol",
              type: 8,
              required: false,
            },
          ],
        },
        { type: 1, name: "panel", description: "Ticket panelini yenile" },
        { type: 1, name: "off", description: "Ticket sistemini kapat" },
      ],
    },

    // Protection panels
    {
      name: "protection",
      description: "3 koruma panelini 3 ayri mesaj olarak kurar / gunceller.",
      type: 1,
      dm_permission: false,
      default_member_permissions: "32",
      options: [
        {
          type: 1,
          name: "panel",
          description: "3 koruma panelini 3 ayri mesaj olarak kurar / gunceller.",
        },
      ],
    },
    {
      name: "sohbet",
      description: "Sohbet koruma panelini kurar / gunceller.",
      type: 1,
      dm_permission: false,
      default_member_permissions: "32",
      options: [
        {
          type: 1,
          name: "korumalari",
          description: "Sohbet koruma panelini kurar / gunceller.",
        },
      ],
    },
    {
      name: "sunucu",
      description: "Sunucu koruma panelini kurar / gunceller.",
      type: 1,
      dm_permission: false,
      default_member_permissions: "32",
      options: [
        {
          type: 1,
          name: "korumalari",
          description: "Sunucu koruma panelini kurar / gunceller.",
        },
      ],
    },
    {
      name: "sunucuyetki",
      description: "Yetki limit panelini kurar / gunceller.",
      type: 1,
      dm_permission: false,
      default_member_permissions: "32",
      options: [
        {
          type: 1,
          name: "limitleri",
          description: "Yetki limit panelini kurar / gunceller.",
        },
      ],
    },

    // Log panel
    {
      name: "log",
      description: "Log panelini kurar / gunceller.",
      type: 1,
      dm_permission: false,
      default_member_permissions: "32",
    },
    {
      name: "autorol",
      description: "Sunucuya gelen uyelere otomatik rol verir.",
      type: 1,
      dm_permission: false,
      default_member_permissions: "268435456",
      options: [
        {
          type: 1,
          name: "ekle",
          description: "Gelen kullanicilara otomatik rol ver",
          options: [
            {
              name: "rol",
              description: "Otomatik verilecek rol",
              type: 8,
              required: true,
            },
          ],
        },
        {
          type: 1,
          name: "durum",
          description: "Otomatik rol ayarini goster",
        },
        {
          type: 1,
          name: "sil",
          description: "Otomatik rol sistemini kapat",
        },
      ],
    },
    {
      name: "hosgeldin",
      name_localizations: {
        tr: "hoşgeldin",
      },
      description: "Hos geldin ust mesaj ayarlarini yapar.",
      type: 1,
      dm_permission: false,
      default_member_permissions: "32",
      options: [
        {
          type: 1,
          name: "mesaji",
          name_localizations: {
            tr: "mesajı",
          },
          description: "Hos geldin mesaj metnini ayarla. [user] etiketi zorunlu.",
          options: [
            {
              name: "mesaj",
              name_localizations: {
                tr: "mesaj",
              },
              description: "Ust mesaj. [user] etiketi giren uyeyi etiketler.",
              type: 3,
              required: true,
            },
          ],
        },
        {
          type: 1,
          name: "ping",
          name_localizations: {
            tr: "ping",
          },
          description: "Hos geldin mesajinin atilacagi odayi ayarla.",
          options: [
            {
              name: "oda",
              name_localizations: {
                tr: "oda",
              },
              description: "Hos geldin mesaji kanali",
              type: 7,
              required: true,
              channel_types: [0, 5],
            },
          ],
        },
      ],
    },
    {
      name: "hosgeldinembed",
      name_localizations: {
        tr: "hoşgeldinembed",
      },
      description: "Hos geldin embed ayarlarini yapar.",
      type: 1,
      dm_permission: false,
      default_member_permissions: "32",
      options: [
        {
          type: 1,
          name: "basligi",
          name_localizations: {
            tr: "başlığı",
          },
          description: "Embed basligini ayarla.",
          options: [
            {
              name: "mesaj",
              name_localizations: {
                tr: "mesaj",
              },
              description: "Embed basligi",
              type: 3,
              required: true,
            },
          ],
        },
        {
          type: 1,
          name: "aciklama",
          name_localizations: {
            tr: "açıklama",
          },
          description: "Embed aciklamasini ayarla. [satir]/[satır] yeni satir yapar.",
          options: [
            {
              name: "mesaj",
              name_localizations: {
                tr: "mesaj",
              },
              description: "Embed aciklamasi",
              type: 3,
              required: true,
            },
          ],
        },
        {
          type: 1,
          name: "fotograf",
          name_localizations: {
            tr: "fotoğraf",
          },
          description: "Embed buyuk gorsel linkini ayarla.",
          options: [
            {
              name: "link",
              name_localizations: {
                tr: "link",
              },
              description: "Gorsel URL (https://...)",
              type: 3,
              required: true,
            },
          ],
        },
        {
          type: 1,
          name: "renk",
          name_localizations: {
            tr: "renk",
          },
          description: "Embed sol cizgi rengini ayarla.",
          options: [
            {
              name: "renk",
              name_localizations: {
                tr: "renk",
              },
              description: "Hex renk kodu (#ff6600 veya ff6600)",
              type: 3,
              required: true,
            },
          ],
        },
      ],
    },
    {
      name: "kelimeoyunu",
      name_localizations: {
        tr: "kelimeoyunu",
      },
      description: "Kelime oyunu kur/kapat/durum.",
      type: 1,
      dm_permission: false,
      default_member_permissions: "32",
      options: [
        {
          type: 1,
          name: "kur",
          name_localizations: {
            tr: "kur",
          },
          description: "Kelime oyunu odasini ayarla.",
          options: [
            {
              name: "oda",
              name_localizations: {
                tr: "oda",
              },
              description: "Kelime oyununun oynanacagi kanal",
              type: 7,
              required: true,
              channel_types: [0, 5],
            },
          ],
        },
        {
          type: 1,
          name: "off",
          name_localizations: {
            tr: "off",
          },
          description: "Kelime oyununu kapat.",
        },
        {
          type: 1,
          name: "durum",
          name_localizations: {
            tr: "durum",
          },
          description: "Kelime oyunu durumunu goster.",
        },
      ],
    },
    {
      name: "sayioyunu",
      name_localizations: {
        tr: "sayıoyunu",
      },
      description: "Sayi oyunu kur/kapat/durum.",
      type: 1,
      dm_permission: false,
      default_member_permissions: "32",
      options: [
        {
          type: 1,
          name: "kur",
          name_localizations: {
            tr: "kur",
          },
          description: "Sayi oyunu odasini ayarla.",
          options: [
            {
              name: "oda",
              name_localizations: {
                tr: "oda",
              },
              description: "Sayi oyununun oynanacagi kanal",
              type: 7,
              required: true,
              channel_types: [0, 5],
            },
          ],
        },
        {
          type: 1,
          name: "off",
          name_localizations: {
            tr: "off",
          },
          description: "Sayi oyununu kapat.",
        },
        {
          type: 1,
          name: "durum",
          name_localizations: {
            tr: "durum",
          },
          description: "Sayi oyunu durumunu goster.",
        },
      ],
    },
    {
      name: "muzik",
      description: "Muzik sistemi komutlari.",
      type: 1,
      dm_permission: false,
      options: [
        {
          type: 1,
          name: "cal",
          description: "Sarki veya YouTube linki oynatir.",
          options: [
            {
              name: "sorgu",
              description: "Sarki ismi veya YouTube linki",
              type: 3,
              required: true,
            },
          ],
        },
        {
          type: 1,
          name: "kuyruk",
          description: "Muzik kuyrugunu gosterir.",
        },
        {
          type: 1,
          name: "simdicalan",
          description: "Su an calan sarkiyi gosterir.",
        },
        {
          type: 1,
          name: "gec",
          description: "Calan sarkiyi gecer.",
        },
        {
          type: 1,
          name: "duraklat",
          description: "Calan sarkiyi duraklatir.",
        },
        {
          type: 1,
          name: "devam",
          description: "Duraklatilan sarkiyi devam ettirir.",
        },
        {
          type: 1,
          name: "durdur",
          description: "Muzigi durdurur ve kuyrugu temizler.",
        },
      ],
    },
    {
      name: "giveaway",
      description: "Giveaway baslatir, bitirir ve yeniden ceker.",
      type: 1,
      dm_permission: false,
      default_member_permissions: "32",
      options: [
        {
          type: 1,
          name: "baslat",
          description: "Yeni giveaway baslatir.",
          options: [
            {
              name: "odul",
              description: "Giveaway odulu",
              type: 3,
              required: true,
            },
            {
              name: "sure",
              description: "Sure (ornek: 30m, 2h, 1d 2h)",
              type: 3,
              required: true,
            },
            {
              name: "kazanan",
              description: "Kazanan sayisi",
              type: 4,
              required: true,
              min_value: 1,
              max_value: 20,
            },
            {
              name: "kanal",
              description: "Giveaway mesaji atilacak kanal (bossa mevcut kanal)",
              type: 7,
              required: false,
              channel_types: [0, 5],
            },
          ],
        },
        {
          type: 1,
          name: "bitir",
          description: "Aktif giveaway'i erkenden bitirir.",
          options: [
            {
              name: "mesajid",
              description: "Giveaway mesaj id (bos birakirsan bu kanaldaki son aktif)",
              type: 3,
              required: false,
            },
          ],
        },
        {
          type: 1,
          name: "yeniden",
          description: "Bitmis giveaway'i yeniden ceker.",
          options: [
            {
              name: "mesajid",
              description: "Bitmis giveaway mesaj id",
              type: 3,
              required: true,
            },
            {
              name: "kazanan",
              description: "Yeni cekimde kazanan sayisi (opsiyonel)",
              type: 4,
              required: false,
              min_value: 1,
              max_value: 20,
            },
          ],
        },
        {
          type: 1,
          name: "durum",
          description: "Giveaway durumunu gosterir.",
          options: [
            {
              name: "mesajid",
              description: "Giveaway mesaj id (opsiyonel)",
              type: 3,
              required: false,
            },
          ],
        },
      ],
    },
    {
      name: "durum",
      description: "Botun anlik saglik ve sistem durumunu gosterir.",
      type: 1,
      dm_permission: false,
      default_member_permissions: "32",
    },
    {
      name: "yedek",
      description: "Sadece bot sahibi: veritabani yedegi alir, listeler ve restore sirasi yapar.",
      type: 1,
      dm_permission: false,
      default_member_permissions: "0",
      options: [
        {
          type: 1,
          name: "al",
          description: "Hemen veritabani yedegi alir.",
        },
        {
          type: 1,
          name: "liste",
          description: "Son yedekleri listeler.",
        },
        {
          type: 1,
          name: "yukle",
          description: "Secili yedegi iki adimli onay ile restore icin siraya alir (restart gerekli).",
          options: [
            {
              name: "dosya",
              description: "Yedek dosya adi (ornek: db-20260101-120000-manual.sqlite)",
              type: 3,
              required: true,
            },
            {
              name: "onay",
              description: "Ilk calistirmada verilen onay kodu",
              type: 3,
              required: false,
            },
          ],
        },
        {
          type: 1,
          name: "durum",
          description: "Yedek sisteminin durumunu gosterir.",
        },
      ],
    },
    {
      name: "tepki",
      description: "Tepki rol mesaji kaydi olusturur (mesaji atmaz).",
      type: 1,
      dm_permission: false,
      default_member_permissions: "268435456",
      options: [
        {
          type: 1,
          name: "rol",
          description: "Tepki rol mesaji kaydi olusturur (mesaji atmaz).",
          options: [
            {
              name: "isim",
              description: "Tepki rol mesaj ismi",
              type: 3,
              required: true,
            },
            {
              name: "mesaj",
              description: "Gonderilecek mesaj metni",
              type: 3,
              required: true,
            },
            {
              name: "emoji",
              description: "Mesaja eklenecek emoji",
              type: 3,
              required: true,
            },
            {
              name: "rol",
              description: "Verilecek rol",
              type: 8,
              required: true,
            },
          ],
        },
      ],
    },
    {
      name: "tepkirol",
      description: "Tepki rol kaydi olusturur, atar veya siler.",
      type: 1,
      dm_permission: false,
      default_member_permissions: "268435456",
      options: [
        {
          type: 1,
          name: "rol",
          description: "Tepki rol mesaji kaydi olusturur (mesaji atmaz).",
          options: [
            {
              name: "isim",
              description: "Tepki rol mesaj ismi",
              type: 3,
              required: true,
            },
            {
              name: "mesaj",
              description: "Gonderilecek mesaj metni",
              type: 3,
              required: true,
            },
            {
              name: "emoji",
              description: "Mesaja eklenecek emoji",
              type: 3,
              required: true,
            },
            {
              name: "rol",
              description: "Verilecek rol",
              type: 8,
              required: true,
            },
          ],
        },
        {
          type: 1,
          name: "at",
          description: "Kayitli tepki rol mesajini bu kanala atar.",
          options: [
            {
              name: "isim",
              description: "Atilacak tepki rol mesaj ismi",
              type: 3,
              required: true,
            },
          ],
        },
        {
          type: 1,
          name: "sil",
          description: "Kayitli tepki rol mesajini siler.",
          options: [
            {
              name: "isim",
              description: "Silinecek tepki rol mesaj ismi",
              type: 3,
              required: true,
            },
          ],
        },
      ],
    },
    {
      name: "embedtepki",
      description: "Embed tepki rol kayitlarini yonetir.",
      type: 1,
      dm_permission: false,
      default_member_permissions: "268435456",
      options: [
        {
          type: 1,
          name: "rol",
          description: "Embed tepki rol kaydi olusturur (mesaji atmaz).",
          options: [
            {
              name: "isim",
              description: "Embed ismi",
              type: 3,
              required: true,
            },
            {
              name: "baslik",
              description: "Embed basligi",
              type: 3,
              required: true,
            },
            {
              name: "mesaj",
              description: "Embed aciklamasi ([satir] ile alt satir)",
              type: 3,
              required: true,
            },
            {
              name: "alt",
              description: "Embed en alttaki kucuk aciklama",
              type: 3,
              required: true,
            },
            {
              name: "rol",
              description: "Verilecek rol",
              type: 8,
              required: true,
            },
            {
              name: "emoji",
              description: "Mesaja eklenecek emoji (bossa varsayilan kullanilir)",
              type: 3,
              required: false,
            },
          ],
        },
        {
          type: 1,
          name: "kucukresim",
          description: "Embed kucuk resmi (thumbnail) ayarlar.",
          options: [
            {
              name: "isim",
              description: "Embed ismi",
              type: 3,
              required: true,
            },
            {
              name: "link",
              description: "Kucuk resim linki (https://...)",
              type: 3,
              required: true,
            },
          ],
        },
        {
          type: 1,
          name: "buyukresim",
          description: "Embed buyuk resmi ayarlar.",
          options: [
            {
              name: "isim",
              description: "Embed ismi",
              type: 3,
              required: true,
            },
            {
              name: "link",
              description: "Buyuk resim linki (https://...)",
              type: 3,
              required: true,
            },
          ],
        },
        {
          type: 1,
          name: "at",
          description: "Kayitli embed tepki rol mesajini bu kanala atar.",
          options: [
            {
              name: "isim",
              description: "Atilacak embed ismi",
              type: 3,
              required: true,
            },
          ],
        },
        {
          type: 1,
          name: "sil",
          description: "Kayitli embed tepki rol mesajini siler.",
          options: [
            {
              name: "isim",
              description: "Silinecek embed ismi",
              type: 3,
              required: true,
            },
          ],
        },
      ],
    },
    {
      name: "mute",
      description: "Mute rolunu, hapis kategorisini ve hapis odasini kurar.",
      type: 1,
      dm_permission: false,
      default_member_permissions: "268435472",
      options: [
        {
          type: 1,
          name: "rol_olustur",
          description: "Mute rolunu + hapis odasini kur ve kisitlamalari uygula",
        },
      ],
    },
    {
      name: "servertop",
      description: "Sunucunun yazi, ses veya coin siralamasini gosterir.",
      type: 1,
      dm_permission: false,
      options: [
        {
          name: "type",
          description: "Sunucunun yazi, ses veya coin siralamasini gosterir.",
          type: 3,
          required: true,
          choices: [
            { name: "Text", value: "text" },
            { name: "Voice", value: "voice" },
            { name: "Coin", value: "coin" },
          ],
        },
      ],
    },
    {
      name: "seviye",
      description: "Kanallarda seviye kazanimi ac/kapat.",
      type: 1,
      dm_permission: false,
      default_member_permissions: "32",
      options: [
        {
          type: 1,
          name: "kapat",
          description: "Secilen kanalda seviye kazanimi kapat.",
          options: [
            {
              name: "kanal",
              description: "Seviyesi kapatilacak kanal",
              type: 7,
              required: true,
              channel_types: [0, 2, 5, 13],
            },
          ],
        },
        {
          type: 1,
          name: "ac",
          description: "Secilen kanalda seviye kazanimi ac.",
          options: [
            {
              name: "kanal",
              description: "Seviyesi acilacak kanal",
              type: 7,
              required: true,
              channel_types: [0, 2, 5, 13],
            },
          ],
        },
      ],
    },
    {
      name: "textlevelrol",
      description: "Text level odul rolunu ayarlar.",
      type: 1,
      dm_permission: false,
      default_member_permissions: "32",
      options: [
        {
          type: 1,
          name: "ayarla",
          description: "Belirli text seviyesine ulasinca verilecek rolu ayarlar.",
          options: [
            {
              name: "rol",
              description: "Verilecek rol",
              type: 8,
              required: true,
            },
            {
              name: "text_level",
              description: "Rolun verilecegi text seviye",
              type: 4,
              required: true,
              min_value: 1,
              max_value: 10000,
            },
          ],
        },
        {
          type: 1,
          name: "list",
          description: "Kayitli text level rol odullerini listeler.",
        },
        {
          type: 1,
          name: "sil",
          description: "Belirli text level rol odulunu siler.",
          options: [
            {
              name: "text_level",
              description: "Silinecek text level",
              type: 4,
              required: true,
              min_value: 1,
              max_value: 10000,
            },
          ],
        },
        {
          type: 1,
          name: "sifirla",
          description: "Tum text level rol odullerini sifirlar.",
          options: [
            {
              name: "onay",
              description: "Sifirlama onayi",
              type: 3,
              required: true,
              choices: [
                { name: "EVET", value: "EVET" },
              ],
            },
          ],
        },
      ],
    },
    {
      name: "voicelevelrol",
      description: "Voice level odul rolunu ayarlar.",
      type: 1,
      dm_permission: false,
      default_member_permissions: "32",
      options: [
        {
          type: 1,
          name: "ayarla",
          description: "Belirli voice seviyesine ulasinca verilecek rolu ayarlar.",
          options: [
            {
              name: "rol",
              description: "Verilecek rol",
              type: 8,
              required: true,
            },
            {
              name: "voice_level",
              description: "Rolun verilecegi voice seviye",
              type: 4,
              required: true,
              min_value: 1,
              max_value: 10000,
            },
          ],
        },
        {
          type: 1,
          name: "list",
          description: "Kayitli voice level rol odullerini listeler.",
        },
        {
          type: 1,
          name: "sil",
          description: "Belirli voice level rol odulunu siler.",
          options: [
            {
              name: "voice_level",
              description: "Silinecek voice level",
              type: 4,
              required: true,
              min_value: 1,
              max_value: 10000,
            },
          ],
        },
        {
          type: 1,
          name: "sifirla",
          description: "Tum voice level rol odullerini sifirlar.",
          options: [
            {
              name: "onay",
              description: "Sifirlama onayi",
              type: 3,
              required: true,
              choices: [
                { name: "EVET", value: "EVET" },
              ],
            },
          ],
        },
      ],
    },
    {
      name: "slashsync",
      description: "Slash komutlarini secilen kapsamda elle gunceller.",
      type: 1,
      dm_permission: false,
      default_member_permissions: "32",
      options: [
        {
          name: "scope",
          description: "Senkron kapsamı",
          type: 3,
          required: false,
          choices: [
            { name: "Global (onerilen)", value: "global" },
            { name: "Sadece bu sunucu", value: "guild" },
            { name: "Global + sunucu", value: "both" },
            { name: "Bu sunucu komutlarini temizle", value: "clear_guild" },
          ],
        },
        {
          name: "force",
          description: "Hash ayni olsa da secilen kapsam kaydini zorla yeniler.",
          type: 5,
          required: false,
        },
      ],
    },
    {
      name: "profile",
      description: "Kullanicinin detayli siralama kartini gosterir.",
      type: 1,
      dm_permission: false,
      options: [
        {
          name: "uye",
          description: "Bakilacak uye",
          type: 6,
          required: false,
        },
      ],
    },
    {
      name: "avatar",
      description: "Secilen uyenin avatarini gosterir.",
      type: 1,
      dm_permission: false,
      options: [
        {
          name: "uye",
          description: "Avatari gosterilecek uye (bos birakirsan kendin)",
          type: 6,
          required: false,
        },
      ],
    },
    {
      name: "help",
      description: "Aktif komutlarin yardim listesini DM olarak gonderir.",
      type: 1,
    },
    {
      name: "market",
      description: "Coin marketini acar ve urun satin almani saglar.",
      type: 1,
      dm_permission: false,
    },
    {
      name: "marketyonet",
      description: "Market urunlerini ekle veya sil.",
      type: 1,
      dm_permission: false,
      default_member_permissions: "32",
      options: [
        {
          name: "islem",
          description: "Yonetim islemi: ekle/sil",
          type: 3,
          required: true,
          choices: [
            { name: "Ekle", value: "ekle" },
            { name: "Sil", value: "sil" },
          ],
        },
        {
          name: "isim",
          description: "Urun ismi",
          type: 3,
          required: false,
        },
        {
          name: "coin",
          description: "Urun coin fiyati",
          type: 10,
          required: false,
        },
        {
          name: "rol",
          description: "Urun satin alininca verilecek rol (opsiyonel)",
          type: 8,
          required: false,
        },
      ],
    },
    {
      name: "bump",
      description: "Bump hatirlatma ayarlari.",
      type: 1,
      dm_permission: false,
      default_member_permissions: "32",
      options: [
        {
          type: 1,
          name: "remind",
          description: "Bump saatine gore rol etiketli dongulu hatirlatma ayarla.",
          options: [
            {
              name: "mesaj",
              description: "Hatirlatma mesaji",
              type: 3,
              required: true,
            },
            {
              name: "roller",
              description: "Etiketlenecek rol veya roller (mention/ID, boslukla ayir)",
              type: 3,
              required: true,
            },
          ],
        },
      ],
    },
    {
      name: "bumpremind",
      name_localizations: {
        tr: "bumpremind",
      },
      description: "Bump remind sistemini ac/kapat/durum.",
      type: 1,
      dm_permission: false,
      default_member_permissions: "32",
      options: [
        {
          type: 1,
          name: "on",
          name_localizations: {
            tr: "on",
          },
          description: "Bump remind sistemini acar.",
        },
        {
          type: 1,
          name: "off",
          name_localizations: {
            tr: "off",
          },
          description: "Bump remind sistemini kapatir ve ayarlari sifirlar.",
        },
        {
          type: 1,
          name: "durum",
          name_localizations: {
            tr: "durum",
          },
          description: "Bump remind durumunu gosterir.",
        },
      ],
    },
    {
      name: "panic",
      description: "Acil durumda koruma seviyesini gecici olarak en yuksege ceker.",
      type: 1,
      dm_permission: false,
      default_member_permissions: "32",
      options: [
        {
          type: 1,
          name: "on",
          description: "Panic mode ac ve raid kilidini etkinlestir.",
          options: [
            {
              name: "sure",
              description: "Panic suresi (10m, 1h, 1d). Varsayilan: 15m",
              type: 3,
              required: false,
            },
            {
              name: "sebep",
              description: "Acil durum notu",
              type: 3,
              required: false,
            },
          ],
        },
        {
          type: 1,
          name: "off",
          description: "Panic mode kapat ve raid kilidini kaldir.",
          options: [
            {
              name: "sebep",
              description: "Kapatma notu",
              type: 3,
              required: false,
            },
          ],
        },
        {
          type: 1,
          name: "durum",
          description: "Panic mode durumunu goster.",
        },
      ],
    },
    {
      name: "sicil",
      description: "Kullanicinin case gecmisini gosterir.",
      type: 1,
      dm_permission: false,
      default_member_permissions: "32",
      options: [
        {
          name: "uye",
          description: "Sicili gorulecek uye (bos birakirsan kendin)",
          type: 6,
          required: false,
        },
      ],
    },
    {
      name: "ceza",
      description: "Kullaniciya timeout, kick veya ban uygular ve case acar.",
      type: 1,
      dm_permission: false,
      default_member_permissions: "1099511627782",
      options: [
        {
          name: "uye",
          description: "Ceza uygulanacak uye",
          type: 6,
          required: true,
        },
        {
          name: "islem",
          description: "Uygulanacak ceza tipi",
          type: 3,
          required: true,
          choices: [
            { name: "timeout", value: "timeout" },
            { name: "kick", value: "kick" },
            { name: "ban", value: "ban" },
          ],
        },
        {
          name: "sebep",
          description: "Ceza sebebi",
          type: 3,
          required: true,
        },
        {
          name: "sure",
          description: "Timeout suresi (10m, 2h, 1d, 1w). Sadece timeout icin.",
          type: 3,
          required: false,
        },
      ],
    },
  ];
}

async function registerGlobalCommands(appId, token, body = getGlobalCommandsBody()) {
  const url = `https://discord.com/api/v10/applications/${appId}/commands`;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Global slash register failed (${res.status}): ${txt}`);
  }

  console.log("Global slash komutlari kaydedildi.");
}

async function registerGuildCommands(appId, guildId, token, body = getGlobalCommandsBody()) {
  const url = `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Guild slash register failed (${res.status}): ${txt}`);
  }

  console.log(`Guild slash komutlari kaydedildi: ${guildId}`);
}

function getGlobalCommandsHash(body = getGlobalCommandsBody()) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(body))
    .digest("hex");
}

module.exports = {
  registerGlobalCommands,
  registerGuildCommands,
  getGlobalCommandsBody,
  getGlobalCommandsHash,
};


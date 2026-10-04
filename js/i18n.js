/* BizDyali i18n (phase 1: foundations).
   Tiny dictionary for every UI string render.js and b.html emit.
   biz.lang override wins ('en' | 'fr' | 'ar'); otherwise auto-detected
   from the business's own text. Wiring into render happens in phase 2. */
(function (global) {
  'use strict';

  var STRINGS = {
    en: {
      whatsapp: 'WhatsApp', call: 'Call', directions: 'Directions', share: 'Share', copied: 'Copied',
      menu: 'Menu', products: 'Products', services: 'Services', productsServices: 'Products & services',
      followUs: 'Follow us', findUs: 'Find us', openingHours: 'Opening hours',
      getDirections: 'Get directions', fullscreen: 'Fullscreen', close: 'Close',
      prevPhoto: 'Previous photo', nextPhoto: 'Next photo', goodToKnow: 'Good to know',
      comingSoon: 'Full list coming soon — contact us on WhatsApp and we’ll help you right away.',
      currency: 'MAD', openPhoto: 'Open photo {a} of {b} fullscreen', openItemPhoto: 'Open {name} photo fullscreen',
      viewPhotos: 'View {n} photos of {name}', itemVideo: '{name} video', showPhoto: 'Show photo {n}',
      photoOf: '{name} photo {n}', logoOf: '{name} logo', pageOf: '{name}',
      unavailableTitle: 'This page is temporarily unavailable.',
      notFoundTitle: 'Page not found', notFoundText: 'This BizDyali link doesn’t exist or was never published.',
      directoryTitle: 'Businesses on BizDyali', directoryText: 'Live public pages.',
      createCta: 'Create Your Free Business Page', poweredBy: 'Powered by',
      openNow: 'Open now', closesAt: '· closes {t}', closedNow: 'Closed', opensAt: '· opens {t}',
      askWhatsApp: 'Ask on WhatsApp', orderBar: 'Send order ({n} items · {total})',
      addedToOrder: 'Added', photos: 'Photos', all: 'All', popular: 'Popular', isNew: 'New',
      testimonials: 'What customers say', trustTitle: 'Good to know'
    },
    fr: {
      whatsapp: 'WhatsApp', call: 'Appeler', directions: 'Itinéraire', share: 'Partager', copied: 'Copié',
      menu: 'Menu', products: 'Produits', services: 'Services', productsServices: 'Produits & services',
      followUs: 'Suivez-nous', findUs: 'Nous trouver', openingHours: 'Horaires d’ouverture',
      getDirections: 'Itinéraire', fullscreen: 'Plein écran', close: 'Fermer',
      prevPhoto: 'Photo précédente', nextPhoto: 'Photo suivante', goodToKnow: 'Bon à savoir',
      comingSoon: 'Liste complète bientôt disponible — contactez-nous sur WhatsApp et on vous aide tout de suite.',
      currency: 'DH', openPhoto: 'Ouvrir la photo {a} sur {b} en plein écran', openItemPhoto: 'Ouvrir la photo de {name} en plein écran',
      viewPhotos: 'Voir les {n} photos de {name}', itemVideo: 'Vidéo : {name}', showPhoto: 'Afficher la photo {n}',
      photoOf: '{name} photo {n}', logoOf: 'Logo {name}', pageOf: '{name}',
      unavailableTitle: 'Cette page est temporairement indisponible.',
      notFoundTitle: 'Page introuvable', notFoundText: 'Ce lien BizDyali n’existe pas ou n’a jamais été publié.',
      directoryTitle: 'Commerces sur BizDyali', directoryText: 'Pages publiques en ligne.',
      createCta: 'Créez votre page business gratuite', poweredBy: 'Propulsé par',
      openNow: 'Ouvert', closesAt: '· ferme à {t}', closedNow: 'Fermé', opensAt: '· ouvre à {t}',
      askWhatsApp: 'Commander sur WhatsApp', orderBar: 'Envoyer la commande ({n} articles · {total})',
      addedToOrder: 'Ajouté', photos: 'Photos', all: 'Tout', popular: 'Populaire', isNew: 'Nouveau',
      testimonials: 'Ce que disent les clients', trustTitle: 'Bon à savoir'
    },
    ar: {
      whatsapp: 'واتساب', call: 'عيّط', directions: 'الطريق', share: 'پارطاجي', copied: 'تنسخ ✓',
      menu: 'المينيو', products: 'البرودويات', services: 'الخدمات', productsServices: 'البرودويات والخدمات',
      followUs: 'تبعنا', findUs: 'فين تلقانا', openingHours: 'التوقيت',
      getDirections: 'شوف الطريق', fullscreen: 'كبّر', close: 'سدّ',
      prevPhoto: 'التصويرة اللي قبل', nextPhoto: 'التصويرة اللي من بعد', goodToKnow: 'معلومات تنفعك',
      comingSoon: 'الليست كاملة جاية فالطريق — سيفط لينا فواتساب وغنجاوبوك دابا.',
      currency: 'درهم', openPhoto: 'كبّر التصويرة {a} من {b}', openItemPhoto: 'كبّر تصويرة {name}',
      viewPhotos: 'شوف {n} تصاور ديال {name}', itemVideo: 'الفيديو ديال {name}', showPhoto: 'ورّي التصويرة {n}',
      photoOf: 'التصويرة {n} ديال {name}', logoOf: 'اللوڭو ديال {name}', pageOf: '{name}',
      unavailableTitle: 'هاد الصفحة واقفة مؤقتا.',
      notFoundTitle: 'هاد الصفحة ما كايناش', notFoundText: 'هاد الرابط ديال BizDyali ما كاينش ولا ما تنشرش.',
      directoryTitle: 'المشاريع على BizDyali', directoryText: 'صفحات خدامة دابا.',
      createCta: 'صايب الصفحة ديالك فابور', poweredBy: 'من',
      openNow: 'حال دابا', closesAt: '· كيسد مع {t}', closedNow: 'ساد دابا', opensAt: '· كيحل مع {t}',
      askWhatsApp: 'سول فواتساب', orderBar: 'سيفط الكوموند ({n} حاجات · {total})',
      addedToOrder: 'تزادت ✓', photos: 'التصاور', all: 'كولشي', popular: 'الأكثر طلبا', isNew: 'جديد',
      testimonials: 'شنو كيقولو الزبناء', trustTitle: 'معلومات تنفعك'
    }
  };

  function detect(text) {
    var s = String(text || '');
    if (!s.trim()) return 'en';
    var ar = (s.match(/[\u0600-\u06FF]/g) || []).length;
    var letters = (s.match(/[A-Za-z\u0600-\u06FF]/g) || []).length;
    if (letters && ar / letters > 0.3) return 'ar';
    if (/[àâçéèêëîïôûùœ]|\\b(le|la|les|des|une|pour|avec|notre|vous|dans|sur)\\b/i.test(s)) return 'fr';
    return 'en';
  }
  function langOf(biz) {
    if (biz && (biz.lang === 'en' || biz.lang === 'fr' || biz.lang === 'ar')) return biz.lang;
    var text = ((biz && biz.name) || '') + '\n' + ((biz && biz.description) || '');
    return detect(text);
  }
  function str(lang, key, vars) {
    var table = STRINGS[lang] || STRINGS.en;
    var s = table[key] !== undefined ? table[key] : (STRINGS.en[key] || key);
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }
  function dirOf(lang) { return lang === 'ar' ? 'rtl' : 'ltr'; }

  global.BizI18n = { STRINGS: STRINGS, detect: detect, langOf: langOf, str: str, dirOf: dirOf };
})(window);

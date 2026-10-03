/* BizDyali theme engine (phase 1: foundations).
   Derives one restrained accent per business from the owner's own imagery,
   or falls back to the look's default. All output is WCAG-AA enforced.
   No runtime network use. Vanilla IIFE, like the rest of the codebase. */
(function (global) {
  'use strict';

  // Look defaults: one confident accent + type pairing each.
  // (Full per-look layouts arrive in phase 2; these tokens already work.)
  var LOOKS = {
    editorial: { accent: '#0A6B4F', display: 'Fraunces', body: 'Inter' },
    atelier:   { accent: '#8A6D3B', display: 'Playfair Display', body: 'Jost' },
    boutique:  { accent: '#B08D57', display: 'Fraunces', body: 'Inter' },
    workshop:  { accent: '#C2410C', display: 'Archivo', body: 'Archivo' },
    market:    { accent: '#D97706', display: 'Nunito', body: 'Nunito' }
  };
  var AR_DISPLAY = 'Noto Naskh Arabic';
  var AR_BODY = 'IBM Plex Sans Arabic';

  function lookForCategory(cat) {
    var c = String(cat || '').toLowerCase();
    if (/salon|barb|beaut|spa|coiffure|nail|massage|hammam/i.test(c)) return 'atelier';
    if (/cloth|v[eê]tement|mode|shoe|chaussure|jewel|bijou|artisan|craft|atelier|decor|meuble|furniture/i.test(c)) return 'boutique';
    if (/repair|r[eé]paration|electronic|auto|garage|plomb|plomber|electric|phone|t[eé]l[eé]phone|home|service/i.test(c)) return 'workshop';
    if (/grocer|grocery|hanout|market|march[eé]|traiteur|epicerie|general/i.test(c)) return 'market';
    return 'editorial'; // cafés, restaurants, bakeries and everything else
  }

  /* ---------- minimal OKLCH math ---------- */
  function srgbToLinear(v) {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
  function rgbToOklch(r, g, b) {
    r = srgbToLinear(r); g = srgbToLinear(g); b = srgbToLinear(b);
    var l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
    var m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
    var s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
    l = Math.cbrt(l); m = Math.cbrt(m); s = Math.cbrt(s);
    var L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    var a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    var bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    return { L: L, C: Math.sqrt(a * a + bb * bb), h: (Math.atan2(bb, a) * 180 / Math.PI + 360) % 360 };
  }
  function oklchToRgb(L, C, h) {
    var hr = h * Math.PI / 180;
    var a = C * Math.cos(hr), b = C * Math.sin(hr);
    var l = L + 0.3963377774 * a + 0.2158037573 * b;
    var m = L - 0.1055613458 * a - 0.0638541728 * b;
    var s = L - 0.0894841775 * a - 1.2914855480 * b;
    l = l * l * l; m = m * m * m; s = s * s * s;
    var r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    var g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    var bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
    function gam(v) {
      v = Math.max(0, Math.min(1, v));
      return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
    }
    return { r: gam(r), g: gam(g), b: gam(bl) };
  }
  function hexOf(L, C, h) {
    var c = oklchToRgb(L, C, h);
    function h2(v) { var s = v.toString(16); return s.length < 2 ? '0' + s : s; }
    return '#' + h2(c.r) + h2(c.g) + h2(c.b);
  }
  function lumOf(hex) {
    var v = [1, 3, 5].map(function (i) {
      var x = parseInt(hex.substr(i, 2), 16) / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  function ratio(fg, bg) {
    var a = lumOf(fg), b = lumOf(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  /* ---------- sampling ---------- */
  function sampleImage(src) {
    // Resolves to {L,C,h,coverage} of the dominant chromatic cluster, or null.
    return new Promise(function (resolve) {
      if (!src) return resolve(null);
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        try {
          var S = 32;
          var cv = document.createElement('canvas');
          cv.width = S; cv.height = S;
          var cx = cv.getContext('2d', { willReadFrequently: true });
          cx.drawImage(img, 0, 0, S, S);
          var d = cx.getImageData(0, 0, S, S).data;
          var bins = [];
          for (var i = 0; i < 36; i++) bins.push({ w: 0, L: 0, C: 0, hx: 0, hy: 0 });
          var total = 0;
          for (var p = 0; p < d.length; p += 4) {
            if (d[p + 3] < 128) continue;
            var o = rgbToOklch(d[p], d[p + 1], d[p + 2]);
            if (o.L < 0.18 || o.L > 0.92 || o.C < 0.03) continue; // ignore near-black/white/grey
            var bin = bins[Math.floor(o.h / 10) % 36];
            var wgt = o.C;
            bin.w += wgt; bin.L += o.L * wgt; bin.C += o.C * wgt;
            bin.hx += Math.cos(o.h * Math.PI / 180) * wgt;
            bin.hy += Math.sin(o.h * Math.PI / 180) * wgt;
            total += wgt;
          }
          if (!total) return resolve(null);
          bins.sort(function (a, b) { return b.w - a.w; });
          var top = bins[0];
          if (top.w / total < 0.08) return resolve(null); // no coherent colour story
          resolve({
            L: top.L / top.w, C: top.C / top.w,
            h: (Math.atan2(top.hy, top.hx) * 180 / Math.PI + 360) % 360,
            coverage: top.w / total
          });
        } catch (e) { resolve(null); } // tainted canvas, CORS, etc. -> fallback
      };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  function isUnflattering(h, C) {
    h = ((h % 360) + 360) % 360;
    if (h >= 278 && h <= 335) return true; // harsh magenta-purple
    if (h >= 80 && h <= 115 && C > 0.14) return true; // bilious yellow-green
    return false;
  }

  /* ---------- token generation ---------- */
  function mixHex(hexA, hexB, t) {
    // linear mix in sRGB; t=0 -> A, t=1 -> B
    function ch(h, i) { return parseInt(h.substr(i, 2), 16); }
    function hx(v) { v = Math.max(0, Math.min(255, Math.round(v))); var s = v.toString(16); return s.length < 2 ? '0' + s : s; }
    var r = ch(hexA, 1) + (ch(hexB, 1) - ch(hexA, 1)) * t;
    var g = ch(hexA, 3) + (ch(hexB, 3) - ch(hexA, 3)) * t;
    var b = ch(hexA, 5) + (ch(hexB, 5) - ch(hexA, 5)) * t;
    return '#' + hx(r) + hx(g) + hx(b);
  }
  var PAPER = '#FDFCF8';

  function buildTokens(look, sampled) {
    var fallback = LOOKS[look].accent;
    var useFallback = !sampled || sampled.C < 0.05 || isUnflattering(sampled.h, sampled.C);
    var accent, source;
    if (useFallback) { accent = fallback; source = 'look-default'; }
    else {
      // Aim mid-lightness with healthy chroma, keep the owner's hue.
      var L = Math.max(0.42, Math.min(0.62, sampled.L));
      var C = Math.max(0.1, Math.min(0.2, sampled.C));
      accent = hexOf(L, C, sampled.h);
      source = 'sampled';
    }
    // Enforce AA for white text on accent (primary buttons): nudge darker until pass.
    var ink = '#FFFFFF';
    var guard = 0;
    var o = hexToOklch(accent);
    while (ratio(ink, accent) < 4.5 && guard++ < 20) {
      o.L = Math.max(0.2, o.L - 0.03);
      accent = hexOf(o.L, o.C, o.h);
    }
    if (ratio(ink, accent) < 4.5) { accent = fallback; source = 'look-default'; ink = '#FFFFFF'; }
    // Accent text on paper (prices, markers): nudge until AA too.
    var textAccent = accent, g2 = 0;
    var oo = hexToOklch(accent);
    while (ratio(textAccent, PAPER) < 4.5 && g2++ < 20) {
      oo.L = Math.max(0.2, oo.L - 0.03);
      textAccent = hexOf(oo.L, oo.C, oo.h);
    }
    return {
      look: look, source: source,
      accent: accent, accentInk: ink, accentText: textAccent,
      tint: mixHex(accent, PAPER, 0.88),
      hairline: mixHex(accent, '#3A443F', 0.55),
      deep: mixHex(accent, '#0B1512', 0.55),
      onTintRatio: ratio(textAccent, PAPER).toFixed(2),
      onAccentRatio: ratio(ink, accent).toFixed(2)
    };
  }
  function hexToOklch(hex) {
    return rgbToOklch(parseInt(hex.substr(1, 2), 16), parseInt(hex.substr(3, 2), 16), parseInt(hex.substr(5, 2), 16));
  }

  function resolveLook(biz) {
    if (biz && biz.theme && biz.theme.look && LOOKS[biz.theme.look]) return biz.theme.look;
    return lookForCategory(biz && biz.category);
  }
  function resolveTheme(biz) {
    // Sync part: look + fonts + explicit accent override. Async sampling applied via applyTheme().
    var look = resolveLook(biz);
    var fonts = { display: LOOKS[look].display, body: LOOKS[look].body };
    if (biz && biz.theme && biz.theme.accent && /^#[0-9a-f]{6}$/i.test(biz.theme.accent)) {
      var fixed = buildTokens(look, { L: 0.55, C: 0.16, h: hexToOklch(biz.theme.accent).h, coverage: 1 });
      fixed.accent = biz.theme.accent; // owner-picked: still AA-enforce text below
      fixed.source = 'owner';
      return { look: look, fonts: fonts, tokens: fixed };
    }
    return { look: look, fonts: fonts, tokens: buildTokens(look, null) };
  }
  async function applyTheme(biz, root) {
    // root: the .bp element. Samples cover (then logo), upgrades tokens in place.
    var t = resolveTheme(biz);
    paintTokens(root, t);
    var src = (biz && (biz.cover || biz.logo)) || null;
    var photo = typeof src === 'string' ? src : (src && src.src);
    if (!photo) return t;
    var s = await sampleImage(photo);
    t.tokens = buildTokens(t.look, s);
    paintTokens(root, t);
    return t;
  }
  function paintTokens(root, t) {
    if (!root) return;
    root.setAttribute('data-look', t.look);
    var st = root.style;
    st.setProperty('--t-accent', t.tokens.accent);
    st.setProperty('--t-accent-ink', t.tokens.accentInk);
    st.setProperty('--t-accent-text', t.tokens.accentText);
    st.setProperty('--t-tint', t.tokens.tint);
    st.setProperty('--t-hairline', t.tokens.hairline);
    st.setProperty('--t-deep', t.tokens.deep);
    st.setProperty('--t-font-display', "'" + t.fonts.display + "', " + (t.fonts.display === AR_DISPLAY ? 'serif' : 'Georgia, serif'));
    st.setProperty('--t-font-body', "'" + t.fonts.body + "', " + 'system-ui, sans-serif');
  }

  global.BizTheme = {
    LOOKS: LOOKS, AR_DISPLAY: AR_DISPLAY, AR_BODY: AR_BODY,
    lookForCategory: lookForCategory, resolveLook: resolveLook,
    resolveTheme: resolveTheme, applyTheme: applyTheme,
    sampleImage: sampleImage, buildTokens: buildTokens, ratio: ratio,
    isUnflattering: isUnflattering
  };
})(window);

// BizDyali homepage — minimal JS, no framework
(function () {
  var menuBtn = document.getElementById('menuBtn');
  var mobileMenu = document.getElementById('mobileMenu');
  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener('click', function () {
      var open = mobileMenu.hasAttribute('hidden');
      if (open) {
        mobileMenu.removeAttribute('hidden');
        menuBtn.setAttribute('aria-expanded', 'true');
        menuBtn.setAttribute('aria-label', 'سد القائمة');
      } else {
        mobileMenu.setAttribute('hidden', '');
        menuBtn.setAttribute('aria-expanded', 'false');
        menuBtn.setAttribute('aria-label', 'حل القائمة');
      }
    });
    mobileMenu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        mobileMenu.setAttribute('hidden', '');
        menuBtn.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Footer year
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  // Final CTA → account creation. A phone-like input is staged in sessionStorage
  // (never the URL: numbers leak through history/referrers); otherwise the
  // business name travels via ?biz= as before.
  var form = document.getElementById('ctaForm');
  var input = document.getElementById('ctaInput');
  if (form && input) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = input.value.trim();
      var digits = v.replace(/[^0-9]/g, '');
      if (digits.length >= 8 && window.BizAuth) {
        try { sessionStorage.setItem('bizdyali_login_phone', v.slice(0, 24)); } catch (e2) {}
        location.href = 'auth.html';
        return;
      }
      location.href = 'auth.html' + (v ? '?biz=' + encodeURIComponent(v.slice(0, 60)) : '');
    });
  }

  // Subtle reveal-on-scroll (disabled if reduced motion)
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce && 'IntersectionObserver' in window) {
    var els = document.querySelectorAll('.f-card, .step, .service-card, .price-card');
    els.forEach(function (el) { el.classList.add('reveal'); });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('visible');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12 });
    els.forEach(function (el) { io.observe(el); });
  }
})();

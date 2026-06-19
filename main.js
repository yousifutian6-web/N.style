// Scroll fade-in animation
(function () {
  var fadeEls = document.querySelectorAll('.fade-in');
  if (!('IntersectionObserver' in window)) {
    fadeEls.forEach(function (el) { el.classList.add('is-visible'); });
    return;
  }
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  fadeEls.forEach(function (el) { observer.observe(el); });
})();

// FAQ accordion
(function () {
  var items = document.querySelectorAll('.faq-item');
  items.forEach(function (item) {
    var btn = item.querySelector('.faq-item__question');
    btn.addEventListener('click', function () {
      var isOpen = item.classList.contains('is-open');
      items.forEach(function (other) {
        other.classList.remove('is-open');
        other.querySelector('.faq-item__question').setAttribute('aria-expanded', 'false');
      });
      if (!isOpen) {
        item.classList.add('is-open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });
})();

// Form submit (demo)
var contactForm = document.getElementById('contactForm');
if (contactForm) {
  contactForm.addEventListener('submit', function (e) {
    e.preventDefault();
    alert('お問い合わせありがとうございます。\n内容を確認のうえ、24時間以内にご返信いたします。');
    this.reset();
  });
}

// Header shadow on scroll
(function () {
  var header = document.querySelector('.header');
  if (!header) return;
  window.addEventListener('scroll', function () {
    header.style.boxShadow = window.scrollY > 10
      ? '0 4px 20px rgba(26, 58, 92, 0.12)'
      : '0 2px 12px rgba(26, 58, 92, 0.07)';
  }, { passive: true });
})();

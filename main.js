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

/**
 * Contact form → Google Apps Script Web App
 * - 訪問者のGoogleログインは不要（Webアプリを「全員」公開 + 所有者実行）
 * - WebアプリURLは config.js（git管理外 / Secrets経由）から読み込む
 * - 二重送信防止 / 入力検証 / ハニーポット
 */
(function () {
  var form = document.getElementById('contactForm');
  if (!form) return;

  var GAS_ENDPOINT =
    (window.NSTYLE_CONFIG && window.NSTYLE_CONFIG.gasEndpoint) || '';

  var submitBtn = document.getElementById('contactSubmit');
  var statusEl = document.getElementById('formStatus');
  var pageLoadedAt = Date.now();
  var isSubmitting = false;

  function setStatus(type, message) {
    if (!statusEl) return;
    statusEl.hidden = false;
    statusEl.className = 'form-status form-status--' + type;
    statusEl.textContent = message;
  }

  function clearStatus() {
    if (!statusEl) return;
    statusEl.hidden = true;
    statusEl.textContent = '';
    statusEl.className = 'form-status';
  }

  function getConcerns() {
    return Array.prototype.slice
      .call(form.querySelectorAll('input[name="concern"]:checked'))
      .map(function (el) { return el.value; })
      .join('、');
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function isValidPhone(phone) {
    var digits = String(phone).replace(/[^\d]/g, '');
    return digits.length >= 10 && digits.length <= 15;
  }

  function validateClient(payload) {
    if (!payload.name || payload.name.length > 80) {
      return 'お名前を正しく入力してください。';
    }
    if (!isValidEmail(payload.email)) {
      return 'メールアドレスの形式が正しくありません。';
    }
    if (!isValidPhone(payload.phone)) {
      return '電話番号は10桁以上で入力してください。';
    }
    if (!payload.grade) {
      return 'お子さんの学年を選択してください。';
    }
    if (!payload.service) {
      return 'ご希望の内容を選択してください。';
    }
    if (!payload.privacy) {
      return 'プライバシーポリシーへの同意が必要です。';
    }
    if (payload.message && payload.message.length > 2000) {
      return 'メッセージは2000文字以内で入力してください。';
    }
    return '';
  }

  function setSubmitting(on) {
    isSubmitting = on;
    if (!submitBtn) return;
    submitBtn.disabled = on;
    submitBtn.textContent = on ? '送信中…' : '相談内容を送る';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearStatus();

    if (isSubmitting) return;

    if (!GAS_ENDPOINT || GAS_ENDPOINT.indexOf('https://script.google.com/') !== 0) {
      setStatus('error', '送信先が未設定です。管理者にお問い合わせください。');
      return;
    }

    var payload = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      phone: form.phone.value.trim(),
      grade: form.grade.value,
      service: form.service ? form.service.value : '',
      concern: getConcerns(),
      message: form.message.value.trim(),
      privacy: !!(form.privacy && form.privacy.checked),
      website: form.website ? form.website.value : '', // honeypot
      elapsedMs: Date.now() - pageLoadedAt
    };

    var clientError = validateClient(payload);
    if (clientError) {
      setStatus('error', clientError);
      return;
    }

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    setSubmitting(true);
    setStatus('loading', '送信しています。しばらくお待ちください。');

    fetch(GAS_ENDPOINT, {
      method: 'POST',
      mode: 'cors',
      redirect: 'follow',
      headers: {
        // text/plain にするとプリフライトを避けやすく、GAS Webアプリとの相性が良い
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        return res.text().then(function (text) {
          var data = null;
          try {
            data = JSON.parse(text);
          } catch (err) {
            throw new Error('invalid response');
          }
          return data;
        });
      })
      .then(function (data) {
        if (data && data.status === 'success') {
          var detail = '';
          if (data.sheetName || data.savedRow) {
            detail =
              '（保存先: ' +
              (data.sheetName || 'お問い合わせ') +
              (data.savedRow ? ' の ' + data.savedRow + '行目' : '') +
              '）';
          }
          if (data.spreadsheetUrl) {
            console.log('[N.style] saved to', data.spreadsheetName, data.spreadsheetUrl, detail);
          }
          setStatus(
            'success',
            'お問い合わせありがとうございます。内容を確認のうえ、24時間以内にご返信いたします。' + detail
          );
          form.reset();
          pageLoadedAt = Date.now();
          return;
        }
        throw new Error((data && data.message) || '送信に失敗しました。');
      })
      .catch(function (err) {
        var raw = (err && err.message) ? err.message : '';
        var isTech =
          !raw ||
          raw === 'invalid response' ||
          raw === '送信に失敗しました。' ||
          /Failed to fetch|NetworkError|Load failed/i.test(raw);
        setStatus(
          'error',
          isTech
            ? '送信に失敗しました。時間をおいて再度お試しいただくか、お電話（089-993-6256）でご連絡ください。'
            : raw
        );
      })
      .finally(function () {
        setSubmitting(false);
      });
  });
})();

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

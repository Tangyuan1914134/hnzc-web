(() => {
  'use strict';

  const body = document.body;
  const root = document.documentElement;
  const header = document.querySelector('[data-header]');
  const navToggle = document.querySelector('[data-nav-toggle]');
  const navMenu = document.querySelector('[data-nav-menu]');
  const currentPage = body.dataset.page || '';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const inEditorFrame = window.top !== window.self;

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute('content', '#f2eee5');

  const closeNavigation = () => {
    if (!navToggle || !navMenu) return;
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-label', '打开导航');
    navMenu.classList.remove('is-open');
    body.classList.remove('nav-open');
  };

  if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
      const willOpen = navToggle.getAttribute('aria-expanded') !== 'true';
      navToggle.setAttribute('aria-expanded', String(willOpen));
      navToggle.setAttribute('aria-label', willOpen ? '关闭导航' : '打开导航');
      navMenu.classList.toggle('is-open', willOpen);
      body.classList.toggle('nav-open', willOpen);
    });

    navMenu.addEventListener('click', (event) => {
      if (event.target.closest('a')) closeNavigation();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeNavigation();
    });

    document.addEventListener('click', (event) => {
      if (!body.classList.contains('nav-open')) return;
      if (event.target.closest('[data-nav-menu], [data-nav-toggle]')) return;
      closeNavigation();
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 860) closeNavigation();
    });
  }

  document.querySelectorAll('[data-nav]').forEach((link) => {
    if (link.dataset.nav === currentPage) {
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'page');
    }
  });

  let scrollFrame = 0;
  const updateScrollState = () => {
    scrollFrame = 0;
    const maxScroll = Math.max(1, root.scrollHeight - window.innerHeight);
    const progress = Math.min(100, Math.max(0, (window.scrollY / maxScroll) * 100));
    root.style.setProperty('--scroll-progress', `${progress}%`);
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 12);
  };

  const requestScrollUpdate = () => {
    if (scrollFrame) return;
    scrollFrame = window.requestAnimationFrame(updateScrollState);
  };

  updateScrollState();
  window.addEventListener('scroll', requestScrollUpdate, { passive: true });
  window.addEventListener('resize', requestScrollUpdate, { passive: true });

  document.querySelectorAll('[data-current-year]').forEach((element) => {
    element.textContent = String(new Date().getFullYear());
  });

  const revealElements = [...document.querySelectorAll('.reveal')];
  if (inEditorFrame || reducedMotion || !('IntersectionObserver' in window)) {
    revealElements.forEach((element) => element.classList.add('in-view'));
  } else {
    root.classList.add('reveal-ready');
    const observer = new IntersectionObserver(
      (entries, currentObserver) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('in-view');
          currentObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -6% 0px' }
    );
    revealElements.forEach((element) => observer.observe(element));
  }

  const parallax = document.querySelector('[data-parallax]');
  if (parallax && !reducedMotion && window.matchMedia('(pointer: fine)').matches) {
    const onPointerMove = (event) => {
      const rect = parallax.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width - 0.5) * 14;
      const y = ((event.clientY - rect.top) / rect.height - 0.5) * 14;
      parallax.style.setProperty('--primary-x', `${x * 0.45}px`);
      parallax.style.setProperty('--primary-y', `${y * 0.45}px`);
      parallax.style.setProperty('--float-x', `${x * -0.7}px`);
      parallax.style.setProperty('--float-y', `${y * -0.7}px`);
    };
    const resetPointer = () => {
      parallax.style.setProperty('--primary-x', '0px');
      parallax.style.setProperty('--primary-y', '0px');
      parallax.style.setProperty('--float-x', '0px');
      parallax.style.setProperty('--float-y', '0px');
    };
    parallax.addEventListener('pointermove', onPointerMove);
    parallax.addEventListener('pointerleave', resetPointer);
    parallax.addEventListener('pointercancel', resetPointer);
  }

  const filterContainer = document.querySelector('[data-case-filters]');
  const caseGrid = document.querySelector('[data-case-grid]');
  const emptyState = document.querySelector('[data-case-empty]');

  if (filterContainer && caseGrid) {
    const cards = [...caseGrid.querySelectorAll('[data-category]')];
    filterContainer.addEventListener('click', (event) => {
      const button = event.target.closest('[data-filter]');
      if (!button) return;
      const filter = button.dataset.filter;

      filterContainer.querySelectorAll('[data-filter]').forEach((item) => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', String(active));
      });

      let visibleCount = 0;
      cards.forEach((card) => {
        const visible = filter === 'all' || card.dataset.category === filter;
        card.classList.toggle('is-filtered-out', !visible);
        if (visible) visibleCount += 1;
      });
      if (emptyState) emptyState.hidden = visibleCount !== 0;
      requestScrollUpdate();
    });
  }

  document.querySelectorAll('.faq-list details').forEach((details) => {
    details.addEventListener('toggle', () => {
      if (!details.open) return;
      const group = details.closest('.faq-list');
      group?.querySelectorAll('details[open]').forEach((item) => {
        if (item !== details) item.open = false;
      });
      requestScrollUpdate();
    });
  });

  const form = document.querySelector('[data-consult-form]');
  if (form) {
    const status = form.querySelector('[data-form-status]');

    const setStatus = (message, type = '') => {
      if (!status) return;
      status.textContent = message;
      status.className = `form-status${type ? ` is-${type}` : ''}`;
    };

    const clearErrors = () => {
      form.querySelectorAll('.is-invalid').forEach((field) => field.classList.remove('is-invalid'));
      form.querySelectorAll('[data-error-for]').forEach((field) => {
        field.textContent = '';
      });
    };

    const validate = () => {
      clearErrors();
      const data = new FormData(form);
      const errors = {};
      const name = String(data.get('name') || '').trim();
      const phone = String(data.get('phone') || '').trim();
      const message = String(data.get('message') || '').trim();
      const digits = phone.replace(/\D/g, '');

      if (name.length < 2) errors.name = '请填写至少 2 个字符。';
      if (digits.length < 7 || digits.length > 15) errors.phone = '请填写有效联系电话。';
      if (message.length < 10) errors.message = '请至少填写 10 个字符，说明基本情况。';
      if (!data.get('consent')) errors.consent = '请先确认信息与服务边界。';

      Object.entries(errors).forEach(([key, messageText]) => {
        const field = form.elements.namedItem(key);
        if (field instanceof HTMLElement) field.classList.add('is-invalid');
        const errorField = form.querySelector(`[data-error-for="${key}"]`);
        if (errorField) errorField.textContent = messageText;
      });

      if (errors.consent) setStatus(errors.consent, 'error');
      return { valid: Object.keys(errors).length === 0, data };
    };

    const buildSummary = (data) => {
      const value = (key, fallback = '未填写') => String(data.get(key) || '').trim() || fallback;
      return [
        '河南紫宸融资咨询需求',
        '',
        `姓名：${value('name')}`,
        `联系电话：${value('phone')}`,
        `企业或门店：${value('company')}`,
        `需求类型：${value('type')}`,
        '',
        '资金用途与经营情况：',
        value('message'),
        '',
        '提示：本摘要仅用于需求沟通，不代表额度、利率或审批结果承诺。',
      ].join('\n');
    };

    const copyText = async (text) => {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
      }
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      if (!copied) throw new Error('copy failed');
    };

    const copySummary = async () => {
      const result = validate();
      if (!result.valid) {
        setStatus('请先补全必填信息。', 'error');
        form.querySelector('.is-invalid')?.focus();
        return;
      }
      try {
        await copyText(buildSummary(result.data));
        setStatus('需求摘要已生成并复制到剪贴板。请通过核验后的企业联系方式发送。', 'success');
      } catch {
        setStatus('复制失败，请手动选择并复制表单内容。', 'error');
      }
    };

    form.addEventListener('input', (event) => {
      const field = event.target;
      if (!(field instanceof HTMLElement)) return;
      field.classList.remove('is-invalid');
      const errorField = field.getAttribute('name')
        ? form.querySelector(`[data-error-for="${field.getAttribute('name')}"]`)
        : null;
      if (errorField) errorField.textContent = '';
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      copySummary();
    });
  }
})();

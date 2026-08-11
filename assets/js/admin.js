(() => {
  'use strict';

  const STORE_KEY = 'zichen-site-content-v2';
  const PASSWORD_KEY = 'zichen-admin-password-v2';
  const AUTH_KEY = 'zichen-site-admin-auth-v2';
  const PAGE_MAP = {
    home: { file: 'index.html', label: '首页' },
    about: { file: 'about.html', label: '公司介绍' },
    services: { file: 'services.html', label: '业务服务' },
    cases: { file: 'cases.html', label: '场景参考' },
    contact: { file: 'contact.html', label: '联系我们' },
  };
  const MAX_IMPORT_BYTES = 1024 * 1024;
  const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
  const targetOrigin = window.location.origin === 'null' ? '*' : window.location.origin;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const loginView = $('[data-login-view]');
  const appView = $('[data-admin-app]');
  const loginForm = $('[data-login-form]');
  const loginTitle = $('[data-login-title]');
  const loginHint = $('[data-login-hint]');
  const passwordInput = $('[data-password-input]');
  const loginError = $('[data-login-error]');
  const previewFrame = $('[data-preview-frame]');
  const editorNote = $('[data-editor-note]');
  const currentPageLabel = $('[data-current-page-label]');
  const previewUrl = $('[data-preview-url]');
  const dirtyBadge = $('[data-dirty-badge]');
  const selectedLabel = $('[data-selected-label]');
  const selectedType = $('[data-selected-type]');
  const textEditor = $('[data-text-editor]');
  const repeatButtons = $$('[data-duplicate-button], [data-delete-button], [data-move-up-button], [data-move-down-button]');

  let currentPage = 'home';
  let selected = null;
  let dirty = false;
  let requestSequence = 0;
  let textTimer = 0;
  const pending = new Map();

  const digest = async (value) => {
    if (globalThis.crypto?.subtle) {
      const bytes = new TextEncoder().encode(value);
      const hash = await crypto.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    }

    // file:// and a few restricted browser contexts do not expose SubtleCrypto.
    // Use a deterministic local fallback so the editor remains usable offline.
    let first = 0x811c9dc5;
    let second = 0x9e3779b9;
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      first = Math.imul(first ^ code, 0x01000193) >>> 0;
      second = Math.imul(second ^ (code + index), 0x85ebca6b) >>> 0;
    }
    return `local-${first.toString(16).padStart(8, '0')}${second.toString(16).padStart(8, '0')}`;
  };

  const hasPassword = () => Boolean(localStorage.getItem(PASSWORD_KEY));

  const updateLoginCopy = () => {
    if (hasPassword()) {
      loginTitle.textContent = '进入本地编辑器';
      loginHint.textContent = '输入当前浏览器中设置的本机密码。内容和密码均不会发送到服务器。';
      passwordInput.autocomplete = 'current-password';
    } else {
      loginTitle.textContent = '设置本机编辑密码';
      loginHint.textContent = '首次使用请设置至少 6 位密码。密码仅保存在当前浏览器，用于保护本机编辑入口。';
      passwordInput.autocomplete = 'new-password';
    }
  };

  const loadStore = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || '{"version":2,"pages":{}}');
      if (!parsed || typeof parsed !== 'object') throw new Error('invalid');
      if (!parsed.pages || typeof parsed.pages !== 'object') parsed.pages = {};
      return { version: 2, pages: parsed.pages };
    } catch {
      return { version: 2, pages: {} };
    }
  };

  const saveStore = (store) => {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  };

  const setNote = (message) => {
    editorNote.textContent = message;
  };

  const setDirty = (value) => {
    dirty = Boolean(value);
    dirtyBadge.hidden = !dirty;
  };

  const showApp = () => {
    loginView.hidden = true;
    appView.hidden = false;
    loadPage(currentPage);
  };

  const postToPreview = (message) => {
    previewFrame?.contentWindow?.postMessage(message, targetOrigin);
  };

  const validPreviewMessage = (event) => {
    if (event.source !== previewFrame?.contentWindow) return false;
    if (window.location.origin === 'null') return event.origin === 'null';
    return event.origin === window.location.origin;
  };

  const updateInspector = () => {
    if (!selected) {
      selectedLabel.textContent = '未选择元素';
      selectedType.textContent = '点击预览中的文字或卡片';
      textEditor.value = '';
      textEditor.disabled = true;
      repeatButtons.forEach((button) => { button.disabled = true; });
      return;
    }

    const labels = { h1: '一级标题', h2: '标题', h3: '小标题', h4: '小标题', p: '段落', a: '链接文字', span: '短文本', strong: '强调文字', small: '辅助文字', li: '列表文字', summary: '问答标题', button: '按钮文字', img: '图片' };
    selectedLabel.textContent = labels[selected.tag] || selected.tag || '页面元素';
    selectedType.textContent = selected.image ? '图片元素' : selected.repeat ? '列表项内元素' : '普通内容';
    textEditor.disabled = !selected.editable || selected.image;
    textEditor.value = selected.editable && !selected.image ? selected.text || '' : '';
    textEditor.placeholder = selected.image ? '请使用顶部按钮更换图片' : selected.editable ? '在此修改文字内容' : '请选择具体文字后编辑';
    repeatButtons.forEach((button) => { button.disabled = !selected.repeat; });
  };

  const sendRequest = (type, payload = {}) => new Promise((resolve, reject) => {
    const id = `request-${Date.now()}-${requestSequence++}`;
    const timer = window.setTimeout(() => {
      pending.delete(id);
      reject(new Error('preview timeout'));
    }, 4500);
    pending.set(id, { resolve, reject, timer });
    postToPreview({ source: 'admin', id, type, payload });
  });

  const loadPage = (page) => {
    if (!PAGE_MAP[page]) return;
    currentPage = page;
    selected = null;
    setDirty(false);
    updateInspector();
    $$('[data-page-target]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.pageTarget === page);
    });
    currentPageLabel.textContent = PAGE_MAP[page].label;
    previewUrl.textContent = PAGE_MAP[page].file;
    setNote('正在加载页面预览…');
    previewFrame.src = `${PAGE_MAP[page].file}#adminPreview`;
    appView.classList.remove('sidebar-open');
  };

  const sanitizeSection = (html, selector) => {
    if (typeof html !== 'string' || html.length > 800_000) return '';
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const section = parsed.querySelector(selector);
    if (!section) return '';
    section.querySelectorAll('script, iframe, object, embed, link, meta, base').forEach((node) => node.remove());
    section.querySelectorAll('*').forEach((node) => {
      [...node.attributes].forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim().toLowerCase();
        if (name.startsWith('on') || ((name === 'href' || name === 'src') && value.startsWith('javascript:'))) {
          node.removeAttribute(attribute.name);
        }
      });
    });
    return section.outerHTML;
  };

  const normalizeImport = (value) => {
    if (!value || typeof value !== 'object' || !value.pages || typeof value.pages !== 'object') throw new Error('invalid schema');
    const clean = { version: 2, pages: {} };
    Object.keys(PAGE_MAP).forEach((page) => {
      const source = value.pages[page];
      if (!source || typeof source !== 'object') return;
      const mainHtml = sanitizeSection(source.mainHtml, 'main');
      const footerHtml = sanitizeSection(source.footerHtml, 'footer');
      if (mainHtml || footerHtml) clean.pages[page] = { mainHtml, footerHtml };
    });
    return clean;
  };

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(loadStore(), null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `zichen-content-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNote('配置文件已导出。');
  };

  const importJson = async (file) => {
    if (!file || file.size > MAX_IMPORT_BYTES) {
      setNote('导入失败：文件不存在或超过 1 MB。');
      return;
    }
    try {
      const parsed = JSON.parse(await file.text());
      const clean = normalizeImport(parsed);
      saveStore(clean);
      loadPage(currentPage);
      setNote('配置已安全导入。');
    } catch {
      setNote('导入失败：文件结构不正确。');
    }
  };

  const validImageSource = (source) => {
    const value = String(source || '').trim();
    if (!value) return false;
    if (/^data:image\//i.test(value)) return true;
    if (/^https?:\/\//i.test(value)) return true;
    return /^(\.\.?\/|assets\/|\/)[^\s]+$/i.test(value);
  };

  const sendImage = (source) => {
    if (!selected?.seid) {
      setNote('请先在预览中选择一个图片或卡片。');
      return;
    }
    if (!validImageSource(source)) {
      setNote('图片地址无效，仅支持 http(s)、data:image 或站内相对路径。');
      return;
    }
    postToPreview({ source: 'admin', type: 'insert-image', payload: { seid: selected.seid, src: String(source).trim() } });
  };

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginError.textContent = '';
    const password = passwordInput.value;
    if (password.length < 6) {
      loginError.textContent = '密码至少需要 6 位。';
      return;
    }

    try {
      const hash = await digest(password);
      const existing = localStorage.getItem(PASSWORD_KEY);
      if (!existing) {
        localStorage.setItem(PASSWORD_KEY, hash);
      } else if (hash !== existing) {
        loginError.textContent = '密码不正确。';
        return;
      }
      sessionStorage.setItem(AUTH_KEY, 'true');
      passwordInput.value = '';
      showApp();
    } catch {
      loginError.textContent = '当前浏览器无法完成本机密码校验。';
    }
  });

  window.addEventListener('message', (event) => {
    if (!validPreviewMessage(event)) return;
    const data = event.data || {};
    if (data.source !== 'site-editor') return;

    if (data.replyTo && pending.has(data.replyTo)) {
      const item = pending.get(data.replyTo);
      clearTimeout(item.timer);
      pending.delete(data.replyTo);
      item.resolve(data.payload || {});
      return;
    }

    if (data.type === 'ready') {
      setNote('预览已就绪。点击页面中的文字、卡片或图片开始编辑。');
      return;
    }

    if (data.type === 'selected') {
      selected = data.payload || null;
      updateInspector();
      return;
    }

    if (data.type === 'info') {
      if (data.payload?.message) setNote(data.payload.message);
      if (data.payload?.dirty) setDirty(true);
    }
  });

  previewFrame.addEventListener('load', () => {
    window.setTimeout(() => postToPreview({ source: 'admin', type: 'handshake' }), 100);
  });

  $$('[data-page-target]').forEach((button) => {
    button.addEventListener('click', () => {
      if (dirty && !window.confirm('当前页面有未保存修改，确认切换页面吗？')) return;
      loadPage(button.dataset.pageTarget);
    });
  });

  textEditor.addEventListener('input', () => {
    if (!selected?.editable || !selected.seid || selected.image) return;
    setDirty(true);
    clearTimeout(textTimer);
    textTimer = window.setTimeout(() => {
      postToPreview({ source: 'admin', type: 'set-text', payload: { seid: selected.seid, text: textEditor.value } });
    }, 70);
  });

  $('[data-save-button]').addEventListener('click', async () => {
    try {
      const payload = await sendRequest('get-html');
      if (!payload.mainHtml || !payload.footerHtml) throw new Error('empty payload');
      const store = loadStore();
      store.pages[currentPage] = { mainHtml: payload.mainHtml, footerHtml: payload.footerHtml };
      saveStore(store);
      setDirty(false);
      setNote('当前页面已保存到本浏览器。');
    } catch (error) {
      const quota = error?.name === 'QuotaExceededError';
      setNote(quota ? '保存失败：浏览器存储空间不足，请减少图片大小。' : '保存失败：无法读取当前预览。');
    }
  });

  $('[data-reset-page-button]').addEventListener('click', () => {
    if (!window.confirm(`确认恢复“${PAGE_MAP[currentPage].label}”的默认内容吗？`)) return;
    const store = loadStore();
    delete store.pages[currentPage];
    saveStore(store);
    loadPage(currentPage);
    setNote('当前页面已恢复默认内容。');
  });

  $('[data-reset-all-button]').addEventListener('click', () => {
    if (!window.confirm('确认清除全部页面的本地修改吗？此操作不可撤销。')) return;
    localStorage.removeItem(STORE_KEY);
    loadPage(currentPage);
    setNote('全站本地修改已清除。');
  });

  $('[data-export-button]').addEventListener('click', downloadJson);
  $('[data-import-button]').addEventListener('click', () => $('[data-import-input]').click());
  $('[data-import-input]').addEventListener('change', (event) => {
    const [file] = event.target.files;
    importJson(file);
    event.target.value = '';
  });

  const repeatAction = (action) => {
    if (!selected?.repeat || !selected.seid) {
      setNote('请先选择一个列表卡片或列表项。');
      return;
    }
    postToPreview({ source: 'admin', type: 'repeat-action', payload: { seid: selected.seid, action } });
  };

  $('[data-duplicate-button]').addEventListener('click', () => repeatAction('duplicate'));
  $('[data-delete-button]').addEventListener('click', () => repeatAction('delete'));
  $('[data-move-up-button]').addEventListener('click', () => repeatAction('up'));
  $('[data-move-down-button]').addEventListener('click', () => repeatAction('down'));

  $('[data-image-url-button]').addEventListener('click', () => {
    const source = window.prompt('请输入图片 URL 或站内相对路径');
    if (source !== null) sendImage(source);
  });

  $('[data-image-upload-button]').addEventListener('click', () => $('[data-image-upload-input]').click());
  $('[data-image-upload-input]').addEventListener('change', (event) => {
    const [file] = event.target.files;
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setNote('上传失败：请选择图片文件。');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setNote('上传失败：图片不能超过 1.5 MB。');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => sendImage(reader.result);
    reader.onerror = () => setNote('图片读取失败。');
    reader.readAsDataURL(file);
  });

  $('[data-logout-button]').addEventListener('click', () => {
    sessionStorage.removeItem(AUTH_KEY);
    location.reload();
  });

  $('[data-sidebar-toggle]').addEventListener('click', () => appView.classList.add('sidebar-open'));
  $('[data-sidebar-close]').addEventListener('click', () => appView.classList.remove('sidebar-open'));
  $('[data-sidebar-backdrop]').addEventListener('click', () => appView.classList.remove('sidebar-open'));

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && !appView.hidden) {
      event.preventDefault();
      $('[data-save-button]').click();
    }
  });

  window.addEventListener('beforeunload', (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  updateLoginCopy();
  updateInspector();
  if (sessionStorage.getItem(AUTH_KEY) === 'true' && hasPassword()) showApp();
})();

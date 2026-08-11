(() => {
  'use strict';

  const STORAGE_KEY = 'zichen-site-content-v2';
  const page = document.body.dataset.page;
  const isAdminPreview = window.location.hash.startsWith('#adminPreview');
  const parentOrigin = window.location.origin === 'null' ? '*' : window.location.origin;

  const loadStore = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"version":2,"pages":{}}');
      if (!parsed || typeof parsed !== 'object') return { version: 2, pages: {} };
      if (!parsed.pages || typeof parsed.pages !== 'object') parsed.pages = {};
      return parsed;
    } catch {
      return { version: 2, pages: {} };
    }
  };

  const replaceSection = (selector, html) => {
    if (typeof html !== 'string' || !html.trim()) return;
    const parser = new DOMParser();
    const parsed = parser.parseFromString(html, 'text/html');
    const incoming = parsed.querySelector(selector);
    const current = document.querySelector(selector);
    if (incoming && current) current.replaceWith(incoming);
  };

  const applySavedContent = () => {
    if (!page) return;
    const saved = loadStore().pages?.[page];
    if (!saved) return;
    replaceSection('main', saved.mainHtml);
    replaceSection('footer', saved.footerHtml);
  };

  applySavedContent();
  if (!isAdminPreview) return;

  const editableSelector = [
    'main h1', 'main h2', 'main h3', 'main h4', 'main p', 'main span', 'main strong',
    'main small', 'main a', 'main li', 'main dt', 'main dd', 'main summary', 'main button',
    'footer p', 'footer a', 'footer h2', 'footer h3', 'footer h4', 'footer span', 'footer strong', 'footer small',
  ].join(',');

  const selectableSelector = `${editableSelector}, [data-repeat-item], img`;

  const post = (message) => {
    window.parent.postMessage(message, parentOrigin);
  };

  const allowedMessage = (event) => {
    if (event.source !== window.parent) return false;
    if (window.location.origin === 'null') return event.origin === 'null';
    return event.origin === window.location.origin;
  };

  const getDirectText = (node) => {
    const direct = [...node.childNodes]
      .filter((child) => child.nodeType === Node.TEXT_NODE)
      .map((child) => child.textContent)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    return direct || (node.textContent || '').replace(/\s+/g, ' ').trim();
  };

  const setDirectText = (node, text) => {
    const textNodes = [...node.childNodes].filter((child) => child.nodeType === Node.TEXT_NODE);
    if (!node.children.length) {
      node.textContent = text;
      return;
    }

    if (textNodes.length) {
      textNodes[0].textContent = `${text} `;
      textNodes.slice(1).forEach((child) => child.remove());
      return;
    }

    node.insertBefore(document.createTextNode(`${text} `), node.firstChild);
  };

  const assignSeids = () => {
    let index = 0;
    document.querySelectorAll('[data-seid]').forEach((node) => node.removeAttribute('data-seid'));

    document.querySelectorAll(selectableSelector).forEach((node) => {
      if (node.closest('.site-header, script, style')) return;
      if (node.closest('.site-nav')) return;
      node.dataset.seid = `se-${page || 'page'}-${index++}`;
    });

    document.querySelectorAll('[data-repeat-item]').forEach((node) => {
      node.dataset.repeatItem = 'true';
    });

    document.querySelectorAll('img').forEach((node) => {
      node.dataset.imageItem = 'true';
    });
  };

  const makeEditable = () => {
    document.querySelectorAll(editableSelector).forEach((node) => {
      if (node.closest('.site-header, script, style, .site-nav')) return;
      node.dataset.adminEditable = 'true';
    });
  };

  const payloadFor = (node) => {
    if (!node) return null;
    const repeatItem = node.matches('[data-repeat-item]') ? node : node.closest('[data-repeat-item]');
    return {
      seid: node.dataset.seid || '',
      tag: node.tagName.toLowerCase(),
      text: node.dataset.adminEditable === 'true' ? getDirectText(node) : '',
      editable: node.dataset.adminEditable === 'true',
      repeat: Boolean(repeatItem),
      image: node.tagName.toLowerCase() === 'img',
    };
  };

  const clearSelection = () => {
    document.querySelectorAll('.admin-preview-selected').forEach((node) => {
      node.classList.remove('admin-preview-selected');
    });
  };

  const selectNode = (node, notify = true) => {
    clearSelection();
    if (node) node.classList.add('admin-preview-selected');
    if (notify) post({ source: 'site-editor', type: 'selected', payload: payloadFor(node) });
  };

  const findBySeid = (seid) => {
    if (!seid) return null;
    const escaped = window.CSS?.escape ? CSS.escape(seid) : seid.replace(/[^a-zA-Z0-9_-]/g, '');
    return document.querySelector(`[data-seid="${escaped}"]`);
  };

  const cleanClone = (selector) => {
    const source = document.querySelector(selector);
    if (!source) return '';
    const clone = source.cloneNode(true);
    clone.classList.remove('admin-preview-selected');
    clone.querySelectorAll('*').forEach((node) => {
      node.classList.remove('admin-preview-selected');
      node.removeAttribute('data-seid');
      node.removeAttribute('data-admin-editable');
      node.removeAttribute('data-image-item');
    });
    clone.removeAttribute('data-seid');
    clone.removeAttribute('data-admin-editable');
    return clone.outerHTML;
  };

  const insertImage = (target, src) => {
    if (!target || typeof src !== 'string' || !src.trim()) return false;
    if (target.tagName.toLowerCase() === 'img') {
      target.src = src;
      return true;
    }

    const existing = target.querySelector('img');
    if (existing) {
      existing.src = src;
      return true;
    }

    const image = document.createElement('img');
    image.src = src;
    image.alt = '内容图片';
    image.loading = 'lazy';
    image.style.cssText = 'display:block;width:100%;height:auto;margin-top:16px;border-radius:18px;object-fit:cover;';
    target.appendChild(image);
    assignSeids();
    return true;
  };

  const handleRepeatAction = (target, action) => {
    const item = target?.matches('[data-repeat-item]') ? target : target?.closest('[data-repeat-item]');
    if (!item || !item.parentElement) return { ok: false, selected: null };
    const parent = item.parentElement;

    if (action === 'duplicate') {
      const copy = item.cloneNode(true);
      copy.querySelectorAll('[data-seid]').forEach((node) => node.removeAttribute('data-seid'));
      copy.removeAttribute('data-seid');
      item.after(copy);
      makeEditable();
      assignSeids();
      return { ok: true, selected: copy };
    }

    if (action === 'delete') {
      const items = [...parent.children].filter((child) => child.matches('[data-repeat-item]'));
      if (items.length <= 1) return { ok: false, selected: item };
      item.remove();
      assignSeids();
      return { ok: true, selected: null };
    }

    if (action === 'up') {
      const previous = item.previousElementSibling;
      if (!previous) return { ok: false, selected: item };
      parent.insertBefore(item, previous);
      assignSeids();
      return { ok: true, selected: item };
    }

    if (action === 'down') {
      const next = item.nextElementSibling;
      if (!next) return { ok: false, selected: item };
      parent.insertBefore(next, item);
      assignSeids();
      return { ok: true, selected: item };
    }

    return { ok: false, selected: item };
  };

  const previewStyle = document.createElement('style');
  previewStyle.textContent = `
    [data-admin-editable="true"], [data-repeat-item], img[data-image-item="true"] {
      cursor: pointer;
      outline: 1px dashed transparent;
      outline-offset: 3px;
    }
    [data-admin-editable="true"]:hover, [data-repeat-item]:hover, img[data-image-item="true"]:hover {
      outline-color: rgba(11, 87, 208, .48);
    }
    .admin-preview-selected {
      outline: 2px solid #0b57d0 !important;
      outline-offset: 4px !important;
      box-shadow: 0 0 0 5px rgba(11, 87, 208, .12) !important;
    }
  `;
  document.head.appendChild(previewStyle);

  makeEditable();
  assignSeids();

  document.addEventListener(
    'click',
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      const origin = event.target instanceof Element ? event.target : event.target.parentElement;
      if (!origin) return;
      const editable = origin.closest('[data-admin-editable="true"]');
      const image = origin.closest('img[data-image-item="true"]');
      const repeat = origin.closest('[data-repeat-item]');
      selectNode(editable || image || repeat || null);
    },
    true
  );

  document.addEventListener('submit', (event) => event.preventDefault(), true);

  window.addEventListener('message', (event) => {
    if (!allowedMessage(event)) return;
    const data = event.data || {};
    if (data.source !== 'admin') return;

    if (data.type === 'handshake') {
      post({ source: 'site-editor', type: 'ready', payload: { page } });
      return;
    }

    if (data.type === 'set-text') {
      const target = findBySeid(data.payload?.seid);
      if (!target || target.dataset.adminEditable !== 'true') return;
      setDirectText(target, String(data.payload?.text ?? ''));
      selectNode(target);
      return;
    }

    if (data.type === 'insert-image') {
      const target = findBySeid(data.payload?.seid);
      const ok = insertImage(target, data.payload?.src);
      post({
        source: 'site-editor',
        type: 'info',
        payload: { message: ok ? '图片已更新。' : '图片更新失败，请重新选择元素。', dirty: ok },
      });
      if (ok) selectNode(target);
      return;
    }

    if (data.type === 'repeat-action') {
      const target = findBySeid(data.payload?.seid);
      const result = handleRepeatAction(target, data.payload?.action);
      selectNode(result.selected);
      post({
        source: 'site-editor',
        type: 'info',
        payload: {
          message: result.ok ? '列表操作已完成。' : '无法执行该操作，请检查当前选择或列表边界。',
          dirty: result.ok,
        },
      });
      return;
    }

    if (data.type === 'get-html') {
      post({
        source: 'site-editor',
        replyTo: data.id,
        payload: { mainHtml: cleanClone('main'), footerHtml: cleanClone('footer') },
      });
    }
  });

  post({ source: 'site-editor', type: 'ready', payload: { page } });
})();

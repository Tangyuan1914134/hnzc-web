(() => {
  const STORAGE_KEY = 'zichen-site-content-v1';
  const isAdminPreview = window.location.hash.startsWith('#adminPreview');
  const page = document.body.dataset.page;

  function loadStore() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function applySavedContent() {
    if (!page) return;
    const store = loadStore();
    const pageData = store.pages && store.pages[page];
    if (!pageData) return;

    if (pageData.mainHtml) {
      const currentMain = document.querySelector('main');
      if (currentMain) currentMain.outerHTML = pageData.mainHtml;
    }

    if (pageData.footerHtml) {
      const currentFooter = document.querySelector('footer');
      if (currentFooter) currentFooter.outerHTML = pageData.footerHtml;
    }
  }

  function assignSeid() {
    let index = 0;
    document
      .querySelectorAll('main h1, main h2, main h3, main h4, main p, main span, main strong, main small, main a, main li, footer p, footer a, footer h3, footer h4')
      .forEach((node) => {
        if (node.closest('.site-header, script, style')) return;
        if (node.closest('.site-nav')) return;
        if (!node.dataset.seid) {
          node.dataset.seid = `se-${page}-${index++}`;
        }
      });

    document.querySelectorAll('[data-repeat-item]').forEach((node) => {
      if (!node.dataset.seid) {
        node.dataset.seid = `ri-${page}-${index++}`;
      }
      node.dataset.repeatItem = 'true';
    });

    document.querySelectorAll('img').forEach((img) => {
      if (!img.dataset.seid) {
        img.dataset.seid = `im-${page}-${index++}`;
      }
      img.dataset.imageItem = 'true';
    });
  }

  function getSelectedPayload(node) {
    if (!node) return null;
    return {
      seid: node.dataset.seid,
      tag: node.tagName.toLowerCase(),
      text: node.textContent ? node.textContent.trim() : '',
      editable: node.dataset.adminEditable === 'true',
      repeat: node.dataset.repeatItem === 'true' || !!node.closest('[data-repeat-item]'),
      image: node.tagName.toLowerCase() === 'img',
    };
  }

  function markSelected(node) {
    document
      .querySelectorAll('.admin-preview-selected')
      .forEach((element) => element.classList.remove('admin-preview-selected'));
    if (node) node.classList.add('admin-preview-selected');
  }

  function makeEditable() {
    const editableNodes = document.querySelectorAll(
      'main h1, main h2, main h3, main h4, main p, main span, main strong, main small, main a, main li, .form-note, footer p, footer a, footer h3, footer h4'
    );

    editableNodes.forEach((node) => {
      if (node.closest('.site-header, script, style')) return;
      if (node.closest('.site-nav')) return;
      node.dataset.adminEditable = 'true';
    });

    document.addEventListener(
      'click',
      (event) => {
        const target = event.target.nodeType === Node.TEXT_NODE ? event.target.parentElement : event.target;
        if (!target) return;

        const editable = target.closest('[data-admin-editable="true"]');
        const image = target.closest('img[data-image-item="true"]');
        const repeat = target.closest('[data-repeat-item]');

        if (editable) {
          markSelected(editable);
          window.parent.postMessage(
            {
              source: 'site-editor',
              type: 'selected',
              payload: getSelectedPayload(editable),
            },
            '*'
          );
          return;
        }

        if (image) {
          markSelected(image);
          window.parent.postMessage(
            {
              source: 'site-editor',
              type: 'selected',
              payload: getSelectedPayload(image),
            },
            '*'
          );
          return;
        }

        if (repeat) {
          markSelected(repeat);
          window.parent.postMessage(
            {
              source: 'site-editor',
              type: 'selected',
              payload: getSelectedPayload(repeat),
            },
            '*'
          );
          return;
        }

        markSelected(null);
        window.parent.postMessage(
          {
            source: 'site-editor',
            type: 'selected',
            payload: null,
          },
          '*'
        );
      },
      true
    );
  }

  function findBySeid(seid) {
    return document.querySelector(`[data-seid="${seid}"]`);
  }

  function insertImage(target, src) {
    if (!target || !src) return false;
    if (target.tagName.toLowerCase() === 'img') {
      target.src = src;
      return true;
    }

    const existing = target.querySelector('img');
    if (existing) {
      existing.src = src;
      return true;
    }

    const img = document.createElement('img');
    img.src = src;
    img.alt = '编辑插入图片';
    img.style.maxWidth = '100%';
    img.style.marginTop = '14px';
    img.style.borderRadius = '16px';
    target.appendChild(img);
    assignSeid();
    return true;
  }

  function handleRepeatAction(target, action) {
    const repeatItem = target.closest('[data-repeat-item]');
    if (!repeatItem) return false;
    const parent = repeatItem.parentElement;

    if (action === 'duplicate') {
      const copy = repeatItem.cloneNode(true);
      repeatItem.after(copy);
      assignSeid();
      return true;
    }

    if (action === 'delete') {
      const items = parent.querySelectorAll('[data-repeat-item]');
      if (items.length <= 1) return false;
      repeatItem.remove();
      assignSeid();
      return true;
    }

    if (action === 'up' && repeatItem.previousElementSibling) {
      parent.insertBefore(repeatItem, repeatItem.previousElementSibling);
      return true;
    }

    if (action === 'down' && repeatItem.nextElementSibling) {
      parent.insertBefore(repeatItem.nextElementSibling, repeatItem);
      return true;
    }

    return false;
  }

  function bindAdminChannel() {
    window.addEventListener('message', (event) => {
      const data = event.data || {};
      if (data.source !== 'admin') return;

      if (data.type === 'handshake') {
        window.parent.postMessage({ source: 'site-editor', type: 'ready' }, '*');
        return;
      }

      if (data.type === 'set-text') {
        const target = findBySeid(data.payload && data.payload.seid);
        if (target) {
          target.textContent = data.payload.text || '';
          markSelected(target);
          window.parent.postMessage(
            {
              source: 'site-editor',
              type: 'selected',
              payload: getSelectedPayload(target),
            },
            '*'
          );
        }
        return;
      }

      if (data.type === 'insert-image') {
        const target = findBySeid(data.payload && data.payload.seid);
        const ok = insertImage(target, data.payload && data.payload.src);
        window.parent.postMessage(
          {
            source: 'site-editor',
            type: 'info',
            payload: {
              message: ok ? '图片已插入。' : '图片插入失败，请重新选择元素。',
            },
          },
          '*'
        );
        return;
      }

      if (data.type === 'repeat-action') {
        const target = findBySeid(data.payload && data.payload.seid);
        const ok = handleRepeatAction(target, data.payload && data.payload.action);
        window.parent.postMessage(
          {
            source: 'site-editor',
            type: 'info',
            payload: {
              message: ok ? '列表项操作已完成。' : '列表项操作失败，请确认已选中有效项。',
            },
          },
          '*'
        );
        return;
      }

      if (data.type === 'get-html') {
        window.parent.postMessage(
          {
            source: 'site-editor',
            replyTo: data.id,
            payload: {
              mainHtml: document.querySelector('main').outerHTML,
              footerHtml: document.querySelector('footer').outerHTML,
            },
          },
          '*'
        );
      }
    });
  }

  applySavedContent();

  if (!isAdminPreview) return;

  const style = document.createElement('style');
  style.textContent = `
    [data-admin-editable="true"] {
      cursor: text;
      outline: 1px dashed transparent;
      outline-offset: 2px;
    }

    [data-admin-editable="true"]:hover {
      outline-color: rgba(201, 171, 118, 0.42);
      box-shadow: inset 0 0 0 1px rgba(201, 171, 118, 0.16);
    }

    .admin-preview-selected {
      outline: 2px solid rgba(201, 171, 118, 0.72) !important;
      outline-offset: 3px;
    }
  `;
  document.head.appendChild(style);

  makeEditable();
  assignSeid();
  bindAdminChannel();
})();

const STORE_KEY = 'zichen-site-content-v1';
const ADMIN_PASSWORD = 'hnzcAa334499';
const PAGE_MAP = {
  home: 'index.html',
  about: 'about.html',
  services: 'services.html',
  cases: 'cases.html',
  contact: 'contact.html',
};

const loginView = document.querySelector('[data-admin-login]');
const appView = document.querySelector('[data-admin-app]');
const passwordInput = document.querySelector('[data-admin-password]');
const passwordHint = document.querySelector('[data-password-hint]');
const loginButton = document.querySelector('[data-login-button]');
const loginError = document.querySelector('[data-login-error]');
const logoutButton = document.querySelector('[data-logout-button]');
const pageButtons = document.querySelectorAll('[data-page-target]');
const previewFrame = document.querySelector('[data-preview-frame]');
const selectedLabel = document.querySelector('[data-selected-label]');
const selectedType = document.querySelector('[data-selected-type]');
const textEditor = document.querySelector('[data-text-editor]');
const editorNote = document.querySelector('[data-editor-note]');
const saveButton = document.querySelector('[data-save-button]');
const resetPageButton = document.querySelector('[data-reset-page-button]');
const resetAllButton = document.querySelector('[data-reset-all-button]');
const exportButton = document.querySelector('[data-export-button]');
const importButton = document.querySelector('[data-import-button]');
const importInput = document.querySelector('[data-import-input]');
const duplicateButton = document.querySelector('[data-duplicate-button]');
const deleteButton = document.querySelector('[data-delete-button]');
const moveUpButton = document.querySelector('[data-move-up-button]');
const moveDownButton = document.querySelector('[data-move-down-button]');
const imageUrlButton = document.querySelector('[data-image-url-button]');
const imageUploadButton = document.querySelector('[data-image-upload-button]');
const imageUploadInput = document.querySelector('[data-image-upload-input]');

let currentPage = 'home';
let selected = null;
let requestId = 0;
const pendingRequests = new Map();

function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '{"pages":{}}');
  } catch {
    return { pages: {} };
  }
}

function saveStore(store) {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

function setPasswordHint() {
  passwordHint.textContent = '请输入管理员密码进入本地编辑后台。';
}

function showApp() {
  loginView.hidden = true;
  appView.hidden = false;
  loginView.style.display = 'none';
  appView.style.display = 'grid';
  loadPage(currentPage);
}

function postToPreview(message) {
  if (!previewFrame.contentWindow) return;
  previewFrame.contentWindow.postMessage(message, '*');
}

function updateSelectedInfo() {
  if (!selected) {
    selectedLabel.textContent = '未选中元素';
    selectedType.textContent = '点击右侧预览中的文字、卡片或图片后开始编辑';
    textEditor.value = '';
    textEditor.readOnly = false;
    textEditor.placeholder = '选中标题、正文或按钮后，可在这里直接修改文字';
    return;
  }

  selectedLabel.textContent = selected.tag;
  selectedType.textContent = selected.repeat
    ? '列表项'
    : selected.image
    ? '图片元素'
    : '普通内容';

  if (selected.image) {
    textEditor.value = '';
    textEditor.readOnly = true;
    textEditor.placeholder = '当前选中为图片，请使用上方图片按钮进行替换或插入';
    return;
  }

  if (!selected.editable) {
    textEditor.value = '';
    textEditor.readOnly = true;
    textEditor.placeholder = '当前选中为列表容器，请点击其中具体文字后再编辑';
    return;
  }

  textEditor.readOnly = false;
  textEditor.value = selected.text || '';
  textEditor.placeholder = '在此修改当前选中文字内容';
}

function sendRequest(type, payload = {}) {
  return new Promise((resolve, reject) => {
    const id = `req_${Date.now()}_${requestId++}`;
    const timer = window.setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error('timeout'));
    }, 2500);

    pendingRequests.set(id, { resolve, reject, timer });
    postToPreview({ source: 'admin', id, type, payload });
  });
}

function loadPage(page) {
  currentPage = page;
  selected = null;
  updateSelectedInfo();

  pageButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.pageTarget === page);
  });

  editorNote.textContent = '正在加载预览...';
  previewFrame.src = `${PAGE_MAP[page]}#adminPreview`;
}

function requireRepeatSelection() {
  if (!selected || !selected.repeat) {
    editorNote.textContent = '请先点击一个列表卡片或列表项。';
    return false;
  }
  return true;
}

function exportContent() {
  const store = loadStore();
  const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'zichen-site-content.json';
  link.click();
  URL.revokeObjectURL(url);
}

function importContent(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || typeof parsed !== 'object') throw new Error('invalid');
      saveStore(parsed);
      loadPage(currentPage);
      editorNote.textContent = '已导入内容配置。';
    } catch {
      editorNote.textContent = '导入失败：文件格式不正确。';
    }
  };
  reader.readAsText(file);
}

window.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.source !== 'site-editor') return;

  if (data.replyTo && pendingRequests.has(data.replyTo)) {
    const pending = pendingRequests.get(data.replyTo);
    window.clearTimeout(pending.timer);
    pendingRequests.delete(data.replyTo);
    pending.resolve(data.payload);
    return;
  }

  if (data.type === 'ready') {
    editorNote.textContent = '预览已加载。点击右侧页面中的文字即可直接编辑。';
    return;
  }

  if (data.type === 'selected') {
    selected = data.payload;
    updateSelectedInfo();
    return;
  }

  if (data.type === 'info') {
    editorNote.textContent = data.payload && data.payload.message
      ? data.payload.message
      : '操作已执行。';
  }
});

previewFrame.addEventListener('load', () => {
  window.setTimeout(() => {
    postToPreview({ source: 'admin', type: 'handshake' });
  }, 120);
});

loginButton.addEventListener('click', () => {
  const value = passwordInput.value.trim();
  if (!value) {
    loginError.textContent = '请输入管理员密码。';
    return;
  }

  if (value === ADMIN_PASSWORD) {
    sessionStorage.setItem('zichen-site-admin-auth', 'true');
    passwordInput.value = '';
    loginError.textContent = '';
    showApp();
    return;
  }

  loginError.textContent = '密码不正确，请重新输入。';
});

passwordInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    loginButton.click();
  }
});

logoutButton.addEventListener('click', () => {
  sessionStorage.removeItem('zichen-site-admin-auth');
  location.reload();
});

pageButtons.forEach((button) => {
  button.addEventListener('click', () => loadPage(button.dataset.pageTarget));
});

textEditor.addEventListener('input', () => {
  if (!selected || !selected.editable || !selected.seid) return;
  postToPreview({
    source: 'admin',
    type: 'set-text',
    payload: { seid: selected.seid, text: textEditor.value },
  });
});

saveButton.addEventListener('click', async () => {
  try {
    const htmlPayload = await sendRequest('get-html');
    const store = loadStore();
    if (!store.pages) store.pages = {};
    store.pages[currentPage] = {
      mainHtml: htmlPayload.mainHtml,
      footerHtml: htmlPayload.footerHtml,
    };
    saveStore(store);
    editorNote.textContent = '已保存到本地浏览器。刷新前台页面即可看到更新结果。';
  } catch {
    editorNote.textContent = '保存失败：未能从预览获取页面内容。';
  }
});

resetPageButton.addEventListener('click', () => {
  const store = loadStore();
  if (store.pages && store.pages[currentPage]) {
    delete store.pages[currentPage];
    saveStore(store);
  }
  loadPage(currentPage);
  editorNote.textContent = '当前页面已恢复默认内容。';
});

resetAllButton.addEventListener('click', () => {
  localStorage.removeItem(STORE_KEY);
  loadPage(currentPage);
  editorNote.textContent = '所有页面内容已恢复默认。';
});

exportButton.addEventListener('click', exportContent);
importButton.addEventListener('click', () => importInput.click());
importInput.addEventListener('change', (event) => {
  const [file] = event.target.files;
  if (file) importContent(file);
});

duplicateButton.addEventListener('click', () => {
  if (!requireRepeatSelection()) return;
  postToPreview({
    source: 'admin',
    type: 'repeat-action',
    payload: { seid: selected.seid, action: 'duplicate' },
  });
});

deleteButton.addEventListener('click', () => {
  if (!requireRepeatSelection()) return;
  postToPreview({
    source: 'admin',
    type: 'repeat-action',
    payload: { seid: selected.seid, action: 'delete' },
  });
});

moveUpButton.addEventListener('click', () => {
  if (!requireRepeatSelection()) return;
  postToPreview({
    source: 'admin',
    type: 'repeat-action',
    payload: { seid: selected.seid, action: 'up' },
  });
});

moveDownButton.addEventListener('click', () => {
  if (!requireRepeatSelection()) return;
  postToPreview({
    source: 'admin',
    type: 'repeat-action',
    payload: { seid: selected.seid, action: 'down' },
  });
});

function sendImageToSelection(src) {
  if (!selected || !selected.seid) {
    editorNote.textContent = '请先在预览中选中一个元素，再插入图片。';
    return;
  }
  postToPreview({
    source: 'admin',
    type: 'insert-image',
    payload: { seid: selected.seid, src },
  });
}

imageUrlButton.addEventListener('click', () => {
  const url = window.prompt('请输入图片路径或图片 URL');
  if (url) sendImageToSelection(url.trim());
});

imageUploadButton.addEventListener('click', () => imageUploadInput.click());
imageUploadInput.addEventListener('change', (event) => {
  const [file] = event.target.files;
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => sendImageToSelection(reader.result);
  reader.readAsDataURL(file);
});

setPasswordHint();

if (sessionStorage.getItem('zichen-site-admin-auth') === 'true') {
  showApp();
}

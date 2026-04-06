/**
 * Demo sidebar implementation for ChatGPT Outline.
 * Keeps only local navigation, sidebar layout, and lightweight UI helpers.
 */

window.CGTD = window.CGTD || {};

let activeIndex = null;
let currentItems = [];
let lastRenderedDirectorySignature = '';

const DIRECTORY_LINE_CLAMP = 3;
const FREE_CLICKABLE_LIMIT = 15;
const SIDEBAR_SIDE_STORAGE_KEY = 'cgtd_sidebar_side';
const SIDEBAR_FIXED_WIDTH = 260;
const SIDEBAR_DEFAULT_SIDE = 'left';
const CHROME_WEB_STORE_URL = 'https://chromewebstore.google.com/detail/chatgpt-outline-%E2%80%93-navigat/opbngifmlnoahbhjhgmngkggedlofddj';
const OUTLINE_PRO_URL = 'https://wisteriasoftware.uk/outline-pro';

function injectStyles() {
  // CSS is injected by manifest.json.
}

function clampSidebarWidth(width) {
  void width;
  return SIDEBAR_FIXED_WIDTH;
}

function normalizeSidebarSide(side) {
  return side === 'right' ? 'right' : 'left';
}

function persistSidebarSide(side) {
  try {
    localStorage.setItem(SIDEBAR_SIDE_STORAGE_KEY, normalizeSidebarSide(side));
  } catch (_) {}
}

function loadSidebarSide() {
  try {
    return normalizeSidebarSide(localStorage.getItem(SIDEBAR_SIDE_STORAGE_KEY) || SIDEBAR_DEFAULT_SIDE);
  } catch (_) {
    return SIDEBAR_DEFAULT_SIDE;
  }
}

function updateSideToggleLabel(sidebar, side) {
  const sideBtn = sidebar && sidebar.querySelector('#cgtd-side-toggle');
  if (!sideBtn) return;
  sideBtn.textContent = side === 'left' ? '⇢' : '⇠';
}

function applySidebarSide(sidebar, side, options = {}) {
  if (!sidebar) return SIDEBAR_DEFAULT_SIDE;
  const normalized = normalizeSidebarSide(side);
  sidebar.dataset.side = normalized;

  if (normalized === 'right') {
    sidebar.style.left = 'auto';
    sidebar.style.right = '0';
    sidebar.style.borderRight = 'none';
    sidebar.style.borderLeft = '1px solid #e5e7eb';
  } else {
    sidebar.style.left = '0';
    sidebar.style.right = 'auto';
    sidebar.style.borderLeft = 'none';
    sidebar.style.borderRight = '1px solid #e5e7eb';
  }

  updateSideToggleLabel(sidebar, normalized);

  if (options.persist !== false) {
    persistSidebarSide(normalized);
  }
  return normalized;
}

function loadSidebarWidth() {
  return SIDEBAR_FIXED_WIDTH;
}

function applySidebarWidth(sidebar, width, options = {}) {
  if (!sidebar) return SIDEBAR_FIXED_WIDTH;
  const nextWidth = clampSidebarWidth(width);
  sidebar.style.width = `${nextWidth}px`;
  void options;
  return nextWidth;
}

function getDirectoryViewHTML() {
  return `
    <div id="cgtd-header" style="
      flex-shrink: 0;
      padding: 10px 10px 10px 8px;
      background: #fff;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      justify-content: space-between;
    ">
      <div style="display:flex; align-items:center; gap:10px; min-width:0;">
        <span style="
          display:inline-flex;
          align-items:center;
          height:22px;
          padding:0 8px;
          border-radius:999px;
          background:#eff6ff;
          color:#1d4ed8;
          font-size:11px;
          font-weight:700;
          letter-spacing:0.2px;
        ">LOCAL</span>
        <span style="font-weight: 600; color: #111; white-space: nowrap;">Outline</span>
      </div>
      <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
        <button id="cgtd-side-toggle" style="
          width: 24px; height: 24px;
          border: none;
          background: transparent;
          cursor: pointer;
          font-size: 16px;
          color: #9ca3af;
          display: flex;
          align-items: center;
          justify-content: center;
        ">⇢</button>
        <button id="cgtd-close-btn" style="
          width: 24px; height: 24px;
          border: none;
          background: transparent;
          cursor: pointer;
          font-size: 20px;
          color: #9ca3af;
          display: flex;
          align-items: center;
          justify-content: center;
        ">×</button>
      </div>
    </div>
    <div id="cgtd-content" style="
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    ">
      <ul id="cgtd-list" style="padding: 0; margin: 0; list-style: none;"></ul>
    </div>
    <div id="cgtd-footer" style="
      flex-shrink: 0;
      padding: 10px 16px;
      background: #fafafa;
      border-top: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    ">
      <button id="cgtd-latest-version-btn" style="
        border: 1px solid #dbe4f0;
        background: #ffffff;
        color: #1d4ed8;
        border-radius: 999px;
        padding: 5px 10px;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        font-family: inherit;
        white-space: nowrap;
      " title="Get the latest version on Chrome Web Store">Latest Version</button>
      <span style="font-size: 11px; color: #9ca3af;">v1.0</span>
    </div>
  `;
}

function getSidebarHTML() {
  return `
    ${getDirectoryViewHTML()}
  `;
}

function bindSidebarEvents(sidebar) {
  const sideToggleBtn = sidebar.querySelector('#cgtd-side-toggle');
  if (sideToggleBtn) {
    sideToggleBtn.addEventListener('click', () => {
      const current = normalizeSidebarSide(sidebar.dataset.side || loadSidebarSide());
      const next = current === 'left' ? 'right' : 'left';
      applySidebarSide(sidebar, next);
    });
  }

  const closeBtn = sidebar.querySelector('#cgtd-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      sidebar.style.display = 'none';
      if (window.CGTD && typeof window.CGTD.stopAutoUpdate === 'function') {
        window.CGTD.stopAutoUpdate();
      }
    });
  }

  const list = sidebar.querySelector('#cgtd-list');
  if (list) {
    list.addEventListener('click', handleListClick);
    list.addEventListener('mouseover', handleListHover);
    list.addEventListener('mouseout', handleListHoverOut);
  }

  const latestVersionBtn = sidebar.querySelector('#cgtd-latest-version-btn');
  if (latestVersionBtn) {
    latestVersionBtn.addEventListener('click', () => {
      window.open(CHROME_WEB_STORE_URL, '_blank', 'noopener');
    });
  }
}

function buildDirectoryRenderSignature(items) {
  const count = items.length;
  if (count === 0) {
    return 'count:0';
  }

  let digest = 2166136261;
  for (let index = 0; index < count; index++) {
    const text = String(items[index] && items[index].text ? items[index].text : '');
    digest ^= text.length;
    digest = Math.imul(digest, 16777619);
    if (text.length > 0) {
      digest ^= text.charCodeAt(0);
      digest = Math.imul(digest, 16777619);
      digest ^= text.charCodeAt(text.length - 1);
      digest = Math.imul(digest, 16777619);
    }
  }
  return `count:${count}|digest:${digest >>> 0}`;
}

function normalizeDirectoryText(text) {
  if (!text) return '';
  return String(text)
    .replace(/\u00a0/g, ' ')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function isClickableDirectoryIndex(index) {
  return index >= 0 && index < FREE_CLICKABLE_LIMIT;
}

function renderDirectoryList(items, options = {}) {
  const { force = false } = options;
  const list = document.querySelector('#cgtd-list');
  if (!list) return;

  currentItems = items || [];
  const signature = buildDirectoryRenderSignature(currentItems);
  if (!force && signature === lastRenderedDirectorySignature) {
    return;
  }
  lastRenderedDirectorySignature = signature;
  list.innerHTML = '';

  if (currentItems.length === 0) {
    return;
  }

  const fragment = document.createDocumentFragment();

  currentItems.forEach((item, index) => {
    const li = document.createElement('li');
    const isClickable = isClickableDirectoryIndex(index);

    const numberSpan = document.createElement('span');
    numberSpan.textContent = `${index + 1}.`;
    numberSpan.style.cssText = `
      margin-right: 8px;
      font-weight: 500;
      color: #9ca3af;
      flex-shrink: 0;
      min-width: 20px;
      text-align: right;
    `;

    const textSpan = document.createElement('span');
    textSpan.textContent = normalizeDirectoryText(item.text);
    textSpan.style.cssText = `
      flex: 1;
      color: #374151;
      line-height: 1.45;
      white-space: normal;
      word-break: break-word;
      overflow: hidden;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: ${DIRECTORY_LINE_CLAMP};
      text-overflow: ellipsis;
    `;

    li.appendChild(numberSpan);
    li.appendChild(textSpan);
    li.dataset.index = index;
    li.style.cssText = `
      display: flex;
      align-items: flex-start;
      padding: 10px 16px;
      cursor: ${isClickable ? 'pointer' : 'default'};
      transition: background 0.1s;
      opacity: ${isClickable ? '1' : '0.6'};
    `;

    if (index === activeIndex) {
      applyActiveStyle(li);
    }

    fragment.appendChild(li);
  });

  list.appendChild(fragment);
}

function refreshDirectoryList(options = {}) {
  renderDirectoryList(currentItems, options);
}

function setDirectoryEmptyState(html, options = {}) {
  void html;
  void options;
}

function clearDirectoryEmptyState(options = {}) {
  void options;
}

function handleListClick(e) {
  const li = e.target.closest('li[data-index]');
  if (!li) return;

  const index = Number(li.dataset.index);
  if (Number.isNaN(index) || !currentItems[index]) return;

  if (!isClickableDirectoryIndex(index)) {
    if (window.CGTD && window.CGTD.showToast) {
      window.CGTD.showToast(
        'Free demo: only the first 15 items can jump.\nFor full navigation, upgrade to Pro on the official website.',
        e.clientX,
        e.clientY,
        {
          linkText: 'Upgrade to Pro',
          linkHref: OUTLINE_PRO_URL,
        }
      );
    }
    return;
  }

  setActiveIndex(index);
  if (window.CGTD.onDirectoryItemClick) {
    window.CGTD.onDirectoryItemClick(currentItems[index]);
  }
}

function handleListHover(e) {
  const li = e.target.closest('li[data-index]');
  if (!li) return;
  const index = Number(li.dataset.index);
  if (!isClickableDirectoryIndex(index)) return;
  if (index !== activeIndex) {
    li.style.background = '#f9fafb';
  }
}

function handleListHoverOut(e) {
  const li = e.target.closest('li[data-index]');
  if (!li) return;
  const index = Number(li.dataset.index);
  if (!isClickableDirectoryIndex(index)) return;
  if (index !== activeIndex) {
    li.style.background = 'transparent';
  }
}

function setActiveIndex(index) {
  activeIndex = index;
  const list = document.getElementById('cgtd-list');
  if (!list) return;

  Array.from(list.children).forEach((li) => {
    if (Number(li.dataset.index) === index) {
      applyActiveStyle(li);
    } else {
      clearActiveStyle(li);
    }
  });
}

function applyActiveStyle(li) {
  li.style.background = '#eff6ff';
  li.style.fontWeight = '500';
}

function clearActiveStyle(li) {
  li.style.background = 'transparent';
  li.style.fontWeight = 'normal';
}

window.CGTD.renderSidebar = function (items) {
  injectStyles();

  let sidebar = document.getElementById('cgtd-sidebar');
  if (!sidebar) {
    sidebar = document.createElement('div');
    sidebar.id = 'cgtd-sidebar';
    sidebar.style.cssText = `
      position: absolute;
      left: 0;
      bottom: 0;
      width: ${SIDEBAR_FIXED_WIDTH}px;
      height: 100%;
      background: #fff;
      border-right: 1px solid #e5e7eb;
      z-index: 9999;
      display: none;
      flex-direction: column;
      font-size: 13px;
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: none;
    `;

    sidebar.innerHTML = getSidebarHTML();
    document.body.appendChild(sidebar);
    applySidebarSide(sidebar, loadSidebarSide(), { persist: false });
    applySidebarWidth(sidebar, loadSidebarWidth(), { persist: false });
    bindSidebarEvents(sidebar);
  } else {
    applySidebarSide(sidebar, loadSidebarSide(), { persist: false });
    applySidebarWidth(sidebar, loadSidebarWidth(), { persist: false });
  }

  renderDirectoryList(items);
};

window.CGTD.showToast = function (message, x, y, options = {}) {
  document.querySelectorAll('.cgtd-toast').forEach((node) => node.remove());

  const toast = document.createElement('div');
  toast.className = 'cgtd-toast';
  const hasLink = !!(options.linkText && options.linkHref);

  if (hasLink) {
    const messageBlock = document.createElement('div');
    messageBlock.textContent = message;
    messageBlock.style.whiteSpace = 'pre-line';

    const link = document.createElement('a');
    link.textContent = options.linkText;
    link.href = options.linkHref;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.cssText = `
      color: #2563eb;
      font-weight: 600;
      text-decoration: none;
      margin-top: 8px;
      display: inline-block;
    `;
    link.addEventListener('mouseenter', () => {
      link.style.textDecoration = 'underline';
    });
    link.addEventListener('mouseleave', () => {
      link.style.textDecoration = 'none';
    });

    toast.appendChild(messageBlock);
    toast.appendChild(link);
  } else {
    toast.textContent = message;
  }

  let posStyle = '';
  if (typeof x === 'number' && typeof y === 'number') {
    const top = Math.max(12, Math.min(y + 16, window.innerHeight - 96));
    const left = Math.max(12, Math.min(x + 12, window.innerWidth - 300));
    posStyle = `top: ${top}px; left: ${left}px;`;
  } else {
    posStyle = 'top: 50%; left: 50%; transform: translate(-50%, -50%);';
  }

  toast.style.cssText = `
    position: fixed;
    ${posStyle}
    background: #ffffff;
    color: #1f2937;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid #dbe4f0;
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
    z-index: 1000000;
    font-size: 13px;
    line-height: 1.45;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    pointer-events: ${hasLink ? 'auto' : 'none'};
    opacity: 0;
    transition: opacity 0.2s;
    white-space: pre-line;
    max-width: 280px;
  `;

  let isHovered = false;
  let canDismiss = false;

  function removeToast() {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 200);
  }

  if (hasLink) {
    toast.addEventListener('mouseenter', () => {
      isHovered = true;
    });
    toast.addEventListener('mouseleave', () => {
      isHovered = false;
      if (canDismiss) {
        removeToast();
      }
    });
  }

  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
  });

  setTimeout(() => {
    canDismiss = true;
    if (!isHovered) {
      removeToast();
    }
  }, 2000);
};

window.CGTD.toggleSidebar = function () {
  const sidebar = document.getElementById('cgtd-sidebar');
  if (!sidebar) return;

  const willShow = sidebar.style.display === 'none' || !sidebar.style.display;
  sidebar.style.display = willShow ? 'flex' : 'none';

  if (window.CGTD) {
    if (willShow && typeof window.CGTD.startAutoUpdate === 'function') {
      window.CGTD.startAutoUpdate();
    }
    if (!willShow && typeof window.CGTD.stopAutoUpdate === 'function') {
      window.CGTD.stopAutoUpdate();
    }
  }
};

window.CGTD.setDirectoryEmptyState = setDirectoryEmptyState;
window.CGTD.clearDirectoryEmptyState = clearDirectoryEmptyState;

console.log('[CGTD] sidebar.js demo build loaded');

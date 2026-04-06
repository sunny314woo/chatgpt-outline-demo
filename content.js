/**
 * content.js (v1.0)
 * -----------
 * ChatGPT 对话目录 - 内容脚本
 */

(function () {
  if (window.__CGTD_LOADED__) return;
  window.__CGTD_LOADED__ = true;

  console.log('[CGTD] content.js v1.0 loaded');

  window.CGTD = window.CGTD || {};

  /** =========================
   * 工具函数
   * ========================= */
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /** =========================
   * 按钮状态管理
   * ========================= */
  let buttonInserted = false;
  let buttonElement = null;
  let headerObserver = null; // ✅ 保存 observer 引用
  let urlListenerBound = false;
  let lastObservedUrl = location.href;
  let urlPollTimer = null;
  let urlChangeDebounceTimer = null;
  const STARTUP_SIDEBAR_SIDE = 'right';
  const STARTUP_SIDEBAR_WIDTH = 260;
  const AUTO_DIRECTORY_MAX_RETRIES = 10;
  const AUTO_DIRECTORY_RETRY_MS = 400;
  const REFRESH_REASONS = Object.freeze({
    MANUAL: 'manual',
    ROUTE: 'route',
    OBSERVER: 'observer',
  });
  const REFRESH_PRIORITY = Object.freeze({
    [REFRESH_REASONS.OBSERVER]: 1,
    [REFRESH_REASONS.ROUTE]: 2,
    [REFRESH_REASONS.MANUAL]: 3,
  });
  let refreshInFlight = false;
  let trailingRefreshRequest = null;
  let refreshRunPromise = null;

  function mergeTrailingRefreshRequest(pending, incoming) {
    if (!pending) return incoming;
    const pendingPriority = REFRESH_PRIORITY[pending.reason] || 0;
    const incomingPriority = REFRESH_PRIORITY[incoming.reason] || 0;
    if (incomingPriority >= pendingPriority) {
      return incoming;
    }
    return pending;
  }

  function isConversationRoute(url = location.href) {
    try {
      const parsed = new URL(url);
      return /\/c\/[a-z0-9-]{8,}/i.test(parsed.pathname);
    } catch (_) {
      return /\/c\/[a-z0-9-]{8,}/i.test(url);
    }
  }

  function applyStartupSidebarLayout() {
    try {
      localStorage.setItem('cgtd_sidebar_side', STARTUP_SIDEBAR_SIDE);
      localStorage.setItem('cgtd_sidebar_width', String(STARTUP_SIDEBAR_WIDTH));
    } catch (_) {}
  }

  function renderDirectoryAndOpen(items) {
    if (window.CGTD && typeof window.CGTD.renderSidebar === 'function') {
      window.CGTD.renderSidebar(items);
    }
    const sidebar = document.getElementById('cgtd-sidebar');
    if (sidebar) {
      sidebar.style.display = 'flex';
    }
    startAutoRefresh();
  }

  async function performManualRefresh({ button } = {}) {
    if (!button) {
      return;
    }

    const items = window.CGTD.DirectoryEngine.generate();
    if (!items || items.length === 0) {
      return;
    }

    const originalHTML = button.innerHTML;
    button.innerHTML = 'Loading...';
    button.disabled = true;
    button.style.opacity = '0.6';
    button.style.cursor = 'not-allowed';

    try {
      if (window.CGTD && window.CGTD.renderSidebar) {
        window.CGTD.renderSidebar(items);
      }

      const sidebar = document.getElementById('cgtd-sidebar');
      if (sidebar) {
        sidebar.style.display = 'flex';
        startAutoRefresh();
        const content = document.getElementById('cgtd-content');
        if (content) {
          setTimeout(() => {
            content.scrollTop = content.scrollHeight;
          }, 50);
        }
      }
    } catch (error) {
      console.error('[CGTD] Error generating directory:', error);
      if (window.CGTD && window.CGTD.showToast) {
        window.CGTD.showToast('Failed to generate outline. Please try again.');
      }
    } finally {
      button.innerHTML = originalHTML;
      button.disabled = false;
      button.style.opacity = '1';
      button.style.cursor = 'pointer';
    }
  }

  function performObserverRefresh() {
    const sidebar = document.getElementById('cgtd-sidebar');
    if (!sidebar || sidebar.style.display === 'none') return;

    console.log('[CGTD] Auto refreshing directory...');

    const scrollContainer = document.getElementById('cgtd-content');
    const oldScrollTop = scrollContainer ? scrollContainer.scrollTop : 0;
    const isNearBottom = scrollContainer
      ? (scrollContainer.scrollHeight - (scrollContainer.scrollTop + scrollContainer.clientHeight))
          <= Math.max(420, Math.floor(scrollContainer.clientHeight * 0.9))
      : false;

    const items = window.CGTD.DirectoryEngine.generate();

    if (window.CGTD.renderSidebar) {
      window.CGTD.renderSidebar(items);
    }

    const newScrollContainer = document.getElementById('cgtd-content');
    if (newScrollContainer) {
      if (isNearBottom) {
        // 用户已在目录尾部附近：新增问题后自动吸底，保持无感连续阅读
        newScrollContainer.scrollTop = newScrollContainer.scrollHeight;
      } else {
        // 用户在前面浏览：保持静默刷新，不打断当前位置
        newScrollContainer.scrollTop = oldScrollTop;
      }
    }
  }

  function performRouteRefresh() {
    if (isConversationRoute()) {
      tryRenderDirectoryWithRetry(0);
      return;
    }

    stopAutoRefresh();
    const sidebar = document.getElementById('cgtd-sidebar');
    if (sidebar && sidebar.style.display !== 'none') {
      sidebar.style.display = 'none';
    }
  }

  async function performDirectoryRefresh(reason, context = {}) {
    switch (reason) {
      case REFRESH_REASONS.MANUAL:
        return performManualRefresh(context);
      case REFRESH_REASONS.ROUTE:
        return performRouteRefresh();
      case REFRESH_REASONS.OBSERVER:
        return performObserverRefresh();
      default:
        console.warn('[CGTD] Unknown refresh reason:', reason);
        return;
    }
  }

  function requestDirectoryRefresh(reason, context = {}) {
    const incoming = { reason, context };
    if (refreshInFlight) {
      trailingRefreshRequest = mergeTrailingRefreshRequest(trailingRefreshRequest, incoming);
      return refreshRunPromise || Promise.resolve();
    }

    refreshInFlight = true;
    refreshRunPromise = Promise.resolve()
      .then(async () => {
        let nextRequest = incoming;
        while (nextRequest) {
          const request = nextRequest;
          nextRequest = null;
          await performDirectoryRefresh(request.reason, request.context);
          if (trailingRefreshRequest) {
            nextRequest = trailingRefreshRequest;
            trailingRefreshRequest = null;
          }
        }
      })
      .finally(() => {
        refreshInFlight = false;
        refreshRunPromise = null;
      });
    return refreshRunPromise;
  }

  function tryRenderDirectoryWithRetry(retryCount = 0) {
    if (!isConversationRoute()) {
      stopAutoRefresh();
      return;
    }
    if (!window.CGTD || !window.CGTD.DirectoryEngine || typeof window.CGTD.DirectoryEngine.generate !== 'function') {
      return;
    }

    const items = window.CGTD.DirectoryEngine.generate();
    if (items.length > 0 || retryCount >= AUTO_DIRECTORY_MAX_RETRIES) {
      renderDirectoryAndOpen(items);
      return;
    }

    setTimeout(() => {
      tryRenderDirectoryWithRetry(retryCount + 1);
    }, AUTO_DIRECTORY_RETRY_MS);
  }

  function syncSidebarForCurrentRoute() {
    requestDirectoryRefresh(REFRESH_REASONS.ROUTE);
  }

	  /** =========================
	   * 顶部入口按钮
	   * ========================= */
	  function getTopEntryMountElement() {
	    const header = document.querySelector('header');
	    if (header) return header;
	    const banner = document.querySelector('[role="banner"]');
	    if (banner) return banner;
	    return document.body;
	  }

	  function insertTopEntry() {
	    if (buttonInserted && buttonElement && document.contains(buttonElement)) {
	      return;
	    }

	    const mount = getTopEntryMountElement();
	    if (!mount) {
	      console.warn('[CGTD] insertTopEntry: mount element not found');
	      return;
	    }


    const existingBtn = document.getElementById('cgtd-top-entry');
    if (existingBtn) {
      buttonInserted = true;
      buttonElement = existingBtn;
      return;
    }

    const btn = document.createElement('button');
    btn.id = 'cgtd-top-entry';
    btn.title = 'Generate or refresh conversation outline';
    btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 32 32" fill="none" style="vertical-align:-4px; margin-right:6px;"><rect x="4" y="4" width="4" height="4" fill="#000"/><rect x="12" y="4" width="16" height="4" fill="#000"/><rect x="4" y="12" width="4" height="4" fill="#000"/><rect x="12" y="12" width="16" height="4" fill="#000"/><rect x="4" y="20" width="4" height="4" fill="#2563EB"/><rect x="12" y="20" width="16" height="4" fill="#2563EB"/></svg>Outline';
    btn.style.cssText = `
      position: fixed;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 999999;
      padding: 7px 16px 7px 12px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      border-radius: 8px;
      border: 1px solid #e5e5e5;
      background: #ffffff;
      color: #333;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
      transition: background 0.2s, box-shadow 0.2s;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: inline-flex;
      align-items: center;
      line-height: 1;
    `;

    btn.addEventListener('mouseenter', () => {
      btn.style.background = '#f9f9f9';
      btn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.08)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = '#ffffff';
      btn.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
    });

    const handleClick = debounce(() => {
      if (btn.disabled) return;

      requestDirectoryRefresh(REFRESH_REASONS.MANUAL, { button: btn }).catch((error) => {
        console.error('[CGTD] Manual refresh failed:', error);
      });
    }, 500);

	    btn.addEventListener('click', handleClick);

	    // Use a resilient mount element (header if present; otherwise body/banner fallback).
	    mount.prepend(btn);

	    buttonInserted = true;
	    buttonElement = btn;

    console.log('[CGTD] Button inserted at', new Date().toLocaleTimeString());
  }

  window.CGTD.onDirectoryItemClick = function (item) {
    if (window.CGTD && window.CGTD.scrollToQuestion) {
      window.CGTD.scrollToQuestion(item);
    }
  };

  /** =========================
   * 增强型 SPA 监听
   * ========================= */
  /**
   * ✅ 监听 URL 变化（SPA 路由切换）
   */
  function setupUrlChangeListener() {
    if (urlListenerBound) {
      return;
    }
    urlListenerBound = true;

    const applyRouteChange = () => {
      const currentUrl = location.href;
      if (currentUrl === lastObservedUrl) {
        return;
      }

      console.log('[CGTD] URL changed from', lastObservedUrl, 'to', currentUrl);
      lastObservedUrl = currentUrl;

      // URL 变化后，重置按钮状态并重新插入
      buttonInserted = false;
      buttonElement = null;

      if (urlChangeDebounceTimer) {
        clearTimeout(urlChangeDebounceTimer);
      }

      // 延迟等待新页面渲染
      urlChangeDebounceTimer = setTimeout(() => {
        console.log('[CGTD] Re-inserting button after URL change...');
        insertTopEntry();

        // 重新设置 header 监听
        if (headerObserver) {
          headerObserver.disconnect();
        }
        setupHeaderMonitor();

        requestDirectoryRefresh(REFRESH_REASONS.ROUTE);
      }, 300);
    };

    // 1) 监听浏览器前进后退
    window.addEventListener('popstate', applyRouteChange);
    // 2) 监听 hash 路由
    window.addEventListener('hashchange', applyRouteChange);

    // 3) 监听 SPA pushState/replaceState
    const rawPushState = history.pushState;
    const rawReplaceState = history.replaceState;

    history.pushState = function (...args) {
      const result = rawPushState.apply(this, args);
      applyRouteChange();
      return result;
    };

    history.replaceState = function (...args) {
      const result = rawReplaceState.apply(this, args);
      applyRouteChange();
      return result;
    };

    function startUrlPoll() {
      if (urlPollTimer || document.visibilityState !== 'visible') {
        return;
      }
      // 4) 低频轮询兜底（覆盖页面脚本上下文直接改写 history 的场景）
      urlPollTimer = setInterval(applyRouteChange, 800);
    }

    function stopUrlPoll() {
      if (!urlPollTimer) {
        return;
      }
      clearInterval(urlPollTimer);
      urlPollTimer = null;
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        applyRouteChange();
        startUrlPoll();
      } else {
        stopUrlPoll();
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', stopUrlPoll);
    window.addEventListener('focus', handleVisibilityChange);
    startUrlPoll();

    console.log('[CGTD] URL change listener started (history + events + poll fallback)');
  }

  /**
   * ✅ 监听 header 变化
   */
	  function setupHeaderMonitor() {
	    const mount = getTopEntryMountElement();
	    if (!mount) {
	      console.warn('[CGTD] setupHeaderMonitor: mount element not found');
	      return;
	    }

	    const debouncedInsert = debounce(() => {
	      // 检查按钮是否还在
	      if (!document.getElementById('cgtd-top-entry')) {
	        console.log('[CGTD] Button lost, re-inserting...');
	        buttonInserted = false;
	        buttonElement = null;
	        insertTopEntry();
	      }
	    }, 500);

	    headerObserver = new MutationObserver(debouncedInsert);
	    
	    // ✅ 监听 mount 的父元素（若 mount 是 body 则监听 body 自身）
	    const targetElement = mount === document.body ? mount : (mount.parentElement || document.body);
	    
	    headerObserver.observe(targetElement, {
	      childList: true,
	      subtree: false
	    });

	    console.log('[CGTD] Header monitor started');
	  }

  /** =========================
   * 智能初始化
   * ========================= */
	  function isChatGPTReady() {
	    const main = document.querySelector('main');
	    
	    if (!main) {
	      return false;
	    }
	    
	    return true;
	  }

  function waitForChatGPTReady() {
    console.log('[CGTD] Starting initialization...');
    
    if (document.readyState !== 'complete') {
      console.log('[CGTD] Waiting for page load...');
      window.addEventListener('load', () => {
        console.log('[CGTD] Page loaded, delaying 2s...');
        setTimeout(() => {
          startInitialization();
        }, 500);
      });
      return;
    }
    
    console.log('[CGTD] Page already loaded, delaying 2s...');
    setTimeout(() => {
      startInitialization();
    }, 500);
  }

  function startInitialization() {
    console.log('[CGTD] Checking if ChatGPT is ready...');
    
    if (isChatGPTReady()) {
      console.log('[CGTD] ChatGPT is ready');
      insertTopEntry();
      setupHeaderMonitor();
      setupUrlChangeListener(); // ✅ 新增：监听 URL 变化
      applyStartupSidebarLayout();
      syncSidebarForCurrentRoute();
      return;
    }
    
    console.log('[CGTD] Waiting for ChatGPT...');
    
    let checkCount = 0;
    const maxChecks = 10;
    
    const readyChecker = setInterval(() => {
      checkCount++;
      console.log('[CGTD] Check', checkCount, '/', maxChecks);
      
      if (isChatGPTReady()) {
        console.log('[CGTD] ChatGPT ready after', checkCount, 'checks');
        clearInterval(readyChecker);
        insertTopEntry();
        setupHeaderMonitor();
        setupUrlChangeListener(); // ✅ 新增：监听 URL 变化
        applyStartupSidebarLayout();
        syncSidebarForCurrentRoute();
      } else if (checkCount >= maxChecks) {
        console.warn('[CGTD] Timeout after', maxChecks, 'checks');
        clearInterval(readyChecker);
        insertTopEntry();
        setupHeaderMonitor();
        setupUrlChangeListener(); // ✅ 新增：监听 URL 变化
        applyStartupSidebarLayout();
        syncSidebarForCurrentRoute();
      }
    }, 1000);
  }

  waitForChatGPTReady();
  /** =========================
 * 自动刷新机制（1.0 冻结版）
 * ========================= */

  let messageObserver = null;
  let refreshTimer = null;
  const MESSAGE_NODE_SELECTOR = '[data-message-author-role]';

  function isMessageRelatedElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }
    if (typeof element.matches === 'function' && element.matches(MESSAGE_NODE_SELECTOR)) {
      return true;
    }
    if (typeof element.closest === 'function' && element.closest(MESSAGE_NODE_SELECTOR)) {
      return true;
    }
    if (typeof element.querySelector === 'function' && element.querySelector(MESSAGE_NODE_SELECTOR)) {
      return true;
    }
    return false;
  }

  function isMessageRelatedNode(node) {
    if (!node) return false;
    if (node.nodeType === Node.ELEMENT_NODE) {
      return isMessageRelatedElement(node);
    }
    if (node.nodeType === Node.TEXT_NODE) {
      return isMessageRelatedElement(node.parentElement);
    }
    return false;
  }

  function startAutoRefresh() {
    const main = document.querySelector('main');
    if (!main) return;

    if (messageObserver) {
      messageObserver.disconnect();
    }

    const debouncedRefresh = debounce(() => {
      requestDirectoryRefresh(REFRESH_REASONS.OBSERVER).catch((error) => {
        console.error('[CGTD] Observer refresh failed:', error);
      });
    }, 200);

    messageObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type !== 'childList' || m.addedNodes.length === 0) {
          continue;
        }
        for (const node of m.addedNodes) {
          if (isMessageRelatedNode(node)) {
            debouncedRefresh();
            return;
          }
        }
      }
    });

    messageObserver.observe(main, {
      childList: true,
      subtree: true
    });

    console.log('[CGTD] Auto refresh observer started');
  }

  function stopAutoRefresh() {
    if (messageObserver) {
      messageObserver.disconnect();
      messageObserver = null;
    }
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
    console.log('[CGTD] Auto refresh observer stopped');
  }

  window.CGTD.startAutoUpdate = startAutoRefresh;
  window.CGTD.stopAutoUpdate = stopAutoRefresh;
  window.CGTD.requestDirectoryRefresh = requestDirectoryRefresh;

})();

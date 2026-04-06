/**
 * navigation.js (优化版本)
 * -----------
 * 最后修改: 2026-02-02
 * 
 * 职责：
 * - 处理目录项点击后的页面滚动定位
 * - 优化定位准确性，避免多次点击才能定位到正确位置
 * 
 * 性能优化：
 * - ✅ 添加节流机制（300ms），避免频繁滚动
 */

window.CGTD = window.CGTD || {};
const HIGHLIGHT_STYLE_ID = 'cgtd-scroll-highlight-style';
const HIGHLIGHT_CLASS = 'cgtd-scroll-highlight';
const SCROLL_TOP_OFFSET = 96;
let highlightTimer = null;
let lastHighlightedElement = null;

/**
 * 节流函数 - 限制执行频率
 * @param {Function} func - 要执行的函数
 * @param {Number} wait - 等待时间（毫秒）
 * @returns {Function} 节流后的函数
 */
function throttle(func, wait) {
  let timeout = null;
  let previous = 0;
  
  return function(...args) {
    const now = Date.now();
    const remaining = wait - (now - previous);
    
    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      previous = now;
      func.apply(this, args);
    } else if (!timeout) {
      timeout = setTimeout(() => {
        previous = Date.now();
        timeout = null;
        func.apply(this, args);
      }, remaining);
    }
  };
}

function ensureHighlightStyle() {
  if (document.getElementById(HIGHLIGHT_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent = `
    @keyframes cgtdHighlightPulse {
      0% {
        background-color: rgba(96, 165, 250, 0.24);
        box-shadow: 0 0 0 0 rgba(96, 165, 250, 0.35);
      }
      100% {
        background-color: transparent;
        box-shadow: 0 0 0 10px rgba(96, 165, 250, 0);
      }
    }

    .${HIGHLIGHT_CLASS} {
      border-radius: 12px;
      animation: cgtdHighlightPulse 1.6s ease-out 1;
    }
  `;
  document.head.appendChild(style);
}

function flashTarget(element) {
  if (!element || !element.isConnected) return;

  ensureHighlightStyle();

  if (lastHighlightedElement && lastHighlightedElement !== element) {
    lastHighlightedElement.classList.remove(HIGHLIGHT_CLASS);
  }

  if (highlightTimer) {
    clearTimeout(highlightTimer);
    highlightTimer = null;
  }

  element.classList.remove(HIGHLIGHT_CLASS);
  // Force reflow so repeated clicks on the same item can replay the animation.
  void element.offsetWidth;
  element.classList.add(HIGHLIGHT_CLASS);
  lastHighlightedElement = element;

  highlightTimer = setTimeout(() => {
    element.classList.remove(HIGHLIGHT_CLASS);
    if (lastHighlightedElement === element) {
      lastHighlightedElement = null;
    }
  }, 1700);
}

function getScrollableAncestor(element) {
  let node = element && element.parentElement;

  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    const canScrollY = /(auto|scroll)/.test(style.overflowY);
    if (canScrollY && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }

  return document.scrollingElement || document.documentElement;
}

function scrollElementToTopWithOffset(element, offset) {
  const container = getScrollableAncestor(element);
  const safeOffset = Math.max(0, Number(offset) || 0);

  const isRootScroller =
    container === document.body ||
    container === document.documentElement ||
    container === document.scrollingElement;

  if (isRootScroller) {
    const rect = element.getBoundingClientRect();
    const targetTop = Math.max(0, window.scrollY + rect.top - safeOffset);
    window.scrollTo({
      top: targetTop,
      behavior: 'smooth'
    });
    return;
  }

  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const targetTop = Math.max(
    0,
    container.scrollTop + (elementRect.top - containerRect.top) - safeOffset
  );

  container.scrollTo({
    top: targetTop,
    behavior: 'smooth'
  });
}

/**
 * 滚动到指定问题元素（优化版）
 * @param {Object} item - 目录项对象，包含 element 属性
 * 
 * 优化：添加节流，避免快速点击多次触发滚动
 */
const scrollToQuestionImpl = function (item) {
  console.log('[CGTD] scrollToQuestion called', item);
  
  if (!item || !item.element) {
    console.warn('[CGTD] scrollToQuestion: item or element is missing');
    return;
  }

  const element = item.element;
  
  // 检查元素是否有效
  if (!element || typeof element.getBoundingClientRect !== 'function') {
    console.warn('[CGTD] scrollToQuestion: element is invalid');
    return;
  }

  console.log('[CGTD] Scrolling to element:', element);

  // 顶部对齐（带偏移），确保用户能看到问题起始位置，而不是中间片段
  scrollElementToTopWithOffset(element, SCROLL_TOP_OFFSET);

  // Wait briefly for smooth scrolling to settle, then highlight target.
  setTimeout(() => {
    flashTarget(element);
  }, 450);
};

// ✅ 导出节流后的函数（300ms 节流）
window.CGTD.scrollToQuestion = throttle(scrollToQuestionImpl, 300);

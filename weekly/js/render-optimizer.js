// ════════════════════════════════════════════════════
// render-optimizer.js — 轻量级渲染优化（无需外部依赖）
// ════════════════════════════════════════════════════

/**
 * 智能渲染优化器
 *
 * 功能：
 * 1. 检测内容是否真的变化，避免无意义的 DOM 更新
 * 2. 使用 DocumentFragment 批量更新，减少重排
 * 3. 缓存上次渲染的 HTML，快速对比
 */

let _lastRenderedHTML = {};

/**
 * 优化的渲染函数
 * @param {string} containerId - 容器元素 ID
 * @param {string} newHTML - 新的 HTML 内容
 * @param {boolean} force - 是否强制更新
 */
function smartRender(containerId, newHTML, force = false) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // 检查内容是否真的变化
  if (!force && _lastRenderedHTML[containerId] === newHTML) {
    console.log(`[Render] ${containerId} 内容未变化，跳过渲染`);
    return;
  }

  // 使用 requestAnimationFrame 优化渲染时机
  requestAnimationFrame(() => {
    container.innerHTML = newHTML;
    _lastRenderedHTML[containerId] = newHTML;
  });
}

/**
 * 批量更新多个元素（减少重排）
 * @param {Array} updates - [{id, html}, ...]
 */
function batchRender(updates) {
  requestAnimationFrame(() => {
    updates.forEach(({id, html}) => {
      const el = document.getElementById(id);
      if (el && _lastRenderedHTML[id] !== html) {
        el.innerHTML = html;
        _lastRenderedHTML[id] = html;
      }
    });
  });
}

/**
 * 清除渲染缓存（用于强制刷新）
 */
function clearRenderCache() {
  _lastRenderedHTML = {};
}

/**
 * 局部更新：只更新变化的卡片
 * @param {string} containerId - 容器 ID
 * @param {Array} items - 数据项数组
 * @param {Function} renderFn - 渲染函数 (item) => html
 * @param {Function} keyFn - 获取唯一 key 的函数 (item) => key
 */
function renderList(containerId, items, renderFn, keyFn) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const existingKeys = new Set(
    Array.from(container.children).map(el => el.dataset.key)
  );

  const newKeys = new Set(items.map(keyFn));

  // 删除不存在的元素
  Array.from(container.children).forEach(el => {
    if (!newKeys.has(el.dataset.key)) {
      el.remove();
    }
  });

  // 更新或添加元素
  items.forEach((item, index) => {
    const key = keyFn(item);
    let el = container.querySelector(`[data-key="${key}"]`);

    if (!el) {
      // 新元素
      el = document.createElement('div');
      el.dataset.key = key;
      container.appendChild(el);
    }

    const newHTML = renderFn(item);
    if (el.innerHTML !== newHTML) {
      el.innerHTML = newHTML;
    }

    // 确保顺序正确
    if (container.children[index] !== el) {
      container.insertBefore(el, container.children[index]);
    }
  });
}

// 导出到全局
window.smartRender = smartRender;
window.batchRender = batchRender;
window.clearRenderCache = clearRenderCache;
window.renderList = renderList;

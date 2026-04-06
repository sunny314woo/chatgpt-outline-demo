window.CGTD = window.CGTD || {};

(function () {
  const MAX_PREVIEW_CHARS = 200;

  function normalizeMessageText(raw) {
    if (!raw) return '';
    return raw
      .replace(/\u00a0/g, ' ')
      .replace(/\s*\n+\s*/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function truncateToReadablePreview(text) {
    if (!text) return '';
    if (text.length <= MAX_PREVIEW_CHARS) {
      return text;
    }

    const clipped = text.slice(0, MAX_PREVIEW_CHARS);
    const sentenceStops = ['。', '！', '？', '.', '!', '?'];
    let cutAt = -1;
    for (const stop of sentenceStops) {
      const idx = clipped.lastIndexOf(stop);
      if (idx > cutAt) {
        cutAt = idx;
      }
    }

    // Prefer sentence boundary if it appears in a reasonable tail range.
    if (cutAt >= Math.floor(MAX_PREVIEW_CHARS * 0.6)) {
      return clipped.slice(0, cutAt + 1) + '…';
    }

    return clipped + '…';
  }

  function generate() {
    let pureImageCounter = 0;
    let mixedImageCounter = 0;
    const results = [];
    const articles = document.querySelectorAll('[data-message-author-role="user"]');

    for (let index = 0; index < articles.length; index++) {
      const article = articles[index];
      let text = article.innerText?.trim() || '';
      let isPureMediaItem = false;
      let imageInfoResolved = false;
      let imageCount = 0;
      let hasImage = false;

      function resolveImageInfo() {
        if (imageInfoResolved) return;
        // Keep semantics but avoid querySelectorAll() allocation on every item.
        const images = article.getElementsByTagName('img');
        imageCount = images.length;
        hasImage = imageCount > 0;
        imageInfoResolved = true;
      }

      if (!text) {
        isPureMediaItem = true;
        resolveImageInfo();

        if (hasImage) {
          pureImageCounter++;
          text = imageCount > 1
            ? `📷 Image ${pureImageCounter} x${imageCount}`
            : `📷 Image ${pureImageCounter}`;
        }
      }
      if (!text) continue;

      if (text.startsWith('你说')) {
        text = text.replace(/^你说[:：]\s*/, '');
      }
      const cleaned = normalizeMessageText(text);
      let preview = truncateToReadablePreview(cleaned);

      // 混合图文：在标题前加图片标识，帮助快速识别图文提问
      // - 单图：📷[序号] 文本
      // - 多图：📷[序号]xN 文本
      if (!isPureMediaItem && cleaned) {
        resolveImageInfo();
        if (hasImage) {
          mixedImageCounter++;
          const mixedBadge = imageCount > 1
            ? `📷${mixedImageCounter}x${imageCount}`
            : `📷${mixedImageCounter}`;
          preview = `${mixedBadge} ${preview}`;
        }
      }

      results.push({
        id: index,
        text: preview,
        element: article
      });
    }

    return results;
  }

  window.CGTD.DirectoryEngine = { generate };
})();

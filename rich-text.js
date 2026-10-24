(() => {
  const allowedTags = new Set([
    "a", "b", "blockquote", "br", "em", "h2", "h3", "i", "li", "ol", "p", "s", "strong", "u", "ul",
  ]);
  const droppedTags = new Set(["iframe", "object", "script", "style", "svg", "template"]);

  function safeHref(value) {
    try {
      const url = new URL(value, location.origin);
      return ["http:", "https:", "mailto:"].includes(url.protocol) ? value : null;
    } catch {
      return null;
    }
  }

  function appendSafeNode(source, destination) {
    if (source.nodeType === Node.TEXT_NODE) {
      destination.append(document.createTextNode(source.nodeValue || ""));
      return;
    }
    if (!(source instanceof Element) || droppedTags.has(source.tagName.toLowerCase())) return;

    const tag = source.tagName.toLowerCase();
    const normalizedTag = tag === "div" ? "p" : tag;
    const target = allowedTags.has(normalizedTag)
      ? document.createElement(normalizedTag)
      : destination;
    if (target !== destination && normalizedTag === "a") {
      const href = safeHref(source.getAttribute("href") || "");
      if (href) target.setAttribute("href", href);
      const title = source.getAttribute("title");
      if (title) target.setAttribute("title", title);
    }
    for (const child of source.childNodes) appendSafeNode(child, target);
    if (target !== destination) destination.append(target);
  }

  function createFragment(value) {
    const markup = typeof value === "string" ? value : "";
    const parsed = new DOMParser().parseFromString(markup, "text/html");
    parsed.body.querySelectorAll([...droppedTags].join(",")).forEach((element) => element.remove());
    const hasRichMarkup = [...parsed.body.querySelectorAll("*")]
      .some((element) => allowedTags.has(element.tagName.toLowerCase()));
    const fragment = document.createDocumentFragment();

    if (!hasRichMarkup) {
      const paragraphs = parsed.body.textContent.split(/\r?\n\s*\r?\n/).filter((paragraph) => paragraph.trim());
      for (const paragraph of paragraphs) {
        const element = document.createElement("p");
        const lines = paragraph.split(/\r?\n/);
        lines.forEach((line, index) => {
          if (index > 0) element.append(document.createElement("br"));
          element.append(document.createTextNode(line));
        });
        fragment.append(element);
      }
      return fragment;
    }

    for (const child of parsed.body.childNodes) appendSafeNode(child, fragment);
    return fragment;
  }

  function toHtml(value) {
    const container = document.createElement("div");
    container.append(createFragment(value));
    return container.innerHTML;
  }

  function toText(value) {
    const container = document.createElement("div");
    container.append(createFragment(value));
    return [...container.childNodes]
      .map((node) => node.textContent || "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  window.ArticleRichText = Object.freeze({ createFragment, toHtml, toText });
})();

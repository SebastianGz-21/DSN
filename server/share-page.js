const fallbackImage = "/assets/quienes-somos.png";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]);
}

function replaceMarkedMeta(html, marker, value) {
  const markerAttribute = `data-share-meta="${marker}"`;
  const markerIndex = html.indexOf(markerAttribute);
  if (markerIndex === -1) throw new Error(`No se encontró el metadato ${marker}.`);

  const tagStart = html.lastIndexOf("<meta", markerIndex);
  const tagEnd = html.indexOf(">", markerIndex);
  const tag = html.slice(tagStart, tagEnd + 1);
  const updatedTag = tag.replace(/content="[^"]*"/, `content="${escapeHtml(value)}"`);
  return `${html.slice(0, tagStart)}${updatedTag}${html.slice(tagEnd + 1)}`;
}

function replaceCanonicalLink(html, value) {
  const marker = 'data-share-canonical="true"';
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) throw new Error("No se encontró el enlace canonical.");

  const tagStart = html.lastIndexOf("<link", markerIndex);
  const tagEnd = html.indexOf(">", markerIndex);
  const tag = html.slice(tagStart, tagEnd + 1);
  const updatedTag = tag.replace(/href="[^"]*"/, `href="${escapeHtml(value)}"`);
  return `${html.slice(0, tagStart)}${updatedTag}${html.slice(tagEnd + 1)}`;
}

function renderArticleSharePage(template, article, pageUrl) {
  const url = new URL(pageUrl);
  const imagePath = typeof article.image_path === "string"
      && article.image_path.startsWith("/assets/")
      && !article.image_path.startsWith("//")
    ? article.image_path
    : fallbackImage;
  const imageUrl = new URL(imagePath, url.origin).href;
  const description = article.summary || "Leé esta noticia en Del Salado Noticias.";
  let html = template.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(article.title)} | Del Salado Noticias</title>`);

  html = replaceMarkedMeta(html, "description", description);
  html = replaceMarkedMeta(html, "og:type", "article");
  html = replaceMarkedMeta(html, "og:title", `${article.title} | Del Salado Noticias`);
  html = replaceMarkedMeta(html, "og:description", description);
  html = replaceMarkedMeta(html, "og:url", url.href);
  html = replaceMarkedMeta(html, "og:image", imageUrl);
  html = replaceMarkedMeta(html, "og:image:alt", article.image_alt || article.title);
  html = replaceMarkedMeta(html, "twitter:title", `${article.title} | Del Salado Noticias`);
  html = replaceMarkedMeta(html, "twitter:description", description);
  html = replaceMarkedMeta(html, "twitter:image", imageUrl);
  return replaceCanonicalLink(html, url.href);
}

function createSharePageRouter(express, pool, template) {
  const router = express.Router();
  router.get(["/", "/index.html"], async (req, res) => {
    const slug = req.query.noticia;
    if (typeof slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return res.type("html").send(template);
    }

    const [articles] = await pool.execute(
      `SELECT a.title, a.summary, m.storage_path AS image_path, m.alt_text AS image_alt
       FROM articles AS a
       INNER JOIN article_statuses AS s ON s.id = a.status_id
       LEFT JOIN media AS m ON m.id = a.featured_media_id
       WHERE a.slug = ?
         AND s.slug = 'published'
         AND a.published_at IS NOT NULL
         AND a.published_at <= UTC_TIMESTAMP()
       LIMIT 1`,
      [slug],
    );
    if (!articles[0]) return res.type("html").send(template);

    const pageUrl = new URL(req.originalUrl, `${req.protocol}://${req.get("host")}`);
    return res.type("html").send(renderArticleSharePage(template, articles[0], pageUrl));
  });
  return router;
}

module.exports = { createSharePageRouter, renderArticleSharePage };

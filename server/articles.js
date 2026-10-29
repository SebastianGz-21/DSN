const sanitizeHtml = require("sanitize-html");

const slugify = (value) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

function sanitizeArticleBody(value) {
  return sanitizeHtml(value, {
    allowedTags: ["a", "b", "blockquote", "br", "em", "h2", "h3", "i", "li", "ol", "p", "s", "strong", "u", "ul"],
    allowedAttributes: { a: ["href", "title"] },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    transformTags: { div: "p" },
  }).trim();
}

const articleSelect = `
  SELECT a.id, a.title, a.slug, a.summary, a.body, a.is_featured,
         a.views_count, a.published_at, a.created_at, a.updated_at,
         c.slug AS category_slug, c.name AS category_name,
         s.slug AS status, u.username AS author,
         m.storage_path AS image_path, m.alt_text AS image_alt
  FROM articles AS a
  INNER JOIN categories AS c ON c.id = a.category_id
  INNER JOIN article_statuses AS s ON s.id = a.status_id
  INNER JOIN users AS u ON u.id = a.author_id
  LEFT JOIN media AS m ON m.id = a.featured_media_id
`;

function isValidDate(value) {
  return (typeof value === "string" || value instanceof Date) && !Number.isNaN(Date.parse(value));
}

function validateArticle(input, { partial = false, authorOnly = false } = {}) {
  const errors = [];
  const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const allowedFields = new Set([
    "title", "slug", "summary", "body", "category", "status",
    "published_at", "is_featured", "featured_media_id", "gallery_media_ids",
  ]);
  for (const key of Object.keys(body)) {
    if (!allowedFields.has(key)) errors.push(`Campo no permitido: ${key}.`);
  }

  const title = body.title;
  const content = body.body;
  const category = body.category;
  const status = body.status;
  const summary = body.summary;
  const slug = body.slug;
  const cleanContent = typeof content === "string" ? sanitizeArticleBody(content) : undefined;
  const contentText = cleanContent === undefined
    ? ""
    : sanitizeHtml(cleanContent, { allowedTags: [], allowedAttributes: {} }).replace(/&nbsp;/gi, " ").trim();

  if ((!partial || title !== undefined) && (typeof title !== "string" || !title.trim() || title.trim().length > 220)) {
    errors.push("El título es obligatorio y admite hasta 220 caracteres.");
  }
  if ((!partial || content !== undefined)
      && (typeof content !== "string" || content.length > 100_000 || !contentText)) {
    errors.push("El contenido es obligatorio, admite hasta 100.000 caracteres y debe incluir texto.");
  }
  if ((!partial || category !== undefined) && (typeof category !== "string" || !/^[a-z0-9-]{1,80}$/.test(category))) {
    errors.push("Elegí una categoría válida.");
  }
  if (summary !== undefined && summary !== null && (typeof summary !== "string" || summary.length > 500)) {
    errors.push("El resumen admite hasta 500 caracteres.");
  }
  if (slug !== undefined && (typeof slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 240)) {
    errors.push("El slug solo puede contener letras, números y guiones.");
  }
  if (status !== undefined && !["draft", "scheduled", "published", "archived"].includes(status)) {
    errors.push("Elegí un estado válido.");
  }
  if (body.published_at !== undefined && body.published_at !== null && !isValidDate(body.published_at)) {
    errors.push("La fecha de publicación no es válida.");
  }
  if (body.is_featured !== undefined && typeof body.is_featured !== "boolean") {
    errors.push("is_featured debe ser verdadero o falso.");
  }
  if (body.featured_media_id !== undefined
      && body.featured_media_id !== null
      && (!Number.isSafeInteger(body.featured_media_id) || body.featured_media_id <= 0)) {
    errors.push("La imagen seleccionada no es válida.");
  }
  if (body.gallery_media_ids !== undefined
      && (!Array.isArray(body.gallery_media_ids)
        || body.gallery_media_ids.length > 20
        || body.gallery_media_ids.some((id) => !Number.isSafeInteger(id) || id <= 0)
        || new Set(body.gallery_media_ids).size !== body.gallery_media_ids.length)) {
    errors.push("La galería admite hasta 20 imágenes distintas y válidas.");
  }
  if (authorOnly && status !== undefined && status !== "draft") {
    errors.push("Los autores solo pueden guardar noticias como borrador.");
  }

  return {
    errors,
    value: {
      title: typeof title === "string" ? title.trim() : undefined,
      slug: typeof slug === "string" ? slug : undefined,
      summary: typeof summary === "string" ? summary.trim() || null : summary,
      body: cleanContent,
      category,
      status,
      publishedAt: body.published_at,
      isFeatured: body.is_featured,
      featuredMediaId: body.featured_media_id,
      galleryMediaIds: body.gallery_media_ids,
    },
  };
}

async function validateGalleryMedia(pool, ids) {
  if (!ids?.length) return true;
  const placeholders = ids.map(() => "?").join(", ");
  const [rows] = await pool.execute(`SELECT id FROM media WHERE id IN (${placeholders})`, ids);
  return rows.length === ids.length;
}

async function replaceArticleGallery(pool, articleId, mediaIds = []) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute("DELETE FROM article_gallery WHERE article_id = ?", [articleId]);
    for (const [position, mediaId] of mediaIds.entries()) {
      await connection.execute(
        "INSERT INTO article_gallery (article_id, media_id, position) VALUES (?, ?, ?)",
        [articleId, mediaId, position],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function findCategoryAndStatus(pool, categorySlug, statusSlug) {
  const [[categoryRows], [statusRows]] = await Promise.all([
    pool.execute("SELECT id FROM categories WHERE slug = ? AND is_active = TRUE LIMIT 1", [categorySlug]),
    pool.execute("SELECT id FROM article_statuses WHERE slug = ? LIMIT 1", [statusSlug]),
  ]);
  return { category: categoryRows[0], articleStatus: statusRows[0] };
}

function createArticlesRouter(express, pool, requireAuth) {
  const router = express.Router();

  router.get("/categories", async (_req, res) => {
    const [categories] = await pool.execute(
      "SELECT slug, name, menu_order FROM categories WHERE is_active = TRUE ORDER BY menu_order, name",
    );
    return res.json({ categories });
  });

  router.get("/articles", async (req, res) => {
    const category = typeof req.query.category === "string" ? req.query.category : null;
    const view = typeof req.query.view === "string" ? req.query.view : "latest";
    const limit = Number(req.query.limit || 50);
    if (category && !/^[a-z0-9-]{1,80}$/.test(category)) {
      return res.status(400).json({ error: "La categoría no es válida." });
    }
    if (!["latest", "featured"].includes(view)) {
      return res.status(400).json({ error: "La vista debe ser latest o featured." });
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({ error: "El límite debe estar entre 1 y 100." });
    }

    const values = [];
    let categoryCondition = "";
    if (category) {
      categoryCondition = " AND c.slug = ?";
      values.push(category);
    }
    const order = view === "featured"
      ? "a.views_count DESC, a.published_at DESC, a.id DESC"
      : "a.published_at DESC, a.id DESC";
    const featuredCondition = view === "featured" ? " AND a.is_featured = TRUE" : "";
    values.push(limit);
    const [articles] = await pool.execute(
      `${articleSelect}
       WHERE s.slug = 'published'
         AND a.published_at IS NOT NULL
         AND a.published_at <= UTC_TIMESTAMP()
         ${featuredCondition}
         ${categoryCondition}
       ORDER BY ${order}
       LIMIT ?`,
      values,
    );
    return res.json({ articles });
  });

  router.get("/articles/:slug", async (req, res) => {
    const [result] = await pool.execute(
      `UPDATE articles AS a
       INNER JOIN article_statuses AS s ON s.id = a.status_id
       SET a.views_count = a.views_count + 1
       WHERE a.slug = ?
         AND s.slug = 'published'
         AND a.published_at IS NOT NULL
         AND a.published_at <= UTC_TIMESTAMP()`,
      [req.params.slug],
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "No se encontró la noticia publicada." });
    }

    const [articles] = await pool.execute(
      `${articleSelect}
       WHERE a.slug = ?
         AND s.slug = 'published'
         AND a.published_at <= UTC_TIMESTAMP()
       LIMIT 1`,
      [req.params.slug],
    );
    const [gallery] = await pool.execute(
      `SELECT m.id, m.storage_path AS image_path, m.alt_text AS image_alt
       FROM article_gallery AS g
       INNER JOIN media AS m ON m.id = g.media_id
       WHERE g.article_id = ?
       ORDER BY g.position, g.id`,
      [articles[0].id],
    );
    articles[0].gallery = gallery;
    return res.json({ article: articles[0] });
  });

  router.use("/admin", requireAuth);

  router.get("/admin/articles", async (req, res) => {
    const isAuthor = req.session.user.role === "author";
    const authorCondition = isAuthor ? "AND a.author_id = ? AND s.slug = 'draft'" : "";
    const values = isAuthor ? [req.session.user.id] : [];
    const [articles] = await pool.execute(
      `${articleSelect}
       WHERE 1 = 1 ${authorCondition}
       ORDER BY a.updated_at DESC, a.id DESC
       LIMIT 200`,
      values,
    );
    if (articles.length) {
      const placeholders = articles.map(() => "?").join(", ");
      const [gallery] = await pool.execute(
        `SELECT article_id, media_id
         FROM article_gallery
         WHERE article_id IN (${placeholders})
         ORDER BY position, id`,
        articles.map((article) => article.id),
      );
      const mediaByArticle = new Map();
      for (const item of gallery) {
        const ids = mediaByArticle.get(item.article_id) || [];
        ids.push(item.media_id);
        mediaByArticle.set(item.article_id, ids);
      }
      for (const article of articles) article.gallery_media_ids = mediaByArticle.get(article.id) || [];
    }
    return res.json({ articles });
  });

  router.post("/admin/articles", async (req, res) => {
    const authorId = req.session.user?.id;
    if (authorId === undefined || authorId === null) {
      return res.status(401).json({ error: "La sesión no contiene un usuario válido. Volvé a iniciar sesión." });
    }

    const authorOnly = req.session.user.role === "author";
    const { errors, value } = validateArticle(req.body, { authorOnly });
    if (errors.length) return res.status(400).json({ error: errors.join(" ") });
    if (!(await validateGalleryMedia(pool, value.galleryMediaIds))) {
      return res.status(400).json({ error: "Una o más imágenes de la galería no existen." });
    }

    const status = authorOnly ? "draft" : value.status || "draft";
    const publishedAt = value.publishedAt
      ? new Date(value.publishedAt)
      : status === "published" ? new Date() : null;
    if (status === "scheduled" && (!publishedAt || Date.parse(publishedAt) <= Date.now())) {
      return res.status(400).json({ error: "Una noticia programada requiere una fecha futura." });
    }
    if (status === "published" && publishedAt && Date.parse(publishedAt) > Date.now()) {
      return res.status(400).json({ error: "La fecha de publicación todavía no llegó." });
    }

    const { category, articleStatus } = await findCategoryAndStatus(pool, value.category, status);
    if (category?.id === undefined) {
      return res.status(400).json({ error: `La categoría "${value.category}" no existe o está inactiva.` });
    }
    if (articleStatus?.id === undefined) {
      return res.status(400).json({ error: `El estado "${status}" no existe en la base de datos.` });
    }
    if (value.featuredMediaId) {
      const [media] = await pool.execute("SELECT id FROM media WHERE id = ? LIMIT 1", [value.featuredMediaId]);
      if (!media.length) return res.status(400).json({ error: "La imagen seleccionada no existe." });
    }

    const slug = value.slug || slugify(value.title);
    if (!slug) return res.status(400).json({ error: "El título debe generar un slug válido." });
    try {
      const [result] = await pool.execute(
        `INSERT INTO articles
          (category_id, status_id, author_id, updated_by, featured_media_id,
           title, slug, summary, body, is_featured, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          category.id,
          articleStatus.id,
          authorId,
          authorId,
          value.featuredMediaId ?? null,
          value.title,
          slug,
          value.summary ?? null,
          value.body,
          value.isFeatured ?? false,
          publishedAt,
        ],
      );
      await replaceArticleGallery(pool, result.insertId, value.galleryMediaIds || []);
      return res.status(201).json({ id: result.insertId, slug });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Ya existe una noticia con ese slug." });
      throw error;
    }
  });

  router.patch("/admin/articles/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: "El identificador no es válido." });

    const [rows] = await pool.execute(
      `SELECT a.*, s.slug AS status
       FROM articles AS a
       INNER JOIN article_statuses AS s ON s.id = a.status_id
       WHERE a.id = ?
       LIMIT 1`,
      [id],
    );
    const existing = rows[0];
    if (!existing) return res.status(404).json({ error: "No se encontró la noticia." });
    const user = req.session.user;
    const authorOnly = user.role === "author";
    if (authorOnly && (existing.author_id !== user.id || existing.status !== "draft")) {
      return res.status(403).json({ error: "Solo podés editar tus propios borradores." });
    }

    const merged = {
      title: req.body?.title ?? existing.title,
      slug: req.body?.slug ?? existing.slug,
      summary: req.body?.summary !== undefined ? req.body.summary : existing.summary,
      body: req.body?.body ?? existing.body,
      category: req.body?.category,
      status: req.body?.status ?? existing.status,
      published_at: req.body?.published_at !== undefined ? req.body.published_at : existing.published_at,
      is_featured: req.body?.is_featured ?? Boolean(existing.is_featured),
      featured_media_id: req.body?.featured_media_id !== undefined ? req.body.featured_media_id : existing.featured_media_id,
      gallery_media_ids: req.body?.gallery_media_ids,
    };
    if (req.body?.category === undefined) {
      const [categories] = await pool.execute("SELECT slug FROM categories WHERE id = ? LIMIT 1", [existing.category_id]);
      merged.category = categories[0]?.slug;
    }
    const { errors, value } = validateArticle(merged, { authorOnly });
    if (errors.length) return res.status(400).json({ error: errors.join(" ") });
    if (!(await validateGalleryMedia(pool, value.galleryMediaIds))) {
      return res.status(400).json({ error: "Una o más imágenes de la galería no existen." });
    }

    const status = authorOnly ? "draft" : value.status;
    const publishedAt = value.publishedAt
      ? new Date(value.publishedAt)
      : status === "published" ? new Date() : null;
    if (status === "scheduled" && (!publishedAt || Date.parse(publishedAt) <= Date.now())) {
      return res.status(400).json({ error: "Una noticia programada requiere una fecha futura." });
    }
    if (status === "published" && publishedAt && Date.parse(publishedAt) > Date.now()) {
      return res.status(400).json({ error: "La fecha de publicación todavía no llegó." });
    }

    const { category, articleStatus } = await findCategoryAndStatus(pool, value.category, status);
    if (!category || !articleStatus) return res.status(400).json({ error: "La categoría o el estado no existen." });
    if (value.featuredMediaId) {
      const [media] = await pool.execute("SELECT id FROM media WHERE id = ? LIMIT 1", [value.featuredMediaId]);
      if (!media.length) return res.status(400).json({ error: "La imagen seleccionada no existe." });
    }

    try {
      await pool.execute(
        `UPDATE articles
         SET category_id = ?, status_id = ?, updated_by = ?, featured_media_id = ?,
             title = ?, slug = ?, summary = ?, body = ?, is_featured = ?, published_at = ?
         WHERE id = ?`,
        [
          category.id,
          articleStatus.id,
          user.id,
          value.featuredMediaId ?? null,
          value.title,
          value.slug,
          value.summary ?? null,
          value.body,
          value.isFeatured,
          publishedAt,
          id,
        ],
      );
      if (value.galleryMediaIds !== undefined) {
        await replaceArticleGallery(pool, id, value.galleryMediaIds);
      }
      return res.status(204).end();
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Ya existe una noticia con ese slug." });
      throw error;
    }
  });

  router.delete("/admin/articles/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: "El identificador no es válido." });
    const user = req.session.user;
    const [result] = user.role === "author"
      ? await pool.execute(
          `DELETE a FROM articles AS a
           INNER JOIN article_statuses AS s ON s.id = a.status_id
           WHERE a.id = ? AND a.author_id = ? AND s.slug = 'draft'`,
          [id, user.id],
        )
      : await pool.execute("DELETE FROM articles WHERE id = ?", [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "No se encontró una noticia que puedas eliminar." });
    return res.status(204).end();
  });

  return router;
}

module.exports = {
  createArticlesRouter,
  findCategoryAndStatus,
  replaceArticleGallery,
  sanitizeArticleBody,
  slugify,
  validateArticle,
  validateGalleryMedia,
};

const placements = new Set(["home_banner", "article_banner", "article_sidebar"]);
const allowedFields = new Set([
  "title", "image_path", "target_url", "alt_text", "placement",
  "starts_at", "ends_at", "is_active",
]);

function validateAd(input, { partial = false } = {}) {
  const errors = [];
  const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  for (const key of Object.keys(body)) {
    if (!allowedFields.has(key)) errors.push(`Campo no permitido: ${key}.`);
  }

  const requiredString = (field, label, maxLength) => {
    const value = body[field];
    if ((!partial || value !== undefined)
        && (typeof value !== "string" || !value.trim() || value.trim().length > maxLength)) {
      errors.push(`${label} es obligatorio y admite hasta ${maxLength} caracteres.`);
    }
  };
  requiredString("image_path", "La ruta de la imagen", 500);
  requiredString("target_url", "El enlace de destino", 2048);
  requiredString("placement", "La ubicación", 40);

  if (body.title !== undefined && (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 160)) {
    errors.push("El nombre del anuncio es obligatorio y admite hasta 160 caracteres.");
  }
  if (body.image_path !== undefined
      && (typeof body.image_path !== "string"
        || !/^\/assets\/[a-zA-Z0-9._/-]+$/.test(body.image_path)
        || body.image_path.includes(".."))) {
    errors.push("La imagen debe estar dentro de /assets.");
  }
  if (body.target_url !== undefined && (typeof body.target_url !== "string" || !isSafeTargetUrl(body.target_url))) {
    errors.push("El enlace debe ser una dirección HTTPS o una ruta interna del sitio.");
  }
  if (body.placement !== undefined && (typeof body.placement !== "string" || !placements.has(body.placement))) {
    errors.push("Elegí una ubicación válida.");
  }
  if (body.alt_text !== undefined && body.alt_text !== null
      && (typeof body.alt_text !== "string" || body.alt_text.length > 255)) {
    errors.push("El texto alternativo admite hasta 255 caracteres.");
  }
  if (body.is_active !== undefined && typeof body.is_active !== "boolean") {
    errors.push("is_active debe ser verdadero o falso.");
  }

  const validateDate = (field, label, nullable = false) => {
    const value = body[field];
    if (value === undefined && partial) return;
    if (nullable && (value === null || value === "")) return;
    if (!(typeof value === "string" || value instanceof Date) || Number.isNaN(Date.parse(value))) {
      errors.push(`${label} no es válida.`);
    }
  };
  validateDate("starts_at", "La fecha de inicio");
  validateDate("ends_at", "La fecha de fin", true);

  const start = body.starts_at === undefined ? null : Date.parse(body.starts_at);
  const end = body.ends_at === undefined || body.ends_at === null || body.ends_at === ""
    ? null
    : Date.parse(body.ends_at);
  if (start !== null && end !== null && end <= start) {
    errors.push("La fecha de fin debe ser posterior a la fecha de inicio.");
  }

  return {
    errors,
    value: {
      title: typeof body.title === "string" ? body.title.trim() : undefined,
      image_path: body.image_path,
      target_url: typeof body.target_url === "string" ? body.target_url.trim() : undefined,
      alt_text: typeof body.alt_text === "string" ? body.alt_text.trim() || null : body.alt_text,
      placement: body.placement,
      starts_at: body.starts_at,
      ends_at: body.ends_at === "" ? null : body.ends_at,
      is_active: body.is_active,
    },
  };
}

function isSafeTargetUrl(value) {
  const url = value.trim();
  if (/[\u0000-\u001f\\]/.test(url)) return false;
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

function createAdsRouter(express, pool, requireAuth) {
  const router = express.Router();

  router.get("/ads", async (req, res) => {
    const placement = typeof req.query.placement === "string" ? req.query.placement : null;
    if (placement && !placements.has(placement)) {
      return res.status(400).json({ error: "Elegí una ubicación válida." });
    }
    const values = placement ? [placement] : [];
    const placementFilter = placement ? "AND placement = ?" : "";
    const [ads] = await pool.execute(
      `SELECT id, title, image_path, target_url, alt_text, placement,
              starts_at, ends_at, impressions_count, clicks_count
       FROM ad_campaigns
       WHERE is_active = TRUE
         AND starts_at <= UTC_TIMESTAMP()
         AND (ends_at IS NULL OR ends_at > UTC_TIMESTAMP())
         ${placementFilter}
       ORDER BY id`,
      values,
    );
    return res.json({ ads });
  });

  router.post("/ads/:id/:event", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ error: "El identificador del anuncio no es válido." });
    }
    const column = req.params.event === "impression"
      ? "impressions_count"
      : req.params.event === "click" ? "clicks_count" : null;
    if (!column) return res.status(404).json({ error: "No se encontró esa métrica." });
    const [result] = await pool.execute(
      `UPDATE ad_campaigns
       SET ${column} = ${column} + 1
       WHERE id = ? AND is_active = TRUE
         AND starts_at <= UTC_TIMESTAMP()
         AND (ends_at IS NULL OR ends_at > UTC_TIMESTAMP())`,
      [id],
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "El anuncio no está disponible." });
    return res.status(204).end();
  });

  router.use("/admin/ads", requireAuth, (req, res, next) => {
    if (req.session.user.role !== "admin") {
      return res.status(403).json({ error: "Solo administradores pueden gestionar publicidad." });
    }
    return next();
  });

  router.get("/admin/ads", async (_req, res) => {
    const [ads] = await pool.execute(
      `SELECT id, title, image_path, target_url, alt_text, placement, starts_at, ends_at,
              is_active, impressions_count, clicks_count, created_at, updated_at
       FROM ad_campaigns
       ORDER BY is_active DESC, starts_at DESC, id DESC`,
    );
    return res.json({ ads });
  });

  router.post("/admin/ads", async (req, res) => {
    const { errors, value } = validateAd(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(" ") });
    const [result] = await pool.execute(
      `INSERT INTO ad_campaigns
        (title, image_path, target_url, alt_text, placement, starts_at, ends_at, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        value.title, value.image_path, value.target_url, value.alt_text,
        value.placement, new Date(value.starts_at), value.ends_at ? new Date(value.ends_at) : null,
        value.is_active ?? true,
      ],
    );
    return res.status(201).json({ id: result.insertId });
  });

  router.patch("/admin/ads/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ error: "El identificador del anuncio no es válido." });
    }
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({ error: "El anuncio debe enviarse como un objeto JSON." });
    }
    const patchBody = req.body;
    const unknownFields = Object.keys(patchBody).filter((field) => !allowedFields.has(field));
    if (unknownFields.length) {
      return res.status(400).json({ error: `Campo no permitido: ${unknownFields.join(", ")}.` });
    }
    const [rows] = await pool.execute("SELECT * FROM ad_campaigns WHERE id = ? LIMIT 1", [id]);
    const existing = rows[0];
    if (!existing) return res.status(404).json({ error: "No se encontró el anuncio." });
    const merged = {
      title: patchBody.title ?? existing.title,
      image_path: patchBody.image_path ?? existing.image_path,
      target_url: patchBody.target_url ?? existing.target_url,
      alt_text: patchBody.alt_text !== undefined ? patchBody.alt_text : existing.alt_text,
      placement: patchBody.placement ?? existing.placement,
      starts_at: patchBody.starts_at ?? existing.starts_at,
      ends_at: patchBody.ends_at !== undefined ? patchBody.ends_at : existing.ends_at,
      is_active: patchBody.is_active ?? Boolean(existing.is_active),
    };
    const { errors, value } = validateAd(merged);
    if (errors.length) return res.status(400).json({ error: errors.join(" ") });
    await pool.execute(
      `UPDATE ad_campaigns
       SET title = ?, image_path = ?, target_url = ?, alt_text = ?, placement = ?,
           starts_at = ?, ends_at = ?, is_active = ?
       WHERE id = ?`,
      [
        value.title, value.image_path, value.target_url, value.alt_text,
        value.placement, new Date(value.starts_at), value.ends_at ? new Date(value.ends_at) : null,
        value.is_active, id,
      ],
    );
    return res.status(204).end();
  });

  router.delete("/admin/ads/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ error: "El identificador del anuncio no es válido." });
    }
    const [result] = await pool.execute("DELETE FROM ad_campaigns WHERE id = ?", [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "No se encontró el anuncio." });
    return res.status(204).end();
  });

  return router;
}

module.exports = { createAdsRouter, isSafeTargetUrl, validateAd };

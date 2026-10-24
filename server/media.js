const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const multer = require("multer");

const allowedTypes = new Map([
  ["image/jpeg", { extension: ".jpg", signatures: [(buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff] }],
  ["image/png", { extension: ".png", signatures: [(buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))] }],
  ["image/webp", { extension: ".webp", signatures: [(buffer) => buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP"] }],
  ["image/gif", { extension: ".gif", signatures: [(buffer) => ["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6))] }],
]);

function matchesImageSignature(file) {
  const imageType = allowedTypes.get(file.mimetype);
  return Boolean(imageType?.signatures.some((matches) => matches(file.buffer)));
}

function createMediaRouter(express, pool, requireAuth, uploadRoot) {
  const router = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 2 },
    fileFilter: (_req, file, callback) => {
      if (!allowedTypes.has(file.mimetype)) {
        return callback(new Error("Formato no permitido. Usá JPG, PNG, WebP o GIF."));
      }
      return callback(null, true);
    },
  });

  router.use(requireAuth);

  router.get("/", async (_req, res) => {
    const [media] = await pool.execute(
      `SELECT id, storage_path, original_filename, mime_type,
              file_size_bytes, alt_text, created_at
       FROM media
       ORDER BY created_at DESC, id DESC
       LIMIT 100`,
    );
    return res.json({ media });
  });

  router.patch("/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ error: "El identificador de la imagen no es válido." });
    }
    const altText = req.body?.alt_text;
    if (altText !== null && (typeof altText !== "string" || altText.length > 255)) {
      return res.status(400).json({ error: "El texto alternativo admite hasta 255 caracteres." });
    }
    const normalizedAltText = typeof altText === "string" ? altText.trim() || null : null;
    const [result] = await pool.execute(
      "UPDATE media SET alt_text = ? WHERE id = ?",
      [normalizedAltText, id],
    );
    if (result.affectedRows === 0) {
      const [rows] = await pool.execute("SELECT id FROM media WHERE id = ? LIMIT 1", [id]);
      if (!rows.length) return res.status(404).json({ error: "No se encontró la imagen." });
    }
    return res.json({ id, alt_text: normalizedAltText });
  });

  router.post("/upload", (req, res, next) => {
    upload.single("image")(req, res, (error) => {
      if (!error) return next();
      if (error instanceof multer.MulterError) {
        const isOversized = error.code === "LIMIT_FILE_SIZE";
        return res.status(isOversized ? 413 : 400).json({
          error: isOversized ? "La imagen supera el máximo de 5 MB." : "No se pudo procesar la imagen.",
        });
      }
      if (error.message === "Formato no permitido. Usá JPG, PNG, WebP o GIF.") {
        return res.status(400).json({ error: error.message });
      }
      return next(error);
    });
  }, async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Seleccioná una imagen para subir." });

    const imageType = allowedTypes.get(file.mimetype);
    if (!matchesImageSignature(file)) {
      return res.status(400).json({ error: "El archivo no coincide con el formato de imagen declarado." });
    }

    const altText = typeof req.body?.alt_text === "string" ? req.body.alt_text.trim() : "";
    if (altText.length > 255) return res.status(400).json({ error: "El texto alternativo admite hasta 255 caracteres." });

    const filename = `${crypto.randomUUID()}${imageType.extension}`;
    const storagePath = `/assets/uploads/${filename}`;
    const destination = path.join(uploadRoot, filename);
    await fs.mkdir(uploadRoot, { recursive: true });
    await fs.writeFile(destination, file.buffer, { flag: "wx" });

    try {
      const [result] = await pool.execute(
        `INSERT INTO media
          (uploaded_by, storage_path, original_filename, mime_type, file_size_bytes, alt_text)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          req.session.user.id,
          storagePath,
          path.basename(file.originalname).slice(0, 255) || filename,
          file.mimetype,
          file.size,
          altText || null,
        ],
      );
      return res.status(201).json({
        media: {
          id: result.insertId,
          storage_path: storagePath,
          original_filename: path.basename(file.originalname).slice(0, 255) || filename,
          mime_type: file.mimetype,
          file_size_bytes: file.size,
          alt_text: altText || null,
        },
      });
    } catch (error) {
      await fs.unlink(destination).catch((cleanupError) => {
        console.error("No se pudo quitar una imagen que falló al guardar:", cleanupError);
      });
      throw error;
    }
  });

  return router;
}

module.exports = { allowedTypes, createMediaRouter, matchesImageSignature };

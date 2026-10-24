const bcrypt = require("bcryptjs");

const roles = new Set(["admin", "editor", "author"]);

function validateUser(input, { partial = false } = {}) {
  const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const allowedFields = new Set(["username", "email", "role", "password", "is_active"]);
  const errors = [];

  for (const field of Object.keys(body)) {
    if (!allowedFields.has(field)) errors.push(`Campo no permitido: ${field}.`);
  }
  if ((!partial || body.username !== undefined)
      && (typeof body.username !== "string" || !/^[a-zA-Z0-9_.-]{3,50}$/.test(body.username.trim()))) {
    errors.push("El usuario debe tener entre 3 y 50 caracteres alfanuméricos, punto, guion o guion bajo.");
  }
  if ((!partial || body.email !== undefined)
      && (typeof body.email !== "string" || body.email.trim().length > 254
        || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()))) {
    errors.push("Ingresá una dirección de correo válida de hasta 254 caracteres.");
  }
  if ((!partial || body.role !== undefined) && (typeof body.role !== "string" || !roles.has(body.role))) {
    errors.push("Elegí un rol válido.");
  }
  if ((!partial || body.password !== undefined)
      && (typeof body.password !== "string" || body.password.length < 12 || body.password.length > 1024)) {
    errors.push("La contraseña debe tener entre 12 y 1024 caracteres.");
  }
  if (body.is_active !== undefined && typeof body.is_active !== "boolean") {
    errors.push("is_active debe ser verdadero o falso.");
  }

  return {
    errors,
    value: {
      username: typeof body.username === "string" ? body.username.trim() : undefined,
      email: typeof body.email === "string" ? body.email.trim().toLowerCase() : undefined,
      role: body.role,
      password: body.password,
      isActive: body.is_active,
    },
  };
}

function createUsersRouter(express, pool, requireAuth) {
  const router = express.Router();
  router.use(requireAuth, (req, res, next) => {
    if (req.session.user.role !== "admin") {
      return res.status(403).json({ error: "Solo un administrador puede gestionar usuarios." });
    }
    return next();
  });

  router.get("/", async (_req, res) => {
    const [users] = await pool.execute(
      `SELECT u.id, u.username, u.email, u.is_active, u.last_login_at, u.created_at,
              r.slug AS role, r.name AS role_name
       FROM users AS u
       INNER JOIN roles AS r ON r.id = u.role_id
       ORDER BY u.is_active DESC, u.username`,
    );
    return res.json({ users });
  });

  router.post("/", async (req, res) => {
    const { errors, value } = validateUser(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(" ") });

    const [roleRows] = await pool.execute("SELECT id FROM roles WHERE slug = ? LIMIT 1", [value.role]);
    const role = roleRows[0];
    if (!role) return res.status(400).json({ error: "El rol seleccionado no existe en la base de datos." });

    const passwordHash = await bcrypt.hash(value.password, 12);
    try {
      const [result] = await pool.execute(
        `INSERT INTO users (role_id, username, email, password_hash)
         VALUES (?, ?, ?, ?)`,
        [role.id, value.username, value.email, passwordHash],
      );
      return res.status(201).json({ id: result.insertId });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ error: "Ya existe un usuario con ese nombre o correo." });
      }
      throw error;
    }
  });

  router.patch("/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ error: "El identificador del usuario no es válido." });
    }

    const { errors, value } = validateUser(req.body, { partial: true });
    if (errors.length) return res.status(400).json({ error: errors.join(" ") });
    if (!Object.keys(req.body || {}).length) {
      return res.status(400).json({ error: "Indicá al menos un dato para actualizar." });
    }

    const [currentRows] = await pool.execute(
      `SELECT u.id, u.role_id, u.is_active, r.slug AS role
       FROM users AS u INNER JOIN roles AS r ON r.id = u.role_id
       WHERE u.id = ? LIMIT 1`,
      [id],
    );
    const current = currentRows[0];
    if (!current) return res.status(404).json({ error: "No se encontró el usuario." });
    const isCurrentUser = Number(req.session.user.id) === id;

    if (isCurrentUser && (value.role !== undefined && value.role !== "admin"
      || value.isActive === false)) {
      return res.status(400).json({ error: "No podés quitarte el rol de administrador ni desactivar tu propio usuario." });
    }
    if (current.role === "admin" && current.is_active && (value.role && value.role !== "admin" || value.isActive === false)) {
      const [activeAdmins] = await pool.execute(
        `SELECT COUNT(*) AS total FROM users AS u
         INNER JOIN roles AS r ON r.id = u.role_id
         WHERE r.slug = 'admin' AND u.is_active = TRUE`,
      );
      if (Number(activeAdmins[0].total) <= 1) {
        return res.status(400).json({ error: "No se puede quitar o desactivar al único administrador activo." });
      }
    }

    let roleId = current.role_id;
    if (value.role !== undefined) {
      const [roleRows] = await pool.execute("SELECT id FROM roles WHERE slug = ? LIMIT 1", [value.role]);
      if (!roleRows[0]) return res.status(400).json({ error: "El rol seleccionado no existe en la base de datos." });
      roleId = roleRows[0].id;
    }

    const fields = [];
    const values = [];
    if (value.username !== undefined) { fields.push("username = ?"); values.push(value.username); }
    if (value.email !== undefined) { fields.push("email = ?"); values.push(value.email); }
    if (value.role !== undefined) { fields.push("role_id = ?"); values.push(roleId); }
    if (value.isActive !== undefined) { fields.push("is_active = ?"); values.push(value.isActive); }
    if (value.password !== undefined) {
      fields.push("password_hash = ?");
      values.push(await bcrypt.hash(value.password, 12));
    }
    values.push(id);

    try {
      await pool.execute(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, values);
      return res.status(204).end();
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ error: "Ya existe un usuario con ese nombre o correo." });
      }
      throw error;
    }
  });

  router.delete("/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ error: "El identificador del usuario no es válido." });
    }
    if (Number(req.session.user.id) === id) {
      return res.status(400).json({ error: "No podés desactivar tu propio usuario." });
    }

    const [users] = await pool.execute(
      `SELECT u.id, u.is_active, r.slug AS role
       FROM users AS u INNER JOIN roles AS r ON r.id = u.role_id
       WHERE u.id = ? LIMIT 1`,
      [id],
    );
    const user = users[0];
    if (!user) return res.status(404).json({ error: "No se encontró el usuario." });
    if (user.role === "admin" && user.is_active) {
      const [activeAdmins] = await pool.execute(
        `SELECT COUNT(*) AS total FROM users AS u
         INNER JOIN roles AS r ON r.id = u.role_id
         WHERE r.slug = 'admin' AND u.is_active = TRUE`,
      );
      if (Number(activeAdmins[0].total) <= 1) {
        return res.status(400).json({ error: "No se puede desactivar al único administrador activo." });
      }
    }

    await pool.execute("UPDATE users SET is_active = FALSE WHERE id = ?", [id]);
    return res.status(204).end();
  });

  return router;
}

module.exports = { createUsersRouter, validateUser };

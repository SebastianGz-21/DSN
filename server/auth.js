const bcrypt = require("bcryptjs");

const sessionDurationMs = 8 * 60 * 60 * 1000;

function createAuthRouter(express, rateLimit, pool) {
  const router = express.Router();
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Demasiados intentos. Esperá unos minutos antes de volver a probar." },
  });

  router.post("/login", loginLimiter, async (req, res) => {
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!username || !password || username.length > 254 || password.length > 1024) {
      return res.status(400).json({ error: "Ingresá usuario y contraseña." });
    }

    const [users] = await pool.execute(
      `SELECT u.id, u.username, u.password_hash, u.is_active, r.slug AS role
       FROM users AS u
       INNER JOIN roles AS r ON r.id = u.role_id
       WHERE u.username = ? OR u.email = ?
       LIMIT 1`,
      [username, username],
    );
    const user = users[0];
    const validPassword = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!user || !user.is_active || !validPassword) {
      return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
    }

    await new Promise((resolve, reject) => {
      req.session.regenerate((error) => error ? reject(error) : resolve());
    });
    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role,
    };
    req.session.cookie.maxAge = sessionDurationMs;
    await new Promise((resolve, reject) => {
      req.session.save((error) => error ? reject(error) : resolve());
    });
    await pool.execute("UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE id = ?", [user.id]);

    return res.json({ user: req.session.user });
  });

  router.post("/logout", (req, res, next) => {
    req.session.destroy((error) => {
      if (error) return next(error);
      res.clearCookie("dsn.sid");
      return res.status(204).end();
    });
  });

  router.get("/me", async (req, res) => {
    if (req.session.user?.id === undefined || req.session.user?.id === null) {
      return res.status(401).json({ error: "La sesión no está iniciada." });
    }
    const [users] = await pool.execute(
      `SELECT u.username, u.is_active, r.slug AS role
       FROM users AS u INNER JOIN roles AS r ON r.id = u.role_id
       WHERE u.id = ? LIMIT 1`,
      [req.session.user.id],
    );
    const user = users[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ error: "Tu usuario está desactivado. Contactá a un administrador." });
    }
    req.session.user.username = user.username;
    req.session.user.role = user.role;
    return res.json({ user: req.session.user });
  });

  return router;
}

module.exports = { createAuthRouter };

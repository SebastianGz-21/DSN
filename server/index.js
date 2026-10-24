const path = require("node:path");
const express = require("express");
const rateLimit = require("express-rate-limit");
const session = require("express-session");
const helmet = require("helmet");
const config = require("./config");
const pool = require("./db");
const MySQLSessionStore = require("./mysql-session-store");
const { createAuthRouter } = require("./auth");
const { createArticlesRouter } = require("./articles");
const { createAdsRouter } = require("./ads");
const { createMediaRouter } = require("./media");
const { createUsersRouter } = require("./users");

const app = express();
const projectRoot = path.resolve(__dirname, "..");
const sessionStore = new MySQLSessionStore(pool);

app.disable("x-powered-by");
app.set("trust proxy", config.trustProxy);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'", "https://api.open-meteo.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "https://fonts.googleapis.com"],
      upgradeInsecureRequests: null,
    },
  },
}));
app.use(express.json({ limit: "1mb" }));
app.use(session({
  name: "dsn.sid",
  secret: config.sessionSecret,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "strict",
    secure: config.environment === "production",
    maxAge: 8 * 60 * 60 * 1000,
  },
}));

const requireAuth = async (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: "Iniciá sesión para acceder al CMS." });
  try {
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
    if (!["admin", "editor", "author"].includes(user.role)) {
      return res.status(403).json({ error: "Tu usuario no tiene permisos para el CMS." });
    }
    req.session.user.username = user.username;
    req.session.user.role = user.role;
    return next();
  } catch (error) {
    return next(error);
  }
};

app.get("/api/health", async (_req, res) => {
  await pool.query("SELECT 1");
  return res.json({ status: "ok", database: "connected" });
});

app.use("/api/auth", createAuthRouter(express, rateLimit, pool));
app.use("/api", createAdsRouter(express, pool, requireAuth));
app.use("/api/admin/media", createMediaRouter(
  express,
  pool,
  requireAuth,
  path.join(projectRoot, "assets", "uploads"),
));
app.use("/api/admin/users", createUsersRouter(express, pool, requireAuth));
app.use("/api", createArticlesRouter(express, pool, requireAuth));

app.get(["/admin", "/admin/"], (_req, res) => res.sendFile(path.join(projectRoot, "admin", "index.html")));
app.use("/admin", express.static(path.join(projectRoot, "admin"), {
  dotfiles: "deny",
  index: false,
  setHeaders: (res) => res.setHeader("Cache-Control", "no-store"),
}));
app.get(["/", "/index.html"], (_req, res) => res.sendFile(path.join(projectRoot, "index.html")));
app.get("/styles.css", (_req, res) => res.sendFile(path.join(projectRoot, "styles.css")));
app.get("/app.js", (_req, res) => res.sendFile(path.join(projectRoot, "app.js")));
app.get("/rich-text.js", (_req, res) => res.sendFile(path.join(projectRoot, "rich-text.js")));
app.use("/assets", express.static(path.join(projectRoot, "assets"), { dotfiles: "deny", index: false }));

app.use("/api", (_req, res) => res.status(404).json({ error: "El endpoint solicitado no existe." }));
app.use((_req, res) => res.status(404).send("No se encontró la página solicitada."));
app.use((error, _req, res, _next) => {
  console.error("Error en la API:", error);
  if (res.headersSent) return;
  return res.status(500).json({ error: "Ocurrió un error interno. Revisá los registros del servidor." });
});

async function start() {
  await pool.query("SELECT 1");
  const server = app.listen(config.port, config.host, () => {
    console.log(`Servidor disponible en ${config.host}:${config.port}`);
  });

  const shutdown = (signal) => {
    console.log(`\n${signal}: cerrando el servidor...`);
    server.close((error) => {
      if (error) console.error("No se pudo cerrar el servidor limpiamente:", error);
      sessionStore.close();
      pool.end().catch((shutdownError) => console.error("No se pudo cerrar el pool MySQL:", shutdownError));
    });
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch((error) => {
  console.error("No se pudo iniciar el backend local:", error.message);
  process.exitCode = 1;
});

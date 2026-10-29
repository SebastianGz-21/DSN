const path = require("node:path");
const os = require("node:os");
const dotenv = require("dotenv");
const { resolveMediaUploadDirectory } = require("./media-storage");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Falta configurar ${name} en el archivo .env.`);
  }
  return value;
}

function positiveInteger(name, fallback) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} debe ser un número entero positivo.`);
  }
  return value;
}

function proxyHopCount(value) {
  if (value === undefined || value.trim() === "" || value.trim() === "0") return 0;
  const hops = Number(value);
  if (!Number.isSafeInteger(hops) || hops < 1) {
    throw new Error("TRUST_PROXY debe ser 0 o un número entero positivo de proxies confiables.");
  }
  return hops;
}

const sessionSecret = required("SESSION_SECRET");
if (sessionSecret.length < 32 || sessionSecret === "replace-with-at-least-32-random-characters") {
  throw new Error("SESSION_SECRET debe tener al menos 32 caracteres y no puede ser el valor de ejemplo.");
}

const mysqlPassword = required("MYSQL_PASSWORD");
if (mysqlPassword === "replace-with-a-unique-local-password") {
  throw new Error("Reemplazá MYSQL_PASSWORD por la contraseña local definida en MySQL Workbench.");
}

const environment = process.env.NODE_ENV || "development";
const trustProxy = proxyHopCount(process.env.TRUST_PROXY);
if (environment === "production" && trustProxy === 0) {
  throw new Error("En producción, configurá TRUST_PROXY con la cantidad de proxies confiables del hosting.");
}
const mediaUploadDirectory = resolveMediaUploadDirectory({
  environment,
  projectRoot: path.resolve(__dirname, ".."),
  homeDirectory: os.homedir(),
  configuredDirectory: process.env.MEDIA_UPLOAD_DIR?.trim(),
});

module.exports = Object.freeze({
  environment,
  port: positiveInteger("PORT", "3000"),
  host: process.env.HOST?.trim() || (environment === "production" ? "0.0.0.0" : "127.0.0.1"),
  trustProxy,
  mediaUploadDirectory,
  sessionSecret,
  mysql: Object.freeze({
    host: process.env.MYSQL_HOST || "localhost",
    port: positiveInteger("MYSQL_PORT", "3306"),
    database: process.env.MYSQL_DATABASE || "del_salado_noticias",
    user: required("MYSQL_USER"),
    password: mysqlPassword,
  }),
});

const path = require("node:path");

function resolveMediaUploadDirectory({
  environment,
  projectRoot,
  homeDirectory,
  configuredDirectory,
}) {
  if (configuredDirectory) {
    if (!path.isAbsolute(configuredDirectory)) {
      throw new Error("MEDIA_UPLOAD_DIR debe ser una ruta absoluta.");
    }
    return path.normalize(configuredDirectory);
  }

  return environment === "production"
    ? path.join(homeDirectory, "dsn-media", "uploads")
    : path.join(projectRoot, "assets", "uploads");
}

module.exports = { resolveMediaUploadDirectory };

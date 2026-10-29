const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { resolveMediaUploadDirectory } = require("./media-storage");

test("production uploads default to a stable directory outside deployed source", () => {
  assert.equal(
    resolveMediaUploadDirectory({
      environment: "production",
      projectRoot: "/home/account/hbuilds/last-source",
      homeDirectory: "/home/account",
    }),
    path.join("/home/account", "dsn-media", "uploads"),
  );
});

test("local uploads remain inside the project assets directory", () => {
  assert.equal(
    resolveMediaUploadDirectory({
      environment: "development",
      projectRoot: "/project",
      homeDirectory: "/home/account",
    }),
    path.join("/project", "assets", "uploads"),
  );
});

test("an absolute configured upload directory overrides the default", () => {
  assert.equal(
    resolveMediaUploadDirectory({
      environment: "production",
      projectRoot: "/home/account/hbuilds/last-source",
      homeDirectory: "/home/account",
      configuredDirectory: "/home/account/persistent-media",
    }),
    path.normalize("/home/account/persistent-media"),
  );
});

test("a relative configured upload directory is rejected", () => {
  assert.throws(
    () => resolveMediaUploadDirectory({
      environment: "production",
      projectRoot: "/home/account/hbuilds/last-source",
      homeDirectory: "/home/account",
      configuredDirectory: "assets/uploads",
    }),
    /MEDIA_UPLOAD_DIR debe ser una ruta absoluta/,
  );
});

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createAdsRouter, isSafeTargetUrl, validateAd } = require("./ads");

const validAd = {
  title: "Comercios de la región",
  image_path: "/assets/comunidad.jpg",
  target_url: "https://example.com/",
  alt_text: "Publicidad local",
  placement: "home_banner",
  starts_at: "2026-10-12T12:00:00.000Z",
  ends_at: null,
  is_active: true,
};

test("validateAd accepts an ad with a local image and valid dates", () => {
  const result = validateAd(validAd);
  assert.deepEqual(result.errors, []);
  assert.equal(result.value.title, validAd.title);
});

test("validateAd accepts the vertical article sidebar placement", () => {
  const result = validateAd({ ...validAd, placement: "article_sidebar" });
  assert.deepEqual(result.errors, []);
  assert.equal(result.value.placement, "article_sidebar");
});

test("validateAd rejects unsafe image paths, placements, fields, and date ranges", () => {
  const result = validateAd({
    ...validAd,
    image_path: "/assets/../.env",
    placement: "header",
    ends_at: "2026-10-11T12:00:00.000Z",
    unexpected: true,
  });
  assert.equal(result.errors.length, 4);
});

test("target links allow HTTPS and internal paths but reject script and protocol-relative URLs", () => {
  assert.equal(isSafeTargetUrl("https://example.com/path"), true);
  assert.equal(isSafeTargetUrl("/index.html?categoria=locales"), true);
  assert.equal(isSafeTargetUrl("javascript:alert(1)"), false);
  assert.equal(isSafeTargetUrl("//example.com"), false);
});

test("validateAd rejects invalid start dates and normalizes the destination link", () => {
  const result = validateAd({
    ...validAd,
    target_url: "  https://example.com/  ",
    starts_at: "fecha incorrecta",
  });
  assert.ok(result.errors.some((error) => error.includes("inicio")));
  assert.equal(result.value.target_url, "https://example.com/");
});

test("only administrators can access ad campaign management endpoints", async (t) => {
  let databaseCalls = 0;
  const app = express();
  const pool = {
    execute: async () => {
      databaseCalls += 1;
      return [[], []];
    },
  };
  const requireAuth = (req, _res, next) => {
    req.session = { user: { role: req.get("x-test-role") } };
    next();
  };
  const server = app.use(createAdsRouter(express, pool, requireAuth)).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const baseUrl = `http://127.0.0.1:${server.address().port}/admin/ads`;

  for (const role of ["editor", "author"]) {
    const response = await fetch(baseUrl, { headers: { "x-test-role": role } });
    assert.equal(response.status, 403);
  }
  assert.equal(databaseCalls, 0);

  const response = await fetch(baseUrl, { headers: { "x-test-role": "admin" } });
  assert.equal(response.status, 200);
  assert.equal(databaseCalls, 1);
});

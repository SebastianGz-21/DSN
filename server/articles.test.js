const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { once } = require("node:events");
const {
  createArticlesRouter,
  findCategoryAndStatus,
  sanitizeArticleBody,
  slugify,
  validateArticle,
} = require("./articles");

test("featured article view only returns articles manually marked as featured", async (t) => {
  const featuredArticle = { id: 1, title: "Noticia destacada", is_featured: 1 };
  const regularArticle = { id: 2, title: "Noticia más vista", is_featured: 0 };
  const queries = [];
  const pool = {
    execute: async (query) => {
      queries.push(query);
      const articles = query.includes("AND a.is_featured = TRUE")
        ? [featuredArticle]
        : [featuredArticle, regularArticle];
      return [articles, []];
    },
  };
  const app = express();
  app.use("/api", createArticlesRouter(express, pool, () => {}));
  const server = app.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await once(server, "listening");

  const baseUrl = `http://127.0.0.1:${server.address().port}/api/articles`;
  const featuredResponse = await fetch(`${baseUrl}?view=featured`);
  const featuredResult = await featuredResponse.json();
  const latestResponse = await fetch(`${baseUrl}?view=latest`);
  const latestResult = await latestResponse.json();

  assert.deepEqual(featuredResult.articles, [featuredArticle]);
  assert.deepEqual(latestResult.articles, [featuredArticle, regularArticle]);
  assert.match(queries[0], /AND a\.is_featured = TRUE/);
  assert.doesNotMatch(queries[1], /AND a\.is_featured = TRUE/);
});

test("category and status lookups read the first row from mysql2 query results", async () => {
  const pool = {
    execute: async (query) => {
      if (query.includes("FROM categories")) return [[{ id: 8 }], []];
      return [[{ id: 1 }], []];
    },
  };

  assert.deepEqual(await findCategoryAndStatus(pool, "deportes", "draft"), {
    category: { id: 8 },
    articleStatus: { id: 1 },
  });
});

test("slugify creates an accent-free URL slug", () => {
  assert.equal(slugify("Política y región: Del Salado"), "politica-y-region-del-salado");
});

test("validateArticle accepts a draft with the expected fields", () => {
  const result = validateArticle({
    title: "Noticia local",
    body: "Contenido de la noticia.",
    category: "locales",
    status: "draft",
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.value.title, "Noticia local");
});

test("article content keeps supported formatting and strips unsafe markup", () => {
  const body = sanitizeArticleBody(
    '<p><strong>Importante</strong> <b>hoy</b> <em>ahora</em> <i>también</i><script>alert(1)</script><a href="javascript:alert(1)">enlace</a></p>',
  );
  assert.equal(body, '<p><strong>Importante</strong> <b>hoy</b> <em>ahora</em> <i>también</i><a>enlace</a></p>');
});

test("validateArticle rejects empty formatted content and oversized bodies", () => {
  const empty = validateArticle({
    title: "Noticia",
    body: "<p><br></p>",
    category: "locales",
    status: "draft",
  });
  const tooLong = validateArticle({
    title: "Noticia",
    body: `<p>${"a".repeat(100_001)}</p>`,
    category: "locales",
    status: "draft",
  });
  assert.ok(empty.errors.some((error) => error.includes("contenido")));
  assert.ok(tooLong.errors.some((error) => error.includes("100.000")));
});

test("validateArticle rejects unknown fields and invalid publication statuses", () => {
  const result = validateArticle({
    title: "Noticia",
    body: "Contenido.",
    category: "locales",
    status: "live",
    views_count: 1000,
  });
  assert.equal(result.errors.length, 2);
});

test("authors cannot publish an article", () => {
  const result = validateArticle({
    title: "Noticia local",
    body: "Contenido.",
    category: "locales",
    status: "published",
  }, { authorOnly: true });
  assert.ok(result.errors.some((error) => error.includes("borrador")));
});

test("article dates accept MySQL Date values and reject invalid strings", () => {
  const valid = validateArticle({
    title: "Noticia local",
    body: "Contenido.",
    category: "locales",
    published_at: new Date("2026-10-08T12:00:00Z"),
  });
  const invalid = validateArticle({
    title: "Noticia local",
    body: "Contenido.",
    category: "locales",
    published_at: "no-es-una-fecha",
  });
  assert.deepEqual(valid.errors, []);
  assert.ok(invalid.errors.some((error) => error.includes("fecha")));
});

test("validateArticle accepts up to 20 distinct gallery media IDs", () => {
  const result = validateArticle({
    title: "Noticia local",
    body: "Contenido.",
    category: "locales",
    status: "draft",
    gallery_media_ids: [3, 8, 13],
  });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.value.galleryMediaIds, [3, 8, 13]);
});

test("validateArticle rejects duplicate gallery IDs and galleries over 20 images", () => {
  const duplicate = validateArticle({
    title: "Noticia local",
    body: "Contenido.",
    category: "locales",
    gallery_media_ids: [3, 3],
  });
  const tooMany = validateArticle({
    title: "Noticia local",
    body: "Contenido.",
    category: "locales",
    gallery_media_ids: Array.from({ length: 21 }, (_, index) => index + 1),
  });
  assert.ok(duplicate.errors.some((error) => error.includes("galería")));
  assert.ok(tooMany.errors.some((error) => error.includes("galería")));
});

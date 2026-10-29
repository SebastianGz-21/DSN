const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { once } = require("node:events");
const { createSharePageRouter, renderArticleSharePage } = require("./share-page");

const template = `<!doctype html>
<html lang="es"><head>
<meta name="description" content="Descripción general" data-share-meta="description">
<meta property="og:type" content="website" data-share-meta="og:type">
<meta property="og:title" content="Título general" data-share-meta="og:title">
<meta property="og:description" content="Descripción general" data-share-meta="og:description">
<meta property="og:url" content="/" data-share-meta="og:url">
<meta property="og:image" content="/assets/quienes-somos.png" data-share-meta="og:image">
<meta property="og:image:alt" content="Imagen" data-share-meta="og:image:alt">
<meta name="twitter:title" content="Título general" data-share-meta="twitter:title">
<meta name="twitter:description" content="Descripción general" data-share-meta="twitter:description">
<meta name="twitter:image" content="/assets/quienes-somos.png" data-share-meta="twitter:image">
<link rel="canonical" href="/" data-share-canonical="true">
<title>Del Salado Noticias</title>
</head></html>`;

test("article share metadata uses the article image and escapes article text", () => {
  const html = renderArticleSharePage(template, {
    title: 'Noticia "principal"',
    summary: "Resumen de <la noticia>",
    image_path: "/assets/uploads/noticia.jpg",
    image_alt: "Foto & archivo",
  }, "https://delsaladonoticias.com/index.html?noticia=principal");

  assert.match(html, /<title>Noticia &quot;principal&quot; \| Del Salado Noticias<\/title>/);
  assert.match(html, /property="og:type" content="article"/);
  assert.match(html, /property="og:image" content="https:\/\/delsaladonoticias\.com\/assets\/uploads\/noticia\.jpg"/);
  assert.match(html, /name="twitter:image" content="https:\/\/delsaladonoticias\.com\/assets\/uploads\/noticia\.jpg"/);
  assert.match(html, /property="og:description" content="Resumen de &lt;la noticia&gt;"/);
  assert.match(html, /property="og:image:alt" content="Foto &amp; archivo"/);
  assert.match(html, /rel="canonical" href="https:\/\/delsaladonoticias\.com\/index\.html\?noticia=principal"/);
});

test("article share page serves metadata for published articles only", async (t) => {
  const queries = [];
  let queryText;
  const pool = {
    execute: async (query, values) => {
      queryText = query;
      queries.push(values);
      return [[{
        title: "Noticia compartida",
        summary: "Resumen",
        image_path: "/assets/uploads/foto.jpg",
        image_alt: "Foto",
      }], []];
    },
  };
  const app = express();
  app.use(createSharePageRouter(express, pool, template));
  const server = app.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await once(server, "listening");

  const response = await fetch(`http://127.0.0.1:${server.address().port}/index.html?noticia=noticia-compartida`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /og:image" content="http:\/\/127\.0\.0\.1:\d+\/assets\/uploads\/foto\.jpg"/);
  assert.deepEqual(queries, [["noticia-compartida"]]);
  assert.match(queryText, /s\.slug = 'published'/);
  assert.match(queryText, /a\.published_at <= UTC_TIMESTAMP\(\)/);
});

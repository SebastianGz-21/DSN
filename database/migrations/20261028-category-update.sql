USE del_salado_noticias;

START TRANSACTION;

INSERT INTO categories (slug, name, menu_order, is_active)
SELECT 'capital', 'Capital', 3, TRUE
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE slug = 'capital');

INSERT INTO categories (slug, name, menu_order, is_active)
SELECT 'banda', 'Banda', 4, TRUE
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE slug = 'banda');

UPDATE categories
SET name = 'Capital', menu_order = 3, is_active = TRUE
WHERE slug = 'capital';

UPDATE categories
SET name = 'Banda', menu_order = 4, is_active = TRUE
WHERE slug = 'banda';

UPDATE articles AS article
INNER JOIN categories AS removed ON removed.id = article.category_id AND removed.slug = 'policiales'
INNER JOIN categories AS locales ON locales.slug = 'locales'
SET article.category_id = locales.id;

DELETE FROM categories
WHERE slug IN ('capital-banda', 'policiales');

UPDATE categories
SET menu_order = CASE slug
  WHEN 'politica' THEN 5
  WHEN 'sociedad' THEN 6
  WHEN 'deportes' THEN 7
  ELSE menu_order
END
WHERE slug IN ('politica', 'sociedad', 'deportes');

COMMIT;

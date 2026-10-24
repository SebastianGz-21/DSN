USE del_salado_noticias;

CREATE TABLE IF NOT EXISTS cms_sessions (
  session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
  expires INT UNSIGNED NOT NULL,
  data MEDIUMTEXT COLLATE utf8mb4_bin,
  PRIMARY KEY (session_id),
  KEY idx_cms_sessions_expires (expires)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ad_campaigns (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(160) NOT NULL,
  image_path VARCHAR(500) NOT NULL,
  target_url VARCHAR(2048) NOT NULL,
  alt_text VARCHAR(255) NULL,
  placement VARCHAR(40) NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  impressions_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  clicks_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ad_campaigns_display (placement, is_active, starts_at, ends_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS article_gallery (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  article_id BIGINT UNSIGNED NOT NULL,
  media_id BIGINT UNSIGNED NOT NULL,
  position SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_article_gallery_media (article_id, media_id),
  KEY idx_article_gallery_order (article_id, position, id),
  CONSTRAINT fk_article_gallery_article
    FOREIGN KEY (article_id) REFERENCES articles (id) ON DELETE CASCADE,
  CONSTRAINT fk_article_gallery_media
    FOREIGN KEY (media_id) REFERENCES media (id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO ad_campaigns
  (title, image_path, target_url, alt_text, placement, starts_at, ends_at, is_active)
SELECT
  'Comercios de la región', '/assets/coca.jpg', '/index.html?categoria=locales',
  'Conocé los comercios de nuestra región', 'home_banner', UTC_TIMESTAMP(), NULL, TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM ad_campaigns WHERE title = 'Comercios de la región'
);

INSERT INTO ad_campaigns
  (title, image_path, target_url, alt_text, placement, starts_at, ends_at, is_active)
SELECT
  'La región que nos une', '/assets/hambur.jpg', '/index.html?categoria=figueroa',
  'Publicidad de muestra para lectores de Del Salado Noticias', 'article_banner', UTC_TIMESTAMP(), NULL, TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM ad_campaigns WHERE title = 'La región que nos une'
);

UPDATE ad_campaigns
SET image_path = '/assets/coca.jpg'
WHERE title = 'Comercios de la región' AND placement = 'home_banner';

UPDATE ad_campaigns
SET image_path = '/assets/hambur.jpg'
WHERE title = 'La región que nos une' AND placement = 'article_banner';

CREATE USER IF NOT EXISTS 'dsn_cms'@'localhost'
  IDENTIFIED BY 'REPLACE_WITH_A_UNIQUE_STRONG_PASSWORD';

GRANT SELECT, INSERT, UPDATE, DELETE
  ON del_salado_noticias.*
  TO 'dsn_cms'@'localhost';

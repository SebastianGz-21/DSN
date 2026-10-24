const menuButton = document.querySelector(".menu-toggle");
const navigation = document.querySelector(".primary-nav");

const currentDateTime = document.querySelector("#current-date-time");
if (currentDateTime instanceof HTMLTimeElement) {
  const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Cordoba",
  });

  const updateDateTime = () => {
    const now = new Date();
    currentDateTime.dateTime = now.toISOString();
    currentDateTime.textContent = dateTimeFormatter.format(now);
  };

  updateDateTime();
  window.setInterval(updateDateTime, 60_000);
}

menuButton?.addEventListener("click", () => {
  const isExpanded = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!isExpanded));
  navigation?.classList.toggle("is-open", !isExpanded);
});

document.querySelectorAll(".search-button").forEach((button) => {
  button.addEventListener("click", () => {
    const searchInput = document.querySelector("#news-search");
    const categoryView = document.querySelector(".category-view");
    if (searchInput instanceof HTMLInputElement && !categoryView.hidden) {
      searchInput.focus();
      return;
    }
    location.href = "index.html?vista=ultimas#news-search";
  });
});

document.querySelectorAll(".footer-subscribe").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const message = form.querySelector(".form-message");
    if (message) message.textContent = "Prototipo: la suscripción aún no está conectada.";
    form.reset();
  });
});

const query = new URLSearchParams(location.search);
const category = query.get("categoria")?.toLowerCase();
const searchTerm = query.get("q")?.trim().toLocaleLowerCase("es");
const latestView = query.get("vista") === "ultimas";
const featuredView = query.get("vista") === "destacadas";
const articleSlug = query.get("noticia");
const categoryLabels = {
  locales: "Locales",
  figueroa: "Departamento Figueroa",
  "capital-banda": "Capital y Banda",
  politica: "Política",
  policiales: "Policiales",
  sociedad: "Sociedad",
  deportes: "Deportes",
};

function formatArticleDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Cordoba",
  }).format(date);
}

function makeArticleLink(article, label) {
  const link = document.createElement("a");
  link.href = `index.html?noticia=${encodeURIComponent(article.slug)}`;
  link.textContent = label;
  return link;
}

function makeArticleImage(article, className) {
  const image = document.createElement("img");
  image.className = className;
  image.src = article.image_path || "assets/quienes-somos.png";
  image.alt = article.image_alt || (article.image_path ? "" : "Paisaje del río Salado en Santiago del Estero");
  image.loading = "lazy";
  return image;
}

function makeArticleTime(article) {
  const time = document.createElement("time");
  time.dateTime = article.published_at;
  time.textContent = formatArticleDate(article.published_at);
  return time;
}

function makeArticleCard(article) {
  const card = document.createElement("article");
  card.className = "feature-card";
  card.append(makeArticleImage(article, ""));
  const copy = document.createElement("div");
  copy.className = "feature-copy";
  const categoryLabel = document.createElement("span");
  categoryLabel.className = "eyebrow";
  categoryLabel.textContent = article.category_name;
  const title = document.createElement("h3");
  title.append(makeArticleLink(article, article.title));
  copy.append(categoryLabel, title, makeArticleTime(article));
  card.append(copy);
  return card;
}

function makeLatestItem(article) {
  const item = document.createElement("article");
  item.className = "latest-item";
  item.append(makeArticleImage(article, ""));
  const copy = document.createElement("div");
  const categoryLabel = document.createElement("span");
  categoryLabel.className = "eyebrow";
  categoryLabel.textContent = article.category_name;
  const title = document.createElement("h3");
  title.append(makeArticleLink(article, article.title));
  copy.append(categoryLabel, title, makeArticleTime(article));
  item.append(copy);
  return item;
}

function makeListingItem(article) {
  const item = document.createElement("article");
  item.className = "list-story";
  item.dataset.category = article.category_slug;
  const bodyText = ArticleRichText.toText(article.body);
  item.dataset.search = `${article.title} ${article.summary || ""} ${bodyText}`.toLocaleLowerCase("es");
  item.append(makeArticleImage(article, ""));
  const copy = document.createElement("div");
  const categoryLabel = document.createElement("span");
  categoryLabel.className = "eyebrow";
  categoryLabel.textContent = article.category_name;
  const title = document.createElement("h2");
  title.append(makeArticleLink(article, article.title));
  const summary = document.createElement("p");
  summary.textContent = article.summary || bodyText.slice(0, 220);
  copy.append(categoryLabel, title, summary, makeArticleTime(article));
  item.append(copy);
  return item;
}

function setFeedState(container, message, className = "feed-state") {
  container.replaceChildren();
  const state = document.createElement("p");
  state.className = className;
  state.textContent = message;
  container.append(state);
}

function renderHero(article, articles = [], animate = false) {
  const hero = document.querySelector("#home-hero");
  const image = hero.querySelector(":scope > img");
  const tag = hero.querySelector(".category-tag");
  const title = hero.querySelector(".hero-title-link");
  const existingLink = hero.querySelector(".story-link");
  const dots = hero.querySelector(".slider-dots");
  if (!article) {
    title.textContent = "Todavía no hay noticias publicadas";
    title.href = "index.html";
    tag.textContent = "Del Salado Noticias";
    image.src = "assets/quienes-somos.png";
    image.alt = "Paisaje del río Salado en Santiago del Estero";
    existingLink?.remove();
    dots.replaceChildren();
    return;
  }
  image.src = article.image_path || "assets/quienes-somos.png";
  image.alt = article.image_alt || (article.image_path ? "" : "Paisaje del río Salado en Santiago del Estero");
  tag.textContent = article.category_name;
  title.textContent = article.title;
  title.href = `index.html?noticia=${encodeURIComponent(article.slug)}`;
  const link = existingLink || document.createElement("a");
  link.className = "story-link";
  link.href = `index.html?noticia=${encodeURIComponent(article.slug)}`;
  link.replaceChildren(document.createTextNode("Leer la noticia "), Object.assign(document.createElement("span"), { textContent: "→" }));
  if (!existingLink) hero.querySelector(".hero-content").append(link);

  dots.replaceChildren(...articles.map((item, index) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = item.slug === article.slug ? "selected" : "";
    dot.setAttribute("aria-label", `Mostrar noticia ${index + 1}: ${item.title}`);
    dot.setAttribute("aria-current", String(item.slug === article.slug));
    dot.addEventListener("click", () => renderHero(item, articles, true));
    return dot;
  }));
  if (animate) {
    hero.classList.remove("is-sliding");
    void hero.offsetWidth;
    hero.classList.add("is-sliding");
  }
}

function renderHome(latestArticles, popularArticles) {
  const editorialFeatures = latestArticles.filter((article) => Boolean(article.is_featured));
  const heroArticles = editorialFeatures.length ? editorialFeatures : latestArticles.slice(0, 1);
  renderHero(heroArticles[0], heroArticles);
  if (!document.querySelector(".home-view").hidden
      && heroArticles.length > 1) {
    const hero = document.querySelector("#home-hero");
    window.setInterval(() => {
      if (document.hidden) return;
      const dots = [...hero.querySelectorAll(".slider-dots button")];
      const currentIndex = dots.findIndex((dot) => dot.getAttribute("aria-current") === "true");
      const nextIndex = (currentIndex + 1) % heroArticles.length;
      renderHero(heroArticles[nextIndex], heroArticles, true);
    }, 6000);
  }
  const featuredGrid = document.querySelector("#featured-grid");
  if (!popularArticles.length) {
    setFeedState(featuredGrid, "Todavía no hay noticias publicadas.");
  } else {
    featuredGrid.replaceChildren(...popularArticles.slice(0, 3).map(makeArticleCard));
  }
  const latestList = document.querySelector("#latest-list");
  if (!latestArticles.length) {
    setFeedState(latestList, "Todavía no hay noticias publicadas.");
  } else {
    latestList.replaceChildren(...latestArticles.slice(0, 5).map(makeLatestItem));
  }
}

let weatherLoading = false;

function weatherDescription(code) {
  if (code === 0) return "Despejado";
  if (code === 1) return "Mayormente despejado";
  if (code === 2) return "Parcialmente nublado";
  if (code === 3) return "Nublado";
  if ([45, 48].includes(code)) return "Niebla";
  if ([51, 53, 55, 56, 57].includes(code)) return "Llovizna";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Lluvia";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Nieve";
  if ([95, 96, 99].includes(code)) return "Tormenta";
  return "Condiciones variables";
}

function weatherIcon(code, isDay = true) {
  if (code === 0) return isDay ? "☀️" : "🌙";
  if ([1, 2].includes(code)) return isDay ? "🌤️" : "☁️";
  if ([3, 45, 48].includes(code)) return "☁️";
  if ([51, 53, 55, 56, 57].includes(code)) return "🌦️";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "🌧️";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "🌨️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return "🌡️";
}

function renderWeatherForecast(data) {
  const current = document.querySelector("#weather-current");
  const forecast = document.querySelector("#weather-forecast");
  const updated = document.querySelector("#weather-updated");
  const { current: conditions, daily } = data;
  if (!conditions || !daily
      || !Array.isArray(daily.time)
      || !Array.isArray(daily.weather_code)
      || !Array.isArray(daily.temperature_2m_max)
      || !Array.isArray(daily.temperature_2m_min)
      || !Array.isArray(daily.precipitation_probability_max)) {
    throw new Error("La respuesta del pronóstico no tiene el formato esperado.");
  }

  const currentIcon = document.createElement("span");
  currentIcon.className = "weather-icon";
  currentIcon.setAttribute("aria-hidden", "true");
  currentIcon.textContent = weatherIcon(conditions.weather_code, conditions.is_day === 1);

  const currentSummary = document.createElement("div");
  const temperature = document.createElement("div");
  temperature.className = "weather-temperature";
  temperature.textContent = `${Math.round(conditions.temperature_2m)}°`;
  const description = document.createElement("div");
  description.className = "weather-description";
  description.textContent = weatherDescription(conditions.weather_code);
  currentSummary.append(temperature, description);

  const details = document.createElement("div");
  details.className = "weather-details";
  details.textContent = `Sensación ${Math.round(conditions.apparent_temperature)}° · Humedad ${Math.round(conditions.relative_humidity_2m)}% · Viento ${Math.round(conditions.wind_speed_10m)} km/h`;
  current.replaceChildren(currentIcon, currentSummary, details);

  const dayFormatter = new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    timeZone: "America/Argentina/Cordoba",
  });
  const days = daily.time.slice(1, 4).map((date, index) => {
    const forecastIndex = index + 1;
    const day = document.createElement("div");
    day.className = "weather-day";
    const name = document.createElement("span");
    name.className = "weather-day-name";
    name.textContent = dayFormatter.format(new Date(`${date}T12:00:00`)).replace(".", "");
    const icon = document.createElement("span");
    icon.className = "weather-day-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = weatherIcon(daily.weather_code[forecastIndex]);
    const temperatures = document.createElement("span");
    temperatures.className = "weather-day-temps";
    temperatures.textContent = `${Math.round(daily.temperature_2m_max[forecastIndex])}° / ${Math.round(daily.temperature_2m_min[forecastIndex])}°`;
    const rain = document.createElement("span");
    rain.className = "weather-day-rain";
    rain.textContent = `Lluvia ${daily.precipitation_probability_max[forecastIndex] ?? 0}%`;
    day.append(name, icon, temperatures, rain);
    return day;
  });
  forecast.replaceChildren(...days);
  updated.textContent = `Actualizado ${new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Cordoba",
  }).format(new Date())}`;
}

async function loadWeatherForecast() {
  if (weatherLoading) return;
  weatherLoading = true;
  try {
    const params = new URLSearchParams({
      latitude: "-27.7834",
      longitude: "-64.2661",
      current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
      forecast_days: "4",
      timezone: "America/Argentina/Cordoba",
    });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`El servicio meteorológico respondió ${response.status}.`);
    renderWeatherForecast(await response.json());
  } catch (error) {
    console.error("No se pudo actualizar el pronóstico:", error);
    const current = document.querySelector("#weather-current");
    current.replaceChildren();
    const state = document.createElement("p");
    state.className = "weather-state";
    state.textContent = "No se pudo cargar el pronóstico. Se volverá a intentar automáticamente.";
    current.append(state);
    document.querySelector("#weather-forecast").replaceChildren();
    document.querySelector("#weather-updated").textContent = "Sin conexión";
  } finally {
    weatherLoading = false;
  }
}

function renderListing(articles) {
  const list = document.querySelector(".news-list");
  const emptyState = document.querySelector(".empty-state");
  const filteredArticles = articles.filter((article) => {
    const matchesCategory = !category || article.category_slug === category;
    const searchableText = `${article.title} ${article.summary || ""} ${article.body} ${article.category_name}`.toLocaleLowerCase("es");
    return matchesCategory && (!searchTerm || searchableText.includes(searchTerm));
  });
  list.replaceChildren(...filteredArticles.map(makeListingItem), emptyState);
  if (!filteredArticles.length) {
    emptyState.hidden = false;
    emptyState.textContent = searchTerm
      ? "No hay noticias que coincidan con esa búsqueda."
      : "Todavía no hay noticias publicadas en esta sección.";
  } else {
    emptyState.hidden = true;
  }
}

function showPageView() {
  const detailView = Boolean(articleSlug);
  const hasListingFilter = Boolean(category || searchTerm || latestView || featuredView);
  document.querySelector(".home-view").hidden = detailView || hasListingFilter;
  document.querySelector("#home-ad-slot").hidden = detailView || hasListingFilter;
  document.querySelector(".category-view").hidden = detailView || !hasListingFilter;
  document.querySelector("#article-detail").hidden = !detailView;
  document.querySelector(".about-panel").hidden = detailView || hasListingFilter;
  document.querySelector(".newsletter-strip").hidden = detailView;
  const categoryTitle = document.querySelector("#category-title");
  if (categoryTitle) {
    categoryTitle.textContent = latestView && !category
      ? "Últimas noticias"
      : featuredView && !category
        ? "Noticias destacadas"
        : categoryLabels[category] || "Noticias";
  }
  document.querySelectorAll(".primary-nav a[data-category]").forEach((link) => {
    link.classList.toggle("active", link.dataset.category === category);
  });
  document.querySelector('.primary-nav a[href="index.html"]')?.classList.toggle("active", !category && !latestView && !featuredView && !articleSlug);
  const rankingNote = document.querySelector(".ranking-note");
  rankingNote.hidden = true;
  const searchInput = document.querySelector("#news-search");
  const searchCategoryInput = document.querySelector("#news-search-category");
  if (searchInput instanceof HTMLInputElement) searchInput.value = searchTerm || "";
  if (searchCategoryInput instanceof HTMLInputElement) {
    searchCategoryInput.value = category || "";
    searchCategoryInput.disabled = !category;
  }
  if (location.hash === "#news-search" && searchInput instanceof HTMLInputElement) searchInput.focus();
}

function renderArticleDetail(article) {
  const detail = document.querySelector("#article-detail");
  detail.replaceChildren();
  const breadcrumb = document.createElement("nav");
  breadcrumb.className = "breadcrumb";
  breadcrumb.setAttribute("aria-label", "Ruta de navegación");
  const homeLink = document.createElement("a");
  homeLink.href = "index.html";
  homeLink.textContent = "Inicio";
  const separator = document.createElement("span");
  separator.textContent = "›";
  const categoryLink = document.createElement("a");
  categoryLink.href = `index.html?categoria=${encodeURIComponent(article.category_slug)}`;
  categoryLink.textContent = article.category_name;
  breadcrumb.append(homeLink, separator, categoryLink);

  const header = document.createElement("header");
  header.className = "article-detail-header";
  const categoryLabel = document.createElement("span");
  categoryLabel.className = "eyebrow";
  categoryLabel.textContent = article.category_name;
  const title = document.createElement("h1");
  title.textContent = article.title;
  const date = makeArticleTime(article);
  header.append(categoryLabel, title, date);

  const content = document.createElement("div");
  content.className = "article-detail-body";
  content.append(ArticleRichText.createFragment(article.body));
  const layout = document.createElement("div");
  layout.className = "article-detail-layout";
  const main = document.createElement("div");
  main.className = "article-detail-main";
  main.append(breadcrumb, header);
  const articleImages = [
    ...(article.image_path ? [{ image_path: article.image_path, image_alt: article.image_alt }] : []),
    ...(article.gallery || []),
  ];
  if (articleImages.length > 1) {
    main.append(makeArticleCarousel(articleImages));
  } else if (articleImages.length === 1) {
    main.append(makeArticleImage({
      image_path: articleImages[0].image_path,
      image_alt: articleImages[0].image_alt,
    }, "article-detail-image"));
  }
  const horizontalAds = publicAds.filter((ad) => ad.placement === "article_banner");
  if (horizontalAds.length) main.append(...horizontalAds.map(makeAdBanner));
  main.append(content);
  const sidebarAds = publicAds.filter((ad) => ad.placement === "article_sidebar");
  layout.append(main);
  const sidebar = document.createElement("aside");
  sidebar.className = "article-ad-sidebar";
  sidebar.setAttribute("aria-label", "Publicidad y últimas noticias");
  sidebar.append(...sidebarAds.map(makeAdBanner), makeArticleLatestPanel());
  layout.append(sidebar);
  detail.append(layout);
  loadArticleSidebarNews();
}

function makeArticleLatestPanel() {
  const panel = document.createElement("section");
  panel.className = "latest-panel article-latest-panel";
  const heading = document.createElement("div");
  heading.className = "section-heading";
  const title = document.createElement("h2");
  title.textContent = "Últimas noticias";
  const more = document.createElement("a");
  more.href = "index.html?vista=ultimas";
  more.append(document.createTextNode("Más "), Object.assign(document.createElement("span"), { textContent: "→" }));
  heading.append(title, more);
  const list = document.createElement("div");
  list.className = "article-latest-list";
  setFeedState(list, "Cargando últimas noticias…");
  panel.append(heading, list);
  return panel;
}

async function loadArticleSidebarNews() {
  const list = document.querySelector(".article-latest-list");
  if (!list) return;
  try {
    const response = await fetch("/api/articles?view=latest&limit=5");
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "No se pudieron cargar las últimas noticias.");
    if (!result.articles.length) {
      setFeedState(list, "Todavía no hay noticias publicadas.");
      return;
    }
    list.replaceChildren(...result.articles.slice(0, 5).map(makeLatestItem));
  } catch (error) {
    console.error("No se pudieron cargar las últimas noticias del detalle:", error);
    setFeedState(list, "No se pudieron cargar las últimas noticias.");
  }
}

function makeArticleCarousel(images) {
  const carousel = document.createElement("section");
  carousel.className = "article-carousel";
  carousel.setAttribute("aria-label", "Galería de imágenes de la noticia");
  carousel.setAttribute("aria-roledescription", "carrusel");
  const image = makeArticleImage(images[0], "article-detail-image");
  image.loading = "eager";
  const controls = document.createElement("div");
  controls.className = "article-carousel-controls";
  const previous = document.createElement("button");
  previous.type = "button";
  previous.className = "carousel-arrow";
  previous.textContent = "‹";
  previous.setAttribute("aria-label", "Imagen anterior");
  const position = document.createElement("span");
  position.className = "carousel-position";
  position.setAttribute("aria-live", "polite");
  const next = document.createElement("button");
  next.type = "button";
  next.className = "carousel-arrow";
  next.textContent = "›";
  next.setAttribute("aria-label", "Imagen siguiente");
  let currentIndex = 0;
  const render = (animate = false) => {
    const current = images[currentIndex];
    image.src = current.image_path;
    image.alt = current.image_alt || "";
    position.textContent = `${currentIndex + 1} / ${images.length}`;
    if (animate) {
      image.classList.remove("is-sliding");
      void image.offsetWidth;
      image.classList.add("is-sliding");
    }
  };
  previous.addEventListener("click", () => {
    currentIndex = (currentIndex - 1 + images.length) % images.length;
    render(true);
  });
  next.addEventListener("click", () => {
    currentIndex = (currentIndex + 1) % images.length;
    render(true);
  });
  render();
  window.setInterval(() => {
    if (document.hidden || carousel.closest("#article-detail")?.hidden) return;
    currentIndex = (currentIndex + 1) % images.length;
    render(true);
  }, 4000);
  controls.append(previous, position, next);
  carousel.append(image, controls);
  return carousel;
}

let publicAds = [];

function makeAdBanner(ad) {
  const slot = document.createElement("aside");
  slot.className = `public-ad-banner${ad.placement === "article_sidebar" ? " public-ad-banner-vertical" : ""}`;
  slot.setAttribute("aria-label", "Publicidad");
  const label = document.createElement("span");
  label.className = "ad-label";
  label.textContent = "Publicidad";
  const link = document.createElement("a");
  link.href = ad.target_url;
  link.setAttribute("aria-label", ad.alt_text || ad.title);
  if (ad.target_url.startsWith("https://")) {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
  link.addEventListener("click", () => trackAdEvent(ad.id, "click"));
  const image = document.createElement("img");
  image.src = ad.image_path;
  image.alt = ad.alt_text || "";
  image.loading = "lazy";
  link.append(image);
  slot.append(label, link);
  trackAdImpression(ad, slot);
  return slot;
}

function trackAdEvent(id, event) {
  fetch(`/api/ads/${encodeURIComponent(id)}/${event}`, {
    method: "POST",
    keepalive: true,
  }).then((response) => {
    if (!response.ok) console.warn(`No se pudo registrar el evento ${event} del anuncio ${id}.`);
  }).catch((error) => {
    console.warn(`No se pudo registrar el evento ${event} del anuncio ${id}:`, error);
  });
}

function trackAdImpression(ad, element) {
  if (!("IntersectionObserver" in window)) {
    trackAdEvent(ad.id, "impression");
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      observer.disconnect();
      trackAdEvent(ad.id, "impression");
    }
  }, { threshold: 0.25 });
  observer.observe(element);
}

async function loadPublicAds() {
  try {
    const response = await fetch("/api/ads");
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "No se pudieron cargar las publicidades.");
    return result.ads;
  } catch (error) {
    console.warn("No se pudieron cargar las publicidades:", error);
    return [];
  }
}

function renderHomeAds() {
  const slot = document.querySelector("#home-ad-slot");
  const homeAds = publicAds.filter((ad) => ad.placement === "home_banner");
  slot.replaceChildren(...homeAds.map(makeAdBanner));
  slot.hidden = homeAds.length === 0 || Boolean(articleSlug || category || searchTerm || latestView || featuredView);
}

function renderCategoryAds() {
  const slot = document.querySelector("#category-ad-slot");
  const sidebarAds = publicAds.filter((ad) => ad.placement === "article_sidebar");
  slot.replaceChildren(...sidebarAds.map(makeAdBanner));
  slot.hidden = !category || sidebarAds.length === 0;
}

async function loadPublicNews() {
  showPageView();
  if (!document.querySelector(".home-view").hidden) {
    loadWeatherForecast();
    window.setInterval(() => {
      if (!document.hidden) loadWeatherForecast();
    }, 15 * 60 * 1000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) loadWeatherForecast();
    });
  }
  publicAds = await loadPublicAds();
  renderHomeAds();
  renderCategoryAds();
  try {
    if (articleSlug) {
      const response = await fetch(`/api/articles/${encodeURIComponent(articleSlug)}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo cargar la noticia.");
      renderArticleDetail(result.article);
      document.title = `${result.article.title} | Del Salado Noticias`;
      return;
    }

    const articlesView = featuredView ? "featured" : "latest";
    const [latestResponse, featuredResponse] = await Promise.all([
      fetch("/api/articles?view=latest&limit=100"),
      fetch("/api/articles?view=featured&limit=100"),
    ]);
    const [latestResult, featuredResult] = await Promise.all([latestResponse.json(), featuredResponse.json()]);
    if (!latestResponse.ok) throw new Error(latestResult.error || "No se pudieron cargar las noticias.");
    if (!featuredResponse.ok) throw new Error(featuredResult.error || "No se pudieron cargar las noticias destacadas.");
    const latestArticles = latestResult.articles;
    const popularArticles = featuredResult.articles;
    renderHome(latestArticles, popularArticles);
    renderListing(articlesView === "featured" ? popularArticles : latestArticles);
  } catch (error) {
    console.error("No se pudo cargar el contenido público:", error);
    if (articleSlug) {
      setFeedState(document.querySelector("#article-detail"), error.message, "empty-state");
      return;
    }
    const hero = document.querySelector("#home-hero");
    hero.querySelector(".hero-title-link").textContent = "No se pudieron cargar las noticias";
    setFeedState(document.querySelector("#featured-grid"), "No se pudieron cargar las noticias. Verificá que el servidor local esté iniciado.");
    setFeedState(document.querySelector("#latest-list"), "No se pudieron cargar las noticias. Verificá que el servidor local esté iniciado.");
    setFeedState(document.querySelector(".news-list"), error.message, "empty-state");
  }
}

loadPublicNews();

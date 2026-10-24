const loginView = document.querySelector("#login-view");
const dashboardView = document.querySelector("#dashboard-view");
const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");
const dashboardNotice = document.querySelector("#dashboard-notice");
const articleForm = document.querySelector("#article-form");
const articleBodyEditor = document.querySelector("#article-body-editor");
const articleError = document.querySelector("#article-error");
const editorPanel = document.querySelector("#editor-panel");
const articleList = document.querySelector("#article-list");
const categorySelect = document.querySelector("#article-category");
const statusSelect = document.querySelector("#article-status");
const scheduleField = document.querySelector("#schedule-field");
const publishedAtInput = document.querySelector("#article-published-at");
const mediaSelect = document.querySelector("#article-image");
const imagePreview = document.querySelector("#image-preview");
const imageAltText = document.querySelector("#image-alt-text");
const imageFileInput = document.querySelector("#image-file");
const galleryMediaList = document.querySelector("#article-gallery-list");
const galleryImageFiles = document.querySelector("#gallery-image-files");
const gallerySelectionCount = document.querySelector("#gallery-selection-count");
const toast = document.querySelector("#toast");
const userForm = document.querySelector("#user-form");
const userError = document.querySelector("#user-error");
const userEditorPanel = document.querySelector("#user-editor-panel");
const userList = document.querySelector("#user-list");
const adForm = document.querySelector("#ad-form");
const adError = document.querySelector("#ad-error");
const adEditorPanel = document.querySelector("#ad-editor-panel");
const adList = document.querySelector("#ad-list");
const adImagePath = document.querySelector("#ad-image-path");
const adImagePreview = document.querySelector("#ad-image-preview");
const adImageFileInput = document.querySelector("#ad-image-file");
const adLibraryImage = document.querySelector("#ad-library-image");

let currentUser = null;
let articles = [];
let users = [];
let mediaItems = [];
let ads = [];
let initialPublishedAt = null;
let toastTimeout;

const statuses = {
  draft: "Borrador",
  published: "Publicada",
  scheduled: "Programada",
  archived: "Archivada",
};

async function request(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers: options.body instanceof FormData
        ? options.headers
        : { "Content-Type": "application/json", ...options.headers },
    });
  } catch {
    throw new Error("No se pudo conectar con el servidor local. Verificá que npm run dev siga activo.");
  }

  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") || "";
  const result = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) throw new Error(result?.error || `La solicitud falló (${response.status}).`);
  return result;
}

function setError(element, message = "") {
  element.textContent = message;
  element.hidden = !message;
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => {
    toast.hidden = true;
  }, 4000);
}

function showDashboard(user) {
  currentUser = user;
  loginView.hidden = true;
  dashboardView.hidden = false;
  document.querySelector("#account-label").textContent = `${user.username} · ${user.role}`;
  document.querySelector("#article-list-title").textContent = user.role === "author" ? "Mis borradores" : "Todas las noticias";
  document.querySelector("#users-tab").hidden = user.role !== "admin";
  document.querySelector("#new-user-button").hidden = user.role !== "admin";
  document.querySelector("#ads-tab").hidden = user.role !== "admin";
  if (user.role !== "admin") {
    ads = [];
    adList.replaceChildren();
    adEditorPanel.hidden = true;
  }
  if (user.role === "author") {
    statusSelect.value = "draft";
    statusSelect.disabled = true;
    document.querySelector("#save-article-button").textContent = "Guardar borrador";
    document.querySelector("#save-draft-button").hidden = true;
  }
  showManagementSection("articles");
  refreshDashboard().catch((error) => showToast(error.message));
}

async function checkSession() {
  loginView.hidden = true;
  dashboardView.hidden = true;
  try {
    const result = await request("/api/auth/me");
    showDashboard(result.user);
  } catch (error) {
    if (error.message === "La sesión no está iniciada.") {
      loginView.hidden = false;
      return;
    }
    loginView.hidden = false;
    setError(loginError, error.message);
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setError(loginError);
  const submitButton = loginForm.querySelector("button[type='submit']");
  submitButton.disabled = true;

  try {
    const result = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: loginForm.elements.username.value,
        password: loginForm.elements.password.value,
      }),
    });
    loginForm.reset();
    showDashboard(result.user);
  } catch (error) {
    setError(loginError, error.message);
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector("#logout-button").addEventListener("click", async () => {
  try {
    await request("/api/auth/logout", { method: "POST" });
    articles = [];
    currentUser = null;
    dashboardView.hidden = true;
    editorPanel.hidden = true;
    loginView.hidden = false;
    setError(loginError);
  } catch (error) {
    showToast(error.message);
  }
});

async function refreshDashboard() {
  const requests = [
    request("/api/admin/articles"),
    request("/api/categories"),
    request("/api/admin/media"),
  ];
  if (currentUser.role === "admin") requests.push(request("/api/admin/users"));
  if (currentUser.role === "admin") requests.push(request("/api/admin/ads"));
  const results = await Promise.all(requests);
  const [articleResult, categoryResult, mediaResult] = results;
  const userResult = currentUser.role === "admin" ? results[3] : null;
  const adResult = currentUser.role === "admin" ? results[4] : null;
  articles = articleResult.articles;
  populateCategories(categoryResult.categories);
  populateMedia(mediaResult.media);
  renderArticles();
  if (adResult) {
    ads = adResult.ads;
    renderAds();
  }
  if (userResult) {
    users = userResult.users;
    renderUsers();
  }
}

function showManagementSection(section) {
  const showUsers = section === "users" && currentUser.role === "admin";
  const showAds = section === "ads" && currentUser.role === "admin";
  document.querySelector("#articles-management").hidden = showUsers || showAds;
  document.querySelector("#users-management").hidden = !showUsers;
  document.querySelector("#ads-management").hidden = !showAds;
  document.querySelector("#new-article-button").hidden = showUsers || showAds;
  document.querySelector("#new-ad-button").hidden = !showAds;
  document.querySelector("#new-user-button").hidden = !showUsers;
  document.querySelector(".page-heading h1").textContent = showUsers ? "Usuarios" : showAds ? "Publicidad" : "Noticias";
  document.querySelector(".page-heading p").textContent = showUsers
    ? "Creá cuentas, asigná roles y administrá el acceso al CMS."
    : showAds
      ? "Administrá banners, ubicaciones y fechas de publicación."
      : "Creá, editá y administrá el contenido del sitio.";
  document.querySelector("#articles-tab").classList.toggle("is-active", !showUsers && !showAds);
  document.querySelector("#articles-tab").setAttribute("aria-pressed", String(!showUsers && !showAds));
  document.querySelector("#ads-tab").classList.toggle("is-active", showAds);
  document.querySelector("#ads-tab").setAttribute("aria-pressed", String(showAds));
  document.querySelector("#users-tab").classList.toggle("is-active", showUsers);
  document.querySelector("#users-tab").setAttribute("aria-pressed", String(showUsers));
}

function populateAdMedia() {
  adLibraryImage.replaceChildren();
  const noImage = document.createElement("option");
  noImage.value = "";
  noImage.textContent = "No elegir de la biblioteca";
  adLibraryImage.append(noImage);
  for (const media of mediaItems) {
    const option = document.createElement("option");
    option.value = String(media.id);
    option.textContent = media.original_filename;
    adLibraryImage.append(option);
  }
}

function updateAdImagePreview() {
  if (!adImagePath.value.trim()) {
    adImagePreview.hidden = true;
    adImagePreview.removeAttribute("src");
    return;
  }
  adImagePreview.src = adImagePath.value.trim();
  adImagePreview.alt = document.querySelector("#ad-alt-text").value.trim();
  adImagePreview.classList.toggle(
    "ad-image-preview-vertical",
    document.querySelector("#ad-placement").value === "article_sidebar",
  );
  adImagePreview.hidden = false;
}

function updateAdPlacementHelp() {
  const isVertical = document.querySelector("#ad-placement").value === "article_sidebar";
  document.querySelector("#ad-image-help").textContent = isVertical
    ? "Banner vertical: proporción recomendada 3:5 (por ejemplo, 600 × 1000 px). JPG, PNG, WebP o GIF; máximo 5 MB."
    : "Banner horizontal: proporción aproximada 7,6:1 (por ejemplo, 1144 × 150 px). JPG, PNG, WebP o GIF; máximo 5 MB.";
  updateAdImagePreview();
}

function formatAdStatus(ad) {
  const now = Date.now();
  if (!ad.is_active) return "Desactivada";
  if (new Date(ad.starts_at).getTime() > now) return "Programada";
  if (ad.ends_at && new Date(ad.ends_at).getTime() <= now) return "Finalizada";
  return "Activa";
}

function renderAds() {
  adList.replaceChildren();
  document.querySelector("#ad-count").textContent = `${ads.length} ${ads.length === 1 ? "publicidad" : "publicidades"}`;
  if (!ads.length) {
    const empty = document.createElement("p");
    empty.className = "empty-list";
    empty.textContent = "Todavía no hay publicidades. Podés crear una con “Nueva publicidad”.";
    adList.append(empty);
    return;
  }
  for (const ad of ads) {
    const row = document.createElement("article");
    row.className = "article-row";
    const main = document.createElement("div");
    main.className = "article-row-main";
    const image = document.createElement("img");
    image.className = "article-thumb ad-thumb";
    image.src = ad.image_path;
    image.alt = ad.alt_text || "";
    main.append(image);
    const copy = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = ad.title;
    const meta = document.createElement("div");
    meta.className = "article-meta";
    const status = document.createElement("span");
    status.className = "status-badge";
    status.textContent = formatAdStatus(ad);
    const placement = document.createElement("span");
    placement.textContent = {
      home_banner: "Portada",
      article_banner: "Banner horizontal en notas",
      article_sidebar: "Banner vertical lateral",
    }[ad.placement] || ad.placement;
    const dates = document.createElement("span");
    dates.textContent = `${formatDate(ad.starts_at)} – ${ad.ends_at ? formatDate(ad.ends_at) : "Sin fecha de fin"}`;
    const impressions = document.createElement("span");
    impressions.textContent = `${Number(ad.impressions_count).toLocaleString("es-AR")} impresiones`;
    const clicks = document.createElement("span");
    clicks.textContent = `${Number(ad.clicks_count).toLocaleString("es-AR")} clics`;
    meta.append(status, placement, dates, impressions, clicks);
    copy.append(title, meta);
    main.append(copy);
    const actions = document.createElement("div");
    actions.className = "article-actions";
    const editButton = document.createElement("button");
    editButton.className = "button button-secondary";
    editButton.type = "button";
    editButton.textContent = "Editar";
    editButton.addEventListener("click", () => openAdEditor(ad));
    const toggleButton = document.createElement("button");
    toggleButton.className = "button button-secondary";
    toggleButton.type = "button";
    toggleButton.textContent = ad.is_active ? "Desactivar" : "Activar";
    toggleButton.addEventListener("click", () => toggleAd(ad));
    const deleteButton = document.createElement("button");
    deleteButton.className = "button button-danger";
    deleteButton.type = "button";
    deleteButton.textContent = "Eliminar";
    deleteButton.addEventListener("click", () => deleteAd(ad));
    actions.append(editButton, toggleButton, deleteButton);
    row.append(main, actions);
    adList.append(row);
  }
}

function openAdEditor(ad = null) {
  adForm.reset();
  setError(adError);
  document.querySelector("#ad-id").value = ad ? String(ad.id) : "";
  document.querySelector("#ad-editor-title").textContent = ad ? "Editar publicidad" : "Nueva publicidad";
  document.querySelector("#save-ad-button").textContent = ad ? "Guardar cambios" : "Guardar publicidad";
  document.querySelector("#ad-title").value = ad?.title || "";
  adImagePath.value = ad?.image_path || "/assets/comunidad.jpg";
  document.querySelector("#ad-target-url").value = ad?.target_url || "";
  document.querySelector("#ad-alt-text").value = ad?.alt_text || "";
  document.querySelector("#ad-placement").value = ad?.placement || "home_banner";
  document.querySelector("#ad-starts-at").value = ad ? toLocalInputValue(ad.starts_at) : toLocalInputValue(new Date());
  document.querySelector("#ad-ends-at").value = toLocalInputValue(ad?.ends_at);
  document.querySelector("#ad-active").checked = ad ? Boolean(ad.is_active) : true;
  adLibraryImage.value = mediaItems.some((media) => media.storage_path === ad?.image_path)
    ? String(mediaItems.find((media) => media.storage_path === ad.image_path).id)
    : "";
  updateAdPlacementHelp();
  adEditorPanel.hidden = false;
  adEditorPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  document.querySelector("#ad-title").focus();
}

function closeAdEditor() {
  adEditorPanel.hidden = true;
  setError(adError);
}

async function saveAd(event) {
  event.preventDefault();
  setError(adError);
  if (!adForm.reportValidity()) return;
  const id = document.querySelector("#ad-id").value;
  const startsAt = document.querySelector("#ad-starts-at").value;
  const endsAt = document.querySelector("#ad-ends-at").value;
  const payload = {
    title: document.querySelector("#ad-title").value.trim(),
    image_path: adImagePath.value.trim(),
    target_url: document.querySelector("#ad-target-url").value.trim(),
    alt_text: document.querySelector("#ad-alt-text").value.trim() || null,
    placement: document.querySelector("#ad-placement").value,
    starts_at: startsAt ? new Date(startsAt).toISOString() : "",
    ends_at: endsAt ? new Date(endsAt).toISOString() : null,
    is_active: document.querySelector("#ad-active").checked,
  };
  const submitButton = document.querySelector("#save-ad-button");
  submitButton.disabled = true;
  try {
    await request(id ? `/api/admin/ads/${encodeURIComponent(id)}` : "/api/admin/ads", {
      method: id ? "PATCH" : "POST",
      body: JSON.stringify(payload),
    });
    closeAdEditor();
    await refreshDashboard();
    showToast(id ? "Publicidad actualizada." : "Publicidad creada.");
  } catch (error) {
    setError(adError, error.message);
  } finally {
    submitButton.disabled = false;
  }
}

async function toggleAd(ad) {
  try {
    await request(`/api/admin/ads/${encodeURIComponent(ad.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: !ad.is_active }),
    });
    await refreshDashboard();
    showToast(ad.is_active ? "Publicidad desactivada." : "Publicidad activada.");
  } catch (error) {
    showToast(error.message);
  }
}

async function deleteAd(ad) {
  if (!window.confirm(`¿Eliminar “${ad.title}”? Esta acción no se puede deshacer.`)) return;
  try {
    await request(`/api/admin/ads/${encodeURIComponent(ad.id)}`, { method: "DELETE" });
    await refreshDashboard();
    showToast("Publicidad eliminada.");
  } catch (error) {
    showToast(error.message);
  }
}

function formatUserDate(value) {
  if (!value) return "Nunca ingresó";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return `Último acceso: ${new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)}`;
}

function renderUsers() {
  userList.replaceChildren();
  document.querySelector("#user-count").textContent = `${users.length} ${users.length === 1 ? "usuario" : "usuarios"}`;
  if (!users.length) {
    const empty = document.createElement("p");
    empty.className = "empty-list";
    empty.textContent = "No hay usuarios para mostrar.";
    userList.append(empty);
    return;
  }
  for (const user of users) {
    const row = document.createElement("article");
    row.className = `article-row${user.is_active ? "" : " user-disabled"}`;
    const info = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = user.username;
    const metadata = document.createElement("div");
    metadata.className = "user-info";
    const email = document.createElement("span");
    email.textContent = user.email;
    const role = document.createElement("span");
    role.className = "status-badge user-role";
    role.textContent = user.role_name;
    const lastLogin = document.createElement("span");
    lastLogin.textContent = formatUserDate(user.last_login_at);
    metadata.append(email, role, lastLogin);
    info.append(title, metadata);

    const actions = document.createElement("div");
    actions.className = "article-actions";
    const editButton = document.createElement("button");
    editButton.className = "button button-secondary";
    editButton.type = "button";
    editButton.textContent = "Editar";
    editButton.addEventListener("click", () => openUserEditor(user));
    actions.append(editButton);
    if (Number(user.id) !== Number(currentUser.id)) {
      const statusButton = document.createElement("button");
      statusButton.className = user.is_active ? "button button-danger" : "button button-secondary";
      statusButton.type = "button";
      statusButton.textContent = user.is_active ? "Desactivar" : "Reactivar";
      statusButton.addEventListener("click", () => toggleUserStatus(user));
      actions.append(statusButton);
    }
    row.append(info, actions);
    userList.append(row);
  }
}

function openUserEditor(user = null) {
  userForm.reset();
  setError(userError);
  const isEditing = Boolean(user);
  document.querySelector("#user-id").value = user ? String(user.id) : "";
  document.querySelector("#user-editor-title").textContent = isEditing ? "Editar usuario" : "Nuevo usuario";
  document.querySelector("#save-user-button").textContent = isEditing ? "Guardar cambios" : "Crear usuario";
  document.querySelector("#user-username").value = user?.username || "";
  document.querySelector("#user-email").value = user?.email || "";
  document.querySelector("#user-role").value = user?.role || "author";
  document.querySelector("#user-password").value = "";
  document.querySelector("#user-password").required = !isEditing;
  document.querySelector("#password-required").hidden = isEditing;
  document.querySelector("#password-help").textContent = isEditing
    ? "Dejalo vacío para conservar la contraseña actual. Si la cambiás, debe tener al menos 12 caracteres."
    : "Mínimo 12 caracteres. No se muestra ni se recupera después de crearla.";
  document.querySelector("#user-active-field").hidden = !isEditing;
  document.querySelector("#user-active").checked = user ? Boolean(user.is_active) : true;
  userEditorPanel.hidden = false;
  userEditorPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  document.querySelector("#user-username").focus();
}

function closeUserEditor() {
  userEditorPanel.hidden = true;
  setError(userError);
}

async function saveUser(event) {
  event.preventDefault();
  setError(userError);
  if (!userForm.reportValidity()) return;
  const id = document.querySelector("#user-id").value;
  const password = document.querySelector("#user-password").value;
  const payload = {
    username: document.querySelector("#user-username").value.trim(),
    email: document.querySelector("#user-email").value.trim(),
    role: document.querySelector("#user-role").value,
  };
  if (password) payload.password = password;
  if (id) payload.is_active = document.querySelector("#user-active").checked;
  const submitButton = document.querySelector("#save-user-button");
  submitButton.disabled = true;
  try {
    await request(id ? `/api/admin/users/${encodeURIComponent(id)}` : "/api/admin/users", {
      method: id ? "PATCH" : "POST",
      body: JSON.stringify(payload),
    });
    closeUserEditor();
    await refreshDashboard();
    showToast(id ? "Usuario actualizado." : "Usuario creado.");
  } catch (error) {
    setError(userError, error.message);
  } finally {
    submitButton.disabled = false;
  }
}

async function toggleUserStatus(user) {
  const isActive = Boolean(user.is_active);
  const action = isActive ? "desactivar" : "reactivar";
  if (!window.confirm(`¿Querés ${action} la cuenta de “${user.username}”?${isActive ? " No se borrarán sus noticias ni su historial." : ""}`)) return;
  try {
    if (isActive) {
      await request(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: "DELETE" });
    } else {
      await request(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: true }),
      });
    }
    await refreshDashboard();
    showToast(isActive ? "Usuario desactivado. Se conservaron sus noticias e historial." : "Usuario reactivado.");
  } catch (error) {
    showToast(error.message);
  }
}

function populateCategories(categories) {
  const currentValue = categorySelect.value;
  categorySelect.replaceChildren();
  for (const category of categories) {
    const option = document.createElement("option");
    option.value = category.slug;
    option.textContent = category.name;
    categorySelect.append(option);
  }
  if (categories.some((category) => category.slug === currentValue)) categorySelect.value = currentValue;
}

function populateMedia(items) {
  mediaItems = items;
  populateAdMedia();
  const currentValue = mediaSelect.value;
  mediaSelect.replaceChildren();
  const noImage = document.createElement("option");
  noImage.value = "";
  noImage.textContent = "Sin imagen";
  mediaSelect.append(noImage);
  for (const media of items) {
    const option = document.createElement("option");
    option.value = String(media.id);
    option.dataset.altText = media.alt_text || "";
    option.dataset.path = media.storage_path;
    option.textContent = media.original_filename;
    mediaSelect.append(option);
  }
  if (items.some((media) => String(media.id) === currentValue)) mediaSelect.value = currentValue;
}

function populateGalleryMedia(selectedIds = []) {
  galleryMediaList.replaceChildren();
  const selected = new Set(selectedIds.map(Number).filter((id) => id !== Number(mediaSelect.value)));
  const articleGallery = mediaItems.filter((media) => selected.has(Number(media.id)));
  for (const media of articleGallery) {
    const label = document.createElement("label");
    label.className = "gallery-media-item";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = String(media.id);
    checkbox.checked = true;
    checkbox.disabled = String(media.id) === mediaSelect.value;
    label.classList.toggle("is-selected", checkbox.checked);
    const image = document.createElement("img");
    image.src = media.storage_path;
    image.alt = "";
    const filename = document.createElement("span");
    filename.textContent = media.original_filename;
    label.append(checkbox, image, filename);
    galleryMediaList.append(label);
  }
  if (!articleGallery.length) {
    const empty = document.createElement("p");
    empty.className = "empty-list";
    empty.textContent = "Esta noticia todavía no tiene imágenes en su galería. Usá “Agregar imágenes” para subirlas.";
    galleryMediaList.append(empty);
  }
  updateGallerySelectionCount();
}

function selectedGalleryMediaIds() {
  return [...galleryMediaList.querySelectorAll("input:checked")].map((input) => Number(input.value));
}

function updateGallerySelectionCount() {
  const count = selectedGalleryMediaIds().length;
  gallerySelectionCount.textContent = `${count} / 20 seleccionadas`;
}

function formatDate(value) {
  if (!value) return "Sin fecha de publicación";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function renderArticles() {
  const selectedStatus = document.querySelector("#status-filter").value;
  const filteredArticles = selectedStatus
    ? articles.filter((article) => article.status === selectedStatus)
    : articles;
  articleList.replaceChildren();
  document.querySelector("#article-count").textContent = `${filteredArticles.length} ${filteredArticles.length === 1 ? "noticia" : "noticias"}`;

  if (!filteredArticles.length) {
    const empty = document.createElement("p");
    empty.className = "empty-list";
    empty.textContent = currentUser.role === "author"
      ? "Todavía no tenés borradores. Podés crear uno con “Nueva noticia”."
      : "No hay noticias para mostrar. Creá la primera con “Nueva noticia”.";
    articleList.append(empty);
    return;
  }

  for (const article of filteredArticles) {
    const row = document.createElement("article");
    row.className = "article-row";
    const main = document.createElement("div");
    main.className = "article-row-main";
    if (article.image_path) {
      const image = document.createElement("img");
      image.className = "article-thumb";
      image.src = article.image_path;
      image.alt = article.image_alt || "";
      main.append(image);
    }
    const copy = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = article.title;
    const meta = document.createElement("div");
    meta.className = "article-meta";
    const status = document.createElement("span");
    status.className = `status-badge status-${article.status}`;
    status.textContent = statuses[article.status] || article.status;
    const category = document.createElement("span");
    category.textContent = article.category_name;
    const date = document.createElement("time");
    date.dateTime = article.published_at || article.updated_at;
    date.textContent = article.status === "draft" ? `Actualizada ${formatDate(article.updated_at)}` : formatDate(article.published_at);
    const views = document.createElement("span");
    views.textContent = `${Number(article.views_count).toLocaleString("es-AR")} vistas`;
    meta.append(status, category, date, views);
    copy.append(title, meta);
    main.append(copy);

    const actions = document.createElement("div");
    actions.className = "article-actions";
    const editButton = document.createElement("button");
    editButton.className = "button button-secondary";
    editButton.type = "button";
    editButton.textContent = "Editar";
    editButton.addEventListener("click", () => openEditor(article));
    const deleteButton = document.createElement("button");
    deleteButton.className = "button button-danger";
    deleteButton.type = "button";
    deleteButton.textContent = "Eliminar";
    deleteButton.addEventListener("click", () => deleteArticle(article));
    actions.append(editButton, deleteButton);
    row.append(main, actions);
    articleList.append(row);
  }
}

function toLocalInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function updateScheduleField() {
  const isScheduled = statusSelect.value === "scheduled";
  scheduleField.hidden = !isScheduled;
  publishedAtInput.required = isScheduled;
}

function updateImagePreview() {
  const selectedMedia = mediaItems.find((item) => String(item.id) === mediaSelect.value);
  if (!selectedMedia) {
    imagePreview.hidden = true;
    imagePreview.removeAttribute("src");
    return;
  }
  imagePreview.src = selectedMedia.storage_path;
  imagePreview.alt = imageAltText.value || selectedMedia.alt_text || "";
  imagePreview.hidden = false;
  if (!imageAltText.value) imageAltText.value = selectedMedia.alt_text || "";
}

function openEditor(article = null) {
  articleForm.reset();
  setError(articleError);
  initialPublishedAt = article?.published_at || null;
  document.querySelector("#article-id").value = article ? String(article.id) : "";
  document.querySelector("#editor-title").textContent = article ? "Editar noticia" : "Nueva noticia";
  document.querySelector("#article-title").value = article?.title || "";
  document.querySelector("#article-slug").value = article?.slug || "";
  document.querySelector("#article-slug").placeholder = article ? "Slug de la noticia" : "Se genera automáticamente desde el título";
  document.querySelector("#article-summary").value = article?.summary || "";
  articleBodyEditor.replaceChildren(ArticleRichText.createFragment(article?.body || ""));
  articleBodyEditor.removeAttribute("aria-invalid");
  document.querySelector("#article-featured").checked = Boolean(article?.is_featured);
  categorySelect.value = article?.category_slug || categorySelect.options[0]?.value || "";
  statusSelect.value = currentUser.role === "author" ? "draft" : article?.status || "draft";
  if (currentUser.role !== "author") statusSelect.disabled = false;
  publishedAtInput.value = toLocalInputValue(article?.published_at);
  const selectedMedia = mediaItems.find((item) => item.storage_path === article?.image_path);
  mediaSelect.value = selectedMedia ? String(selectedMedia.id) : "";
  imageAltText.value = article?.image_alt || selectedMedia?.alt_text || "";
  populateGalleryMedia(article?.gallery_media_ids || []);
  updateScheduleField();
  updateImagePreview();
  editorPanel.hidden = false;
  editorPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  document.querySelector("#article-title").focus();
}

function closeEditor() {
  editorPanel.hidden = true;
  setError(articleError);
}

function buildArticlePayload(forceDraft = false) {
  const status = forceDraft || currentUser.role === "author" ? "draft" : statusSelect.value;
  const publishedAt = status === "scheduled"
    ? publishedAtInput.value ? new Date(publishedAtInput.value).toISOString() : ""
    : status === "published" && initialPublishedAt
      ? initialPublishedAt
      : null;
  return {
    title: document.querySelector("#article-title").value.trim(),
    slug: document.querySelector("#article-slug").value.trim() || undefined,
    summary: document.querySelector("#article-summary").value.trim() || null,
    body: ArticleRichText.toHtml(articleBodyEditor.innerHTML),
    category: categorySelect.value,
    status,
    published_at: publishedAt,
    featured_media_id: mediaSelect.value ? Number(mediaSelect.value) : null,
    gallery_media_ids: [...galleryMediaList.querySelectorAll("input:checked")]
      .map((input) => Number(input.value))
      .filter((id) => id !== Number(mediaSelect.value)),
    is_featured: document.querySelector("#article-featured").checked,
  };
}

async function saveArticle(forceDraft = false) {
  setError(articleError);
  const scheduleRequired = publishedAtInput.required;
  if (forceDraft) publishedAtInput.required = false;
  const isValid = articleForm.reportValidity();
  publishedAtInput.required = scheduleRequired;
  if (!isValid) return;
  if (!categorySelect.value) {
    setError(articleError, "No hay categorías disponibles en la base de datos.");
    return;
  }
  if (!articleBodyEditor.textContent.trim()) {
    articleBodyEditor.setAttribute("aria-invalid", "true");
    articleBodyEditor.focus();
    setError(articleError, "Escribí el contenido de la noticia.");
    return;
  }
  articleBodyEditor.removeAttribute("aria-invalid");
  const payload = buildArticlePayload(forceDraft);
  if (payload.status === "scheduled" && !payload.published_at) {
    setError(articleError, "Elegí la fecha y hora de publicación.");
    return;
  }

  const id = document.querySelector("#article-id").value;
  const selectedMedia = mediaItems.find((item) => String(item.id) === mediaSelect.value);
  const buttons = [...articleForm.querySelectorAll("button")];
  buttons.forEach((button) => { button.disabled = true; });
  try {
    if (selectedMedia && (selectedMedia.alt_text || "") !== imageAltText.value.trim()) {
      const updatedMedia = await request(`/api/admin/media/${encodeURIComponent(selectedMedia.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ alt_text: imageAltText.value.trim() || null }),
      });
      selectedMedia.alt_text = updatedMedia.alt_text;
    }
    await request(id ? `/api/admin/articles/${encodeURIComponent(id)}` : "/api/admin/articles", {
      method: id ? "PATCH" : "POST",
      body: JSON.stringify(payload),
    });
    closeEditor();
    await refreshDashboard();
    showToast(forceDraft || payload.status === "draft" ? "Borrador guardado." : "Noticia guardada.");
  } catch (error) {
    setError(articleError, error.message);
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

async function deleteArticle(article) {
  if (!window.confirm(`¿Eliminar “${article.title}”? Esta acción no se puede deshacer.`)) return;
  try {
    await request(`/api/admin/articles/${encodeURIComponent(article.id)}`, { method: "DELETE" });
    await refreshDashboard();
    showToast("Noticia eliminada.");
  } catch (error) {
    showToast(error.message);
  }
}

document.querySelector("#new-article-button").addEventListener("click", () => openEditor());
document.querySelector("#close-editor-button").addEventListener("click", closeEditor);
document.querySelector("#cancel-editor-button").addEventListener("click", closeEditor);
document.querySelector("#save-draft-button").addEventListener("click", () => saveArticle(true));
const editorToolbarButtons = [...document.querySelectorAll("[data-editor-command]")];
const toggleEditorCommands = new Set([
  "bold", "italic", "underline", "insertUnorderedList", "insertOrderedList", "createLink",
]);

function updateEditorToolbar() {
  const selection = window.getSelection();
  const hasEditorSelection = selection?.rangeCount > 0
    && articleBodyEditor.contains(selection.anchorNode)
    && articleBodyEditor.contains(selection.focusNode);

  for (const button of editorToolbarButtons) {
    const command = button.dataset.editorCommand;
    const value = button.dataset.editorValue?.toLowerCase();
    let isActive = false;

    if (hasEditorSelection && toggleEditorCommands.has(command)) {
      isActive = document.queryCommandState(command);
    } else if (hasEditorSelection && command === "formatBlock") {
      const block = document.queryCommandValue(command).replace(/[<>]/g, "").toLowerCase();
      isActive = block === value;
    }

    button.classList.toggle("is-selected", isActive);
    if (toggleEditorCommands.has(command) || command === "formatBlock") {
      button.setAttribute("aria-pressed", String(isActive));
    }
  }
}

editorToolbarButtons.forEach((button) => {
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => {
    const command = button.dataset.editorCommand;
    if (command === "createLink") {
      const url = window.prompt("Ingresá la dirección del enlace (https://…):");
      if (!url) {
        updateEditorToolbar();
        return;
      }
      document.execCommand(command, false, url);
    } else {
      document.execCommand(command, false, button.dataset.editorValue || null);
    }
    articleBodyEditor.focus();
    articleBodyEditor.removeAttribute("aria-invalid");
    updateEditorToolbar();
  });
});
articleBodyEditor.addEventListener("input", () => articleBodyEditor.removeAttribute("aria-invalid"));
for (const eventName of ["keyup", "mouseup", "input", "focus"]) {
  articleBodyEditor.addEventListener(eventName, updateEditorToolbar);
}
document.addEventListener("selectionchange", updateEditorToolbar);
articleForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveArticle(false);
});
statusSelect.addEventListener("change", updateScheduleField);
mediaSelect.addEventListener("change", () => {
  const selectedMedia = mediaItems.find((item) => String(item.id) === mediaSelect.value);
  const selectedGalleryIds = selectedGalleryMediaIds();
  imageAltText.value = selectedMedia?.alt_text || "";
  updateImagePreview();
  populateGalleryMedia(selectedGalleryIds);
});
imageAltText.addEventListener("input", () => {
  imagePreview.alt = imageAltText.value;
});
document.querySelector("#status-filter").addEventListener("change", renderArticles);
document.querySelector("#articles-tab").addEventListener("click", () => showManagementSection("articles"));
document.querySelector("#ads-tab").addEventListener("click", () => showManagementSection("ads"));
document.querySelector("#users-tab").addEventListener("click", () => showManagementSection("users"));
document.querySelector("#new-ad-button").addEventListener("click", () => openAdEditor());
document.querySelector("#close-ad-editor-button").addEventListener("click", closeAdEditor);
document.querySelector("#cancel-ad-editor-button").addEventListener("click", closeAdEditor);
adForm.addEventListener("submit", saveAd);
document.querySelector("#ad-placement").addEventListener("change", updateAdPlacementHelp);
adImagePath.addEventListener("input", updateAdImagePreview);
document.querySelector("#ad-alt-text").addEventListener("input", updateAdImagePreview);
adLibraryImage.addEventListener("change", () => {
  const selectedMedia = mediaItems.find((item) => String(item.id) === adLibraryImage.value);
  if (!selectedMedia) return;
  adImagePath.value = selectedMedia.storage_path;
  document.querySelector("#ad-alt-text").value = selectedMedia.alt_text || "";
  updateAdImagePreview();
});
document.querySelector("#upload-ad-image-button").addEventListener("click", () => adImageFileInput.click());
adImageFileInput.addEventListener("change", async () => {
  const file = adImageFileInput.files?.[0];
  if (!file) return;
  const formData = new FormData();
  formData.append("image", file);
  formData.append("alt_text", document.querySelector("#ad-alt-text").value.trim());
  const uploadButton = document.querySelector("#upload-ad-image-button");
  uploadButton.disabled = true;
  try {
    const result = await request("/api/admin/media/upload", { method: "POST", body: formData });
    mediaItems.unshift(result.media);
    populateMedia(mediaItems);
    adLibraryImage.value = String(result.media.id);
    adImagePath.value = result.media.storage_path;
    if (!document.querySelector("#ad-alt-text").value.trim()) {
      document.querySelector("#ad-alt-text").value = result.media.alt_text || "";
    }
    updateAdImagePreview();
    showToast("Imagen subida y lista para la publicidad.");
  } catch (error) {
    setError(adError, error.message);
  } finally {
    uploadButton.disabled = false;
    adImageFileInput.value = "";
  }
});
document.querySelector("#new-user-button").addEventListener("click", () => openUserEditor());
document.querySelector("#close-user-editor-button").addEventListener("click", closeUserEditor);
document.querySelector("#cancel-user-editor-button").addEventListener("click", closeUserEditor);
userForm.addEventListener("submit", saveUser);
document.querySelector("#upload-image-button").addEventListener("click", () => imageFileInput.click());
document.querySelector("#upload-gallery-images-button").addEventListener("click", () => galleryImageFiles.click());
galleryMediaList.addEventListener("change", (event) => {
  const checkbox = event.target;
  if (!(checkbox instanceof HTMLInputElement) || checkbox.type !== "checkbox") return;
  if (selectedGalleryMediaIds().length > 20) {
    checkbox.checked = false;
    setError(articleError, "Podés seleccionar hasta 20 imágenes adicionales para esta noticia.");
  } else {
    setError(articleError);
  }
  checkbox.closest(".gallery-media-item")?.classList.toggle("is-selected", checkbox.checked);
  updateGallerySelectionCount();
});
galleryImageFiles.addEventListener("change", async () => {
  const files = [...(galleryImageFiles.files || [])];
  if (!files.length) return;
  const currentIds = new Set([...galleryMediaList.querySelectorAll("input:checked")].map((input) => Number(input.value)));
  if (currentIds.size + files.length > 20) {
    setError(articleError, "La galería admite hasta 20 imágenes adicionales.");
    galleryImageFiles.value = "";
    return;
  }
  const uploadButton = document.querySelector("#upload-gallery-images-button");
  uploadButton.disabled = true;
  setError(articleError);
  try {
    for (const file of files) {
      const formData = new FormData();
      formData.append("image", file);
      const result = await request("/api/admin/media/upload", { method: "POST", body: formData });
      mediaItems.unshift(result.media);
      currentIds.add(Number(result.media.id));
    }
    populateMedia(mediaItems);
    populateGalleryMedia([...currentIds]);
    showToast(`${files.length} ${files.length === 1 ? "imagen subida" : "imágenes subidas"} para la galería.`);
  } catch (error) {
    setError(articleError, error.message);
    populateMedia(mediaItems);
    populateGalleryMedia([...currentIds]);
  } finally {
    uploadButton.disabled = false;
    galleryImageFiles.value = "";
  }
});
imageFileInput.addEventListener("change", async () => {
  const file = imageFileInput.files?.[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("image", file);
  formData.append("alt_text", imageAltText.value.trim());
  const uploadButton = document.querySelector("#upload-image-button");
  uploadButton.disabled = true;
  try {
    const result = await request("/api/admin/media/upload", { method: "POST", body: formData });
    const media = result.media;
    mediaItems.unshift(media);
    populateMedia(mediaItems);
    mediaSelect.value = String(media.id);
    updateImagePreview();
    showToast("Imagen subida y lista para asociar.");
  } catch (error) {
    setError(articleError, error.message);
  } finally {
    uploadButton.disabled = false;
    imageFileInput.value = "";
  }
});

checkSession();

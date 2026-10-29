# Backend y CMS local

El backend local usa Node.js, Express y MySQL. Se conecta a la base `del_salado_noticias`, entrega las páginas estáticas actuales y expone la API bajo `/api`. Las credenciales se guardan solo en `.env`; nunca se colocan en el HTML o en el JavaScript del navegador.

## Requisitos

- Node.js 20 o posterior.
- MySQL en la computadora local y el esquema inicial ya creado desde Workbench.

## Preparar MySQL con Workbench

1. Abrí `database/local-backend.sql`. Si ya preparaste MySQL anteriormente, volvé a ejecutar el script para crear las tablas de publicidad y galería, y cargar los anuncios de ejemplo; el resto de los pasos es idempotente.
2. Reemplazá `REPLACE_WITH_A_UNIQUE_STRONG_PASSWORD` por una contraseña única elegida para el usuario de la aplicación. No uses la contraseña de `root`. Si ya existe el usuario `dsn_cms`, conservá la contraseña que ya usás en `.env`.
3. Ejecutá el script en Workbench conectado a MySQL como administrador.

El script crea las tablas de sesiones y publicidades, carga dos anuncios de ejemplo y crea el usuario `dsn_cms`, con permisos de lectura y escritura para las tablas de la base del CMS.

## Preparar el servidor

En la raíz del proyecto ya está preparado `.env`, ignorado por Git, con un `SESSION_SECRET` aleatorio. Después de ejecutar el SQL, completá `MYSQL_PASSWORD` con la misma contraseña única que elegiste para `dsn_cms` en Workbench. No compartas el contenido de `.env`.

Si necesitás recrear `.env`, copiá `.env.example` y generá un secreto aleatorio de al menos 32 caracteres. En PowerShell:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Luego, desde la raíz del proyecto:

```powershell
npm install
npm run create-admin -- administrador correo@ejemplo.com
npm run dev
```

El comando para crear el administrador pide la contraseña dos veces sin mostrarla ni guardarla en el historial de comandos.

La página local estará en `http://127.0.0.1:3000`. La API de salud estará en `http://127.0.0.1:3000/api/health` y debe informar que MySQL está conectado.

## Preparar el despliegue en Hostinger

En una aplicación Node.js de Hostinger, configurá las variables de entorno desde el panel del hosting; no subas el `.env` local:

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `PORT`: el puerto asignado por Hostinger, si el panel lo requiere.
- `TRUST_PROXY`: la cantidad de proxies inversos confiables entre el visitante y Node.js. En un despliegue con un único proxy, configurá `1`; confirmá el valor con Hostinger y no uses una confianza ilimitada.
- `SESSION_SECRET`: un secreto aleatorio propio de producción de al menos 32 caracteres.
- `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER` y `MYSQL_PASSWORD`: los datos de la base MySQL de producción.
- `MEDIA_UPLOAD_DIR` (opcional): ruta absoluta a un directorio persistente para las imágenes subidas. Por defecto, la aplicación usa `dsn-media/uploads` dentro del directorio personal de la cuenta, fuera de las versiones desplegadas.

La aplicación exige `TRUST_PROXY` en producción: Express lo usa para identificar correctamente a los clientes y para que las cookies de sesión seguras funcionen cuando HTTPS termina en el proxy. En desarrollo local queda desactivado por defecto. Si usás un túnel con exactamente un proxy, podés configurar `TRUST_PROXY=1` en tu `.env` local.

Antes de abrir el sitio, hacé una copia de seguridad e importá la base de producción. `database/local-backend.sql` solo crea tablas adicionales del CMS y presupone que ya existen las tablas centrales (`articles`, `users`, `categories` y otras); no es una copia completa de la base. Conservá también las imágenes que estén referenciadas por noticias, galerías o publicidades.

Las imágenes subidas por el CMS se guardan fuera del código desplegado: los enlaces públicos siguen usando `/assets/uploads/...`, pero el servidor sirve esos archivos desde `MEDIA_UPLOAD_DIR`. Esto evita que un despliegue nuevo reemplace las imágenes con el contenido del repositorio. El directorio se crea al subir la primera imagen; comprobá que la cuenta de Node.js pueda escribir en él. Las imágenes faltantes de despliegues anteriores no se recuperan automáticamente y deben volver a subirse.

Después de respaldar la base, ejecutá una vez `database/migrations/20261028-category-update.sql` en Workbench, tanto en la base local como en la de producción. La migración crea las categorías Capital y Banda, reasigna a Locales las noticias que estaban en Policiales y elimina las categorías anteriores Capital y Banda y Policiales. No hay artículos actualmente asignados a la categoría anterior Capital y Banda.

## Usar el CMS

1. Con el servidor local en marcha, abrí `http://127.0.0.1:3000/admin`.
2. Iniciá sesión con el usuario creado mediante `npm run create-admin`.
3. Desde el panel podés crear y editar noticias, elegir categoría y estado, programar publicaciones, marcar destacadas, administrar su imagen principal y subir hasta 20 imágenes adicionales para el carrusel del detalle de cada noticia. El contenido incluye una barra para aplicar negrita, cursiva, subrayado, títulos, listas, citas y enlaces.
4. El botón **Subir imagen** admite JPG, PNG, WebP o GIF de hasta 5 MB. Las imágenes se guardan en el directorio persistente de medios y quedan registradas en la biblioteca de medios.
5. Los autores solo pueden administrar sus propios borradores. Los administradores y editores pueden gestionar todos los artículos.
6. En la pestaña **Usuarios** (solo visible para administradores) podés crear cuentas, editar usuario/correo/rol, cambiar la contraseña y activar o desactivar el acceso. Las contraseñas nuevas deben tener al menos 12 caracteres.
7. La desactivación conserva las noticias y el historial vinculados a la cuenta, pero bloquea el acceso al CMS. No se permite desactivar al administrador activo que sea el único restante ni desactivar la propia cuenta.
8. En **Publicidad** (para administradores y editores) podés crear, editar, activar, programar y eliminar banners para la portada o las notas, incluyendo un banner vertical lateral. Podés subir una imagen desde el formulario o elegir una de la biblioteca. El panel muestra impresiones y clics aproximados; una impresión se cuenta cuando el banner entra en pantalla.

El sitio público local ya consume las noticias publicadas de la base. Esta integración local no modifica la versión que esté publicada fuera de la computadora.

El pronóstico de la portada usa Open-Meteo para Santiago del Estero capital; requiere conexión a internet y se actualiza cada 15 minutos mientras la página está abierta.

## API disponible

- `POST /api/auth/login`: inicia sesión con nombre de usuario o correo y contraseña.
- `GET /api/auth/me`: devuelve el usuario de la sesión activa.
- `POST /api/auth/logout`: cierra la sesión.
- `GET /api/categories`: devuelve las categorías activas.
- `GET /api/articles?view=latest`: noticias publicadas ordenadas por fecha descendente.
- `GET /api/articles?view=featured`: noticias publicadas ordenadas por visualizaciones descendentes.
- `GET /api/articles?category=politica`: filtra por slug de categoría.
- `GET /api/articles/:slug`: devuelve una noticia publicada, sus imágenes de galería y registra una visualización.
- `GET /api/ads`: devuelve las publicidades activas y vigentes; admite `?placement=home_banner`, `?placement=article_banner` o `?placement=article_sidebar`.
- `POST /api/ads/:id/impression` y `POST /api/ads/:id/click`: registran métricas agregadas de una publicidad vigente.
- `/api/admin/articles`: operaciones autenticadas para consultar, crear, editar y borrar noticias. Los autores solo pueden gestionar sus propios borradores.
- `/api/admin/ads`: ABM de publicidades, disponible para administradores y editores.
- `/api/admin/media`: biblioteca autenticada para consultar imágenes, actualizar su texto alternativo y subir nuevas.
- `/api/admin/users`: ABM de usuarios, exclusivo para administradores. `DELETE` desactiva la cuenta para preservar referencias en artículos y medios.
- El endpoint `featured` sirve para construir “más vistas”; hasta que haya visitas acumuladas, los empates se ordenan por fecha de publicación.

## Notas

- Las fechas de publicación se interpretan como UTC.
- Una noticia solo aparece públicamente cuando su estado es `published` y su fecha de publicación ya llegó.
- Las publicidades de ejemplo se pueden modificar o borrar desde el CMS. Las imágenes deben estar en `/assets`; se admiten enlaces HTTPS o rutas internas.
- Las métricas son orientativas y no identifican visitantes.
- La sesión dura ocho horas y se almacena en MySQL.
- En desarrollo el servidor escucha solo en `127.0.0.1`. En producción usa `HOST` (por defecto `0.0.0.0`) y requiere configurar `TRUST_PROXY`.

const bcrypt = require("bcryptjs");
const pool = require("../server/db");

function readHidden(prompt) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    return Promise.reject(new Error("Ejecutá este comando desde una terminal interactiva para ingresar la contraseña de forma segura."));
  }

  return new Promise((resolve, reject) => {
    const input = process.stdin;
    let value = "";
    process.stdout.write(prompt);
    input.setRawMode(true);
    input.resume();

    const finish = (error) => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (buffer) => {
      const character = buffer.toString("utf8");
      if (character === "\u0003") return finish(new Error("Operación cancelada."));
      if (character === "\r" || character === "\n") return finish();
      if (character === "\u007f" || character === "\b") {
        value = Array.from(value).slice(0, -1).join("");
      } else if (!/[\u0000-\u001f]/.test(character)) {
        value += character;
      }
    };

    input.on("data", onData);
  });
}

async function createAdmin() {
  const [usernameInput, emailInput] = process.argv.slice(2);
  if (!usernameInput || !emailInput) {
    throw new Error("Uso: npm run create-admin -- <usuario> <correo>");
  }
  const username = usernameInput.trim();
  const email = emailInput.trim().toLowerCase();
  if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(username)) {
    throw new Error("El usuario debe tener entre 3 y 50 caracteres alfanuméricos, punto, guion o guion bajo.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error("Ingresá una dirección de correo válida.");
  }

  const password = await readHidden("Contraseña (mínimo 12 caracteres): ");
  if (password.length < 12 || password.length > 1024) {
    throw new Error("La contraseña debe tener entre 12 y 1024 caracteres.");
  }
  const confirmation = await readHidden("Repetí la contraseña: ");
  if (password !== confirmation) throw new Error("Las contraseñas no coinciden.");

  const [existing] = await pool.execute(
    "SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1",
    [username, email],
  );
  if (existing.length) throw new Error("Ya existe un usuario con ese nombre o correo.");

  const passwordHash = await bcrypt.hash(password, 12);
  const [result] = await pool.execute(
    `INSERT INTO users (role_id, username, email, password_hash)
     SELECT id, ?, ?, ? FROM roles WHERE slug = 'admin'`,
    [username, email, passwordHash],
  );
  if (result.affectedRows !== 1) throw new Error("No se encontró el rol admin en la base de datos.");
  console.log(`Usuario administrador "${username}" creado correctamente.`);
}

createAdmin()
  .catch((error) => {
    console.error("No se pudo crear el administrador:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

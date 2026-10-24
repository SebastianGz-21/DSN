const test = require("node:test");
const assert = require("node:assert/strict");
const { validateUser } = require("./users");

test("validateUser accepts a new account and normalizes its email", () => {
  const result = validateUser({
    username: "editor.local",
    email: "EDITOR@EJEMPLO.COM",
    role: "editor",
    password: "a-secure-password-123",
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.value.email, "editor@ejemplo.com");
});

test("validateUser rejects short passwords, invalid roles, and malformed usernames", () => {
  const result = validateUser({
    username: "x",
    email: "not-an-email",
    role: "superadmin",
    password: "short",
  });

  assert.equal(result.errors.length, 4);
});

test("validateUser accepts partial updates without requiring password changes", () => {
  const result = validateUser({ is_active: false }, { partial: true });

  assert.deepEqual(result.errors, []);
  assert.equal(result.value.isActive, false);
});

test("validateUser rejects unknown fields in partial updates", () => {
  const result = validateUser({ password_hash: "not-allowed" }, { partial: true });

  assert.deepEqual(result.errors, ["Campo no permitido: password_hash."]);
});

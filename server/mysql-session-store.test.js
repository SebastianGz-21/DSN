const test = require("node:test");
const assert = require("node:assert/strict");
const MySQLSessionStore = require("./mysql-session-store");

const callbackResult = (action) => new Promise((resolve, reject) => {
  action((error, value) => error ? reject(error) : resolve(value));
});

test("session store persists session data with a UTC expiration", async () => {
  const queries = [];
  const store = new MySQLSessionStore({
    execute: async (...args) => {
      queries.push(args);
      return [[], []];
    },
  });
  const sessionData = { user: { id: 1 }, cookie: { expires: new Date(Date.now() + 60_000).toISOString() } };

  try {
    await callbackResult((callback) => store.set("session-id", sessionData, callback));
    assert.match(queries[0][0], /INSERT INTO cms_sessions/);
    assert.equal(queries[0][1][0], "session-id");
    assert.equal(JSON.parse(queries[0][1][2]).user.id, 1);
    assert.ok(queries[0][1][1] > Math.floor(Date.now() / 1000));
  } finally {
    store.close();
  }
});

test("session store returns no value for an unknown session", async () => {
  const store = new MySQLSessionStore({ execute: async () => [[], []] });
  try {
    assert.equal(await callbackResult((callback) => store.get("missing", callback)), null);
  } finally {
    store.close();
  }
});

test("session store reports invalid expiration instead of persisting it", async () => {
  let queryCount = 0;
  const store = new MySQLSessionStore({
    execute: async () => {
      queryCount += 1;
      return [[], []];
    },
  });

  try {
    await assert.rejects(
      callbackResult((callback) => store.set("session-id", { cookie: { expires: "invalid" } }, callback)),
      /fecha de vencimiento/,
    );
    assert.equal(queryCount, 0);
  } finally {
    store.close();
  }
});

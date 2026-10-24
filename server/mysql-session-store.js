const session = require("express-session");

const defaultSessionDurationMs = 8 * 60 * 60 * 1000;

function getExpiration(sessionData) {
  const expiration = sessionData?.cookie?.expires
    ? Date.parse(sessionData.cookie.expires)
    : Date.now() + defaultSessionDurationMs;
  if (!Number.isSafeInteger(expiration) || expiration <= Date.now()) {
    throw new Error("La sesión tiene una fecha de vencimiento no válida.");
  }
  return Math.floor(expiration / 1000);
}

class MySQLSessionStore extends session.Store {
  constructor(pool) {
    super();
    this.pool = pool;
    this.cleanupTimer = setInterval(() => {
      this.pool.execute("DELETE FROM cms_sessions WHERE expires <= UNIX_TIMESTAMP()")
        .catch((error) => console.error("No se pudieron limpiar las sesiones vencidas:", error));
    }, 15 * 60 * 1000);
    this.cleanupTimer.unref();
  }

  get(sessionId, callback) {
    this.pool.execute(
      "SELECT data FROM cms_sessions WHERE session_id = ? AND expires > UNIX_TIMESTAMP() LIMIT 1",
      [sessionId],
    ).then(([rows]) => {
      if (!rows.length) return callback(null, null);
      try {
        return callback(null, JSON.parse(rows[0].data));
      } catch (error) {
        return callback(error);
      }
    }).catch(callback);
  }

  set(sessionId, sessionData, callback = () => {}) {
    let serialized;
    let expires;
    try {
      serialized = JSON.stringify(sessionData);
      expires = getExpiration(sessionData);
    } catch (error) {
      return callback(error);
    }

    return this.pool.execute(
      `INSERT INTO cms_sessions (session_id, expires, data)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE expires = VALUES(expires), data = VALUES(data)`,
      [sessionId, expires, serialized],
    ).then(() => callback(null)).catch(callback);
  }

  touch(sessionId, sessionData, callback = () => {}) {
    let expires;
    try {
      expires = getExpiration(sessionData);
    } catch (error) {
      return callback(error);
    }

    return this.pool.execute(
      "UPDATE cms_sessions SET expires = ? WHERE session_id = ?",
      [expires, sessionId],
    ).then(() => callback(null)).catch(callback);
  }

  destroy(sessionId, callback = () => {}) {
    return this.pool.execute("DELETE FROM cms_sessions WHERE session_id = ?", [sessionId])
      .then(() => callback(null)).catch(callback);
  }

  close() {
    clearInterval(this.cleanupTimer);
  }
}

module.exports = MySQLSessionStore;

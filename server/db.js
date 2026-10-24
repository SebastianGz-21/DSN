const mysql = require("mysql2/promise");
const config = require("./config");

const pool = mysql.createPool({
  ...config.mysql,
  charset: "utf8mb4",
  timezone: "Z",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
});

module.exports = pool;

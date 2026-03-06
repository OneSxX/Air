const http = require("http");

const serverByClient = new WeakMap();

function parseEnabledFlag(value, fallback = false) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return Boolean(fallback);
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return Boolean(fallback);
}

function normalizePort(value, fallback = 8080) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const port = Math.floor(n);
  if (port < 1 || port > 65535) return fallback;
  return port;
}

function writeJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(body));
  res.end(body);
}

function getBasicHealth(client) {
  return {
    ok: true,
    service: "air-bot",
    timestamp: new Date().toISOString(),
    uptimeMs: Math.floor(process.uptime() * 1000),
    discordReady: Boolean(client?.isReady?.()),
    wsPingMs: Number(client?.ws?.ping || 0),
    guildCount: Number(client?.guilds?.cache?.size || 0),
  };
}

async function checkReady(client) {
  const discordReady = Boolean(client?.isReady?.());
  let dbOk = false;
  const start = Date.now();
  const dbGet = client?.db?.get;
  if (typeof dbGet === "function") {
    try {
      await dbGet.call(client.db, "__health_ping__");
      dbOk = true;
    } catch {
      dbOk = false;
    }
  }
  const dbLatencyMs = Date.now() - start;

  return {
    ok: discordReady && dbOk,
    service: "air-bot",
    timestamp: new Date().toISOString(),
    discordReady,
    dbOk,
    dbLatencyMs,
  };
}

async function handleRequest(req, res, client) {
  const method = String(req?.method || "GET").toUpperCase();
  if (!["GET", "HEAD"].includes(method)) {
    return writeJson(res, 405, { ok: false, error: "method_not_allowed" });
  }

  const url = new URL(String(req?.url || "/"), "http://localhost");
  const pathname = url.pathname;

  if (pathname === "/" || pathname === "/health") {
    return writeJson(res, 200, getBasicHealth(client));
  }

  if (pathname === "/ready") {
    const status = await checkReady(client);
    return writeJson(res, status.ok ? 200 : 503, status);
  }

  return writeJson(res, 404, { ok: false, error: "not_found" });
}

function init(client) {
  if (!client || serverByClient.has(client)) return;

  const enabled = parseEnabledFlag(process.env.HEALTH_ENABLED, false);
  if (!enabled) return;

  const host = String(process.env.HEALTH_HOST || "127.0.0.1").trim() || "127.0.0.1";
  const port = normalizePort(process.env.HEALTH_PORT, 8080);

  const server = http.createServer((req, res) => {
    handleRequest(req, res, client).catch((err) => {
      writeJson(res, 500, {
        ok: false,
        error: "internal_error",
        message: String(err?.message || "unknown_error"),
      });
    });
  });

  server.listen(port, host, () => {
    console.log(`Health endpoint aktif: http://${host}:${port}/health`);
  });

  if (typeof server.unref === "function") {
    server.unref();
  }

  serverByClient.set(client, server);
}

module.exports = {
  init,
  __private: {
    parseEnabledFlag,
    normalizePort,
    getBasicHealth,
    checkReady,
  },
};

const { Client, GatewayIntentBits, Collection, Partials } = require("discord.js");
const dns = require("node:dns");
const { QuickDB } = require("quick.db");
const config = require("./config/config");
const { enforceBlackEmbedColor } = require("./utils/embed");
const { installSuppressedErrorReporter } = require("./utils/suppressedError");
let systemOpsModule = null;

try {
  dns.setDefaultResultOrder("ipv4first");
} catch (e) {
  console.warn("DNS result order ayarlanamadi:", e?.message || e);
}

installSuppressedErrorReporter(globalThis);

try {
  systemOpsModule = require("./features/SystemOps");
  const restore = systemOpsModule?.applyPendingRestoreIfExists?.();
  if (restore?.applied) {
    console.log("Bekleyen restore uygulandi. Yeni veritabani yuklendi.");
  } else if (restore?.error) {
    console.warn("Bekleyen restore uygulanamadi:", restore.error);
  }
} catch (e) {
  console.warn("SystemOps erken yuklenemedi:", e?.message || e);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildEmojisAndStickers,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.User,
    Partials.GuildMember,
  ],
});

const db = new QuickDB();

enforceBlackEmbedColor();

client.db = db;
client.config = config;
client.commands = new Collection();
client.features = {};

process.on("unhandledRejection", (r) => console.error("UNHANDLED REJECTION:", r));
process.on("uncaughtException", (e) => console.error("UNCAUGHT EXCEPTION:", e));
client.on("error", (e) => console.error("CLIENT ERROR:", e));

const SHUTDOWN_GRACE_MS = 10_000;
let shutdownRequested = false;

async function shutdown(signal) {
  if (shutdownRequested) return;
  shutdownRequested = true;
  console.warn(`${signal} alindi, bot kapatiliyor...`);

  const forceExitTimer = setTimeout(() => {
    console.error("Zorunlu cikis: graceful shutdown zaman asimi.");
    process.exit(1);
  }, SHUTDOWN_GRACE_MS);
  if (typeof forceExitTimer.unref === "function") {
    forceExitTimer.unref();
  }

  try {
    await Promise.resolve(client.destroy());
  } catch (e) {
    console.error("Graceful shutdown destroy hatasi:", e);
  } finally {
    clearTimeout(forceExitTimer);
  }

  process.exit(0);
}

process.once("SIGINT", () => {
  shutdown("SIGINT").catch((e) => {
    console.error("SIGINT shutdown hatasi:", e);
    process.exit(1);
  });
});

process.once("SIGTERM", () => {
  shutdown("SIGTERM").catch((e) => {
    console.error("SIGTERM shutdown hatasi:", e);
    process.exit(1);
  });
});

require("./features/VoiceManager/voiceManager")(client, db, config);
require("./features/Ticket/ticket")(client, db, config);

try {
  client.features.Protection = require("./features/Protection");
  if (client.features.Protection?.init) client.features.Protection.init(client, db, config);
} catch (e) {
  console.warn("Protection yuklenemedi:", e?.message || e);
}

try {
  client.features.Logs = require("./features/Logs");
  if (client.features.Logs?.init) client.features.Logs.init(client, db, config);
} catch (e) {
  console.warn("Logs yuklenemedi:", e?.message || e);
}

try {
  client.features.Level = require("./features/Level");
  if (client.features.Level?.init) client.features.Level.init(client, db, config);
} catch (e) {
  console.warn("Level yuklenemedi:", e?.message || e);
}

try {
  client.features.Reminder = require("./features/Reminder");
  if (client.features.Reminder?.init) client.features.Reminder.init(client, db, config);
} catch (e) {
  console.warn("Reminder yuklenemedi:", e?.message || e);
}

try {
  client.features.Welcome = require("./features/Welcome");
  if (client.features.Welcome?.init) client.features.Welcome.init(client, db, config);
} catch (e) {
  console.warn("Welcome yuklenemedi:", e?.message || e);
}

try {
  client.features.WordGame = require("./features/WordGame");
  if (client.features.WordGame?.init) client.features.WordGame.init(client, db, config);
} catch (e) {
  console.warn("WordGame yuklenemedi:", e?.message || e);
}

try {
  client.features.NumberGame = require("./features/NumberGame");
  if (client.features.NumberGame?.init) client.features.NumberGame.init(client, db, config);
} catch (e) {
  console.warn("NumberGame yuklenemedi:", e?.message || e);
}

try {
  client.features.ReactionRole = require("./features/ReactionRole");
  if (client.features.ReactionRole?.init) client.features.ReactionRole.init(client, db, config);
} catch (e) {
  console.warn("ReactionRole yuklenemedi:", e?.message || e);
}

try {
  client.features.Music = require("./features/Music");
  if (client.features.Music?.init) client.features.Music.init(client, db, config);
} catch (e) {
  console.warn("Music yuklenemedi:", e?.message || e);
}

try {
  client.features.SystemOps = systemOpsModule || require("./features/SystemOps");
  if (client.features.SystemOps?.init) client.features.SystemOps.init(client, db, config);
} catch (e) {
  console.warn("SystemOps yuklenemedi:", e?.message || e);
}

try {
  client.features.Health = require("./features/Health");
  if (client.features.Health?.init) client.features.Health.init(client, db, config);
} catch (e) {
  console.warn("Health yuklenemedi:", e?.message || e);
}

try {
  client.features.Giveaway = require("./features/Giveaway");
  if (client.features.Giveaway?.init) client.features.Giveaway.init(client, db, config);
} catch (e) {
  console.warn("Giveaway yuklenemedi:", e?.message || e);
}

const loadCommands = require("./handlers/commandLoader");
const loadEvents = require("./handlers/eventLoader");

(async () => {
  try {
    await loadCommands(client);
    await loadEvents(client);
  } catch (e) {
    console.error("Loader hatasi:", e);
    throw e;
  }

  if (!config.token) {
    throw new Error("DISCORD_TOKEN tanimli degil. .env dosyasina DISCORD_TOKEN ekle.");
  }

  await client.login(config.token);
})().catch((e) => {
  console.error("Startup hatasi:", e);
  process.exit(1);
});

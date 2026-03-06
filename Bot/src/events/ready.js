const ACTIVITY_TEXT = "/help \u00B7 discord.gg/xAir";
const BIO_PREFIX = "\uFE34";
const BIO_HEADER = "\u02DA\u2727\u0F3B\u0F3B\u0F3B\u0F3B\u0F3B\u2727\u0F3A\u0F3A\u0F3A\u0F3A\u0F3A\u2727\u02DA";

function getGuildAndMemberTotals(client) {
  const guilds = [...(client.guilds?.cache?.values?.() || [])];
  let memberCount = 0;
  for (const guild of guilds) {
    memberCount += Number(guild?.memberCount || 0);
  }
  return {
    guildCount: guilds.length,
    memberCount,
  };
}

function buildApplicationDescription(client) {
  const { guildCount, memberCount } = getGuildAndMemberTotals(client);
  return [
    BIO_HEADER,
    `${BIO_PREFIX}Destek i\u00E7in yap\u0131mc\u0131m olan barandqn ile ileti\u015Fime ge\u00E7in.`,
    `${BIO_PREFIX}${guildCount} Sunucuda aktif \u30FB ${memberCount} Kişiye hizmet ediyor`,
    `${BIO_PREFIX}/help`,
    `${BIO_PREFIX}https://discord.gg/xAir`,
  ].join("\n");
}

async function applyBotIdentity(client) {
  try {
    client.user.setPresence({
      status: "online",
      activities: [{ name: ACTIVITY_TEXT, type: 3 }],
    });
  } catch (err) {
    globalThis.__airWarnSuppressedError?.(err);
  }

  try {
    const app = client.application?.fetch
      ? await client.application.fetch().catch(() => client.application)
      : client.application;
    if (!app?.edit) return;
    await (app.edit({ description: buildApplicationDescription(client) }) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  } catch (err) {
    globalThis.__airWarnSuppressedError?.(err);
  }
}

module.exports = {
  name: "ready",
  once: true,
  async execute(client) {
    console.log(`Bot acildi: ${client.user.tag}`);

    await applyBotIdentity(client);

    const registerFlag = String(process.env.REGISTER_SLASH_ON_READY || "0").trim().toLowerCase();
    const shouldRegister = ["1", "true", "yes", "on"].includes(registerFlag);
    const forceFlag = String(process.env.REGISTER_SLASH_FORCE || "0").trim().toLowerCase();
    const forceRegister = ["1", "true", "yes", "on"].includes(forceFlag);
    if (shouldRegister) {
      try {
        const {
          registerGlobalCommands,
          getGlobalCommandsBody,
          getGlobalCommandsHash,
        } = require("../slash/register");
        const appId = client.application?.id || client.config?.clientId;
        if (!appId || !client.config?.token) {
          console.warn("Slash register atlandi: appId/token eksik.");
        } else {
          const body = getGlobalCommandsBody();
          const hash = getGlobalCommandsHash(body);
          const hashKey = `slash_global_hash_${appId}`;
          const prevHash = await (typeof client?.db?.get === "function"
            ? client.db.get(hashKey)
            : Promise.resolve(null)).catch((err) => {
              globalThis.__airWarnSuppressedError?.(err);
              return null;
            });

          if (!forceRegister && prevHash === hash) {
            console.log("Slash register atlandi: komut hash degismedi.");
          } else {
            await registerGlobalCommands(appId, client.config.token, body);
            await (typeof client?.db?.set === "function"
              ? client.db.set(hashKey, hash)
              : Promise.resolve()).catch((err) => {
                globalThis.__airWarnSuppressedError?.(err);
              });
          }
        }
      } catch (e) {
        console.error("Slash register hatasi:", e?.message || e);
      }
    } else {
      console.log("Slash register atlandi (REGISTER_SLASH_ON_READY=0).");
    }

    try {
      const protection = client.features?.Protection;
      if (protection?.onReady) await protection.onReady(client);
    } catch (e) {
      console.error("Protection onReady hata:", e);
    }

    try {
      const logs = client.features?.Logs;
      if (logs?.onReady) await logs.onReady(client);
    } catch (e) {
      console.error("Logs onReady hata:", e);
    }

    try {
      const reminder = client.features?.Reminder;
      if (reminder?.onReady) await reminder.onReady(client);
    } catch (e) {
      console.error("Reminder onReady hata:", e);
    }

    try {
      const systemOps = client.features?.SystemOps;
      if (systemOps?.onReady) await systemOps.onReady(client);
    } catch (e) {
      console.error("SystemOps onReady hata:", e);
    }

    try {
      const giveaway = client.features?.Giveaway;
      if (giveaway?.onReady) await giveaway.onReady(client);
    } catch (e) {
      console.error("Giveaway onReady hata:", e);
    }

    try {
      const level = client.features?.Level;
      if (level?.onReady) await level.onReady(client);
    } catch (e) {
      console.error("Level onReady hata:", e);
    }
  },
};


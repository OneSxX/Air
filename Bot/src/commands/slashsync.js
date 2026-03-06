const {
  registerGlobalCommands,
  registerGuildCommands,
  getGlobalCommandsBody,
  getGlobalCommandsHash,
} = require("../slash/register");
const {
  normalizeUserId,
  resolveBotOwnerId,
} = require("../utils/ownerAccess");

function normalizeScope(input) {
  const value = String(input || "")
    .trim()
    .toLowerCase();
  if (["global", "guild", "both", "clear_guild"].includes(value)) {
    return value;
  }
  return "global";
}

function resolveRequestedScope(rawScope, access) {
  const scopeProvided = Boolean(String(rawScope || "").trim());
  if (scopeProvided) {
    return {
      scope: normalizeScope(rawScope),
      scopeProvided: true,
      autoSelected: false,
    };
  }

  if (access?.allowed && !access?.isBotOwner) {
    return {
      scope: "guild",
      scopeProvided: false,
      autoSelected: true,
    };
  }

  return {
    scope: "global",
    scopeProvided: false,
    autoSelected: false,
  };
}

function resolveSyncAccess(interaction, client) {
  const userId = normalizeUserId(interaction?.user?.id);
  const guildOwnerId = normalizeUserId(interaction?.guild?.ownerId);
  const botOwnerId = resolveBotOwnerId(client);

  if (!userId) {
    return {
      allowed: false,
      isBotOwner: false,
      isGuildOwner: false,
      botOwnerId,
    };
  }

  if (botOwnerId && userId === botOwnerId) {
    return {
      allowed: true,
      isBotOwner: true,
      isGuildOwner: userId === guildOwnerId,
      botOwnerId,
    };
  }

  if (guildOwnerId && userId === guildOwnerId) {
    return {
      allowed: true,
      isBotOwner: false,
      isGuildOwner: true,
      botOwnerId,
    };
  }

  return {
    allowed: false,
    isBotOwner: false,
    isGuildOwner: false,
    botOwnerId,
  };
}

function validateSyncRequest(scope, force, access) {
  if (!access?.allowed) {
    return "Bu komutu sadece bot sahibi veya sunucu sahibi kullanabilir.";
  }

  if (access.isBotOwner) return null;

  if (force) {
    return "Sunucu sahibi `force` kullanamaz. `force` sadece bot sahibine acik.";
  }

  if (scope === "global" || scope === "both") {
    return "Sunucu sahibi sadece `scope:guild` veya `scope:clear_guild` kullanabilir.";
  }

  return null;
}

function logSuppressedError(context, err) {
  if (!err) return;
  console.warn(`[slashsync] ${context}:`, err?.message || err);
}

async function safeDbGet(client, key, context) {
  const getter = client?.db?.get;
  if (typeof getter !== "function") return null;
  try {
    return await getter.call(client.db, key);
  } catch (err) {
    logSuppressedError(`db.get ${context}`, err);
    return null;
  }
}

async function safeDbSet(client, key, value, context) {
  const setter = client?.db?.set;
  if (typeof setter !== "function") return false;
  try {
    await setter.call(client.db, key, value);
    return true;
  } catch (err) {
    logSuppressedError(`db.set ${context}`, err);
    return false;
  }
}

async function safeDbDelete(client, key, context) {
  const deleter = client?.db?.delete;
  if (typeof deleter !== "function") return false;
  try {
    await deleter.call(client.db, key);
    return true;
  } catch (err) {
    logSuppressedError(`db.delete ${context}`, err);
    return false;
  }
}

function safeEditReply(interaction, payload, context) {
  return interaction.editReply(payload).catch((err) => {
    logSuppressedError(`editReply ${context}`, err);
  });
}

function safeReply(interaction, payload, context) {
  return interaction.reply(payload).catch((err) => {
    logSuppressedError(`reply ${context}`, err);
  });
}

const slashsyncCommand = {
  name: "slashsync",
  description: "Slash komutlarini secilen kapsamda elle gunceller.",
  async execute(interaction, client) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }

      if (!interaction.guildId) {
        return safeEditReply(interaction, "Bu komut sadece sunucuda calisir.", "guild_only");
      }

      const appId = client.application?.id || client.config?.clientId;
      const token = client.config?.token;
      if (!appId || !token) {
        return safeEditReply(interaction, "Slash senkronu icin appId/token bulunamadi.", "missing_config");
      }

      const body = getGlobalCommandsBody();
      const hash = getGlobalCommandsHash(body);
      const force = Boolean(interaction.options?.getBoolean?.("force", false));
      const rawScope = interaction.options?.getString?.("scope", false);
      const access = resolveSyncAccess(interaction, client);
      const { scope, scopeProvided, autoSelected } = resolveRequestedScope(rawScope, access);
      const validationError = validateSyncRequest(scope, force, access);

      if (validationError) {
        return safeEditReply(interaction, validationError, "validation");
      }

      const guildHashKey = `slash_guild_hash_${appId}_${interaction.guildId}`;
      const globalHashKey = `slash_global_hash_${appId}`;

      const prevGuildHash = await safeDbGet(client, guildHashKey, guildHashKey);
      const prevGlobalHash = await safeDbGet(client, globalHashKey, globalHashKey);

      let guildUpdated = false;
      let globalUpdated = false;
      let guildCleared = false;
      const lines = [];

      if (scope === "clear_guild") {
        await registerGuildCommands(appId, interaction.guildId, token, []);
        await safeDbDelete(client, guildHashKey, guildHashKey);
        await safeDbSet(client, guildHashKey, null, guildHashKey);
        guildCleared = true;
        lines.push("Guild sync: **temizlendi**");
        lines.push("Global sync: **dokunulmadi**");
      } else {
        if (scope === "global") {
          // Prevent duplicate command names by removing guild-scoped copies
          // when user chooses global sync.
          await registerGuildCommands(appId, interaction.guildId, token, []);
          await safeDbDelete(client, guildHashKey, guildHashKey);
          await safeDbSet(client, guildHashKey, null, guildHashKey);
          guildCleared = true;
        }

        if ((scope === "guild" || scope === "both") && (force || prevGuildHash !== hash)) {
          await registerGuildCommands(appId, interaction.guildId, token, body);
          await safeDbSet(client, guildHashKey, hash, guildHashKey);
          guildUpdated = true;
        }

        if ((scope === "global" || scope === "both") && (force || prevGlobalHash !== hash)) {
          await registerGlobalCommands(appId, token, body);
          await safeDbSet(client, globalHashKey, hash, globalHashKey);
          globalUpdated = true;
        }

        lines.push(`Scope: **${scope}**`);
        if (scope === "global") {
          lines.push("Guild sync: **temizlendi**");
        } else {
          lines.push(`Guild sync: **${guildUpdated ? "guncellendi" : "degismedi"}**`);
        }
        lines.push(`Global sync: **${globalUpdated ? "guncellendi" : "degismedi"}**`);
      }

      // Backward-compatible de-dup: if scope option is unavailable (old command payload)
      // and guild/global hashes are already the same, remove guild copies.
      if (!scopeProvided && scope === "global" && prevGuildHash && prevGuildHash === hash) {
        await registerGuildCommands(appId, interaction.guildId, token, []);
        await safeDbDelete(client, guildHashKey, guildHashKey);
        await safeDbSet(client, guildHashKey, null, guildHashKey);
        guildCleared = true;
        lines.push("Eski slashsync arayuzu algilandi: cift gorunmeyi onlemek icin bu sunucu kopyalari temizlendi.");
      }

      if (scope === "both") {
        lines.push("Not: Ayni komutlar global+guild birlikte senkronlanirsa bazi istemcilerde cift gorunebilir.");
        lines.push("Gerekirse `scope:clear_guild` ile bu sunucudaki kopyalari temizle.");
      }
      if (autoSelected) {
        lines.push("Not: `scope` belirtilmedigi icin varsayilan olarak `guild` secildi.");
      }

      if (globalUpdated) {
        lines.push("Not: Global slash degisiklikleri tum sunuculara yayilirken gecikme olabilir.");
      }
      if (guildCleared) {
        lines.push("Bu sunucuda artik sadece global slash komutlari gorunecek.");
      }

      return safeEditReply(interaction, lines.join("\n"), "result");
    } catch (err) {
      console.error("slashsync command error:", err);
      if (interaction.deferred || interaction.replied) {
        return safeEditReply(interaction, "Slash sync hatasi olustu.", "fatal_edit");
      }
      return safeReply(interaction, { content: "Slash sync hatasi olustu.", ephemeral: true }, "fatal_reply");
    }
  },
};

slashsyncCommand.__private = {
  normalizeUserId,
  normalizeScope,
  resolveRequestedScope,
  resolveBotOwnerId,
  resolveSyncAccess,
  validateSyncRequest,
  safeDbGet,
  safeDbSet,
  safeDbDelete,
};

module.exports = slashsyncCommand;

const { ChannelType, PermissionFlagsBits } = require("discord.js");

const PRISON_CATEGORY_NAME = "hapis";
const PRISON_CHANNEL_NAME = "hapis-odasi";
const PRISON_CHANNEL_FALLBACK_NAME = "hapis_odasi";
const PRISON_CATEGORY_KEY = (gid) => `mute_prison_category_${gid}`;
const PRISON_CHANNEL_KEY = (gid) => `mute_prison_channel_${gid}`;
const LEGACY_PRISON_CATEGORY_NAMES = [
  "hapis",
  "jail",
];
const LEGACY_PRISON_CHANNEL_NAMES = [
  "hapis odasi",
  "hapis-odasi",
  "hapis_odasi",
  "jail",
  "jail-room",
];
function normalizeName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\uFE0F/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isPrisonCategoryName(name) {
  const normalized = normalizeName(name);
  if (!normalized) return false;
  if (normalized === normalizeName(PRISON_CATEGORY_NAME)) return true;
  return LEGACY_PRISON_CATEGORY_NAMES
    .map(normalizeName)
    .includes(normalized);
}
function isPrisonChannelName(name) {
  const n = normalizeName(name);
  if (n === normalizeName(PRISON_CHANNEL_NAME)) return true;
  if (n === normalizeName(PRISON_CHANNEL_FALLBACK_NAME)) return true;
  if (LEGACY_PRISON_CHANNEL_NAMES.map(normalizeName).includes(n)) return true;

  const simple = n.replace(/^[^a-z0-9]+/i, "");
  return simple === "hapis odasi" || simple === "hapis-odasi";
}
async function ensurePrisonArea(guild, muteRole, me, db) {
  let createdCategory = false;
  let createdChannel = false;
  const savedCategoryId = db ? await db.get(PRISON_CATEGORY_KEY(guild.id)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; }) : null;
  const savedChannelId = db ? await db.get(PRISON_CHANNEL_KEY(guild.id)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; }) : null;

  let prisonChannel = null;
  if (savedChannelId) {
    prisonChannel =
      guild.channels.cache.get(savedChannelId) ||
      await (guild.channels.fetch(savedChannelId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    if (prisonChannel?.type !== ChannelType.GuildText) {
      prisonChannel = null;
    }
  }

  let category =
    savedCategoryId
      ? guild.channels.cache.get(savedCategoryId) ||
        await guild.channels.fetch(savedCategoryId).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; })
      : null;

  if (category?.type !== ChannelType.GuildCategory) {
    category = null;
  }

  if (!category && prisonChannel?.parentId) {
    category =
      guild.channels.cache.get(prisonChannel.parentId) ||
      await (guild.channels.fetch(prisonChannel.parentId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
    if (category?.type !== ChannelType.GuildCategory) {
      category = null;
    }
  }

  if (!category) {
    category =
      guild.channels.cache.find(
        (ch) => ch?.type === ChannelType.GuildCategory && isPrisonCategoryName(ch.name)
      ) || null;
  }

  if (!category) {
    category = await guild.channels.create({
      name: PRISON_CATEGORY_NAME,
      type: ChannelType.GuildCategory,
      reason: "Mute hapis kategorisi kurulumu",
    });
    createdCategory = true;
  }

  await category.permissionOverwrites
    .edit(
      guild.roles.everyone.id,
      {
        ViewChannel: false,
        SendMessages: false,
        SendMessagesInThreads: false,
        AddReactions: false,
      },
      { reason: "Mute hapis kategori izinleri" }
    )
    .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

  if (me?.id) {
    await category.permissionOverwrites
      .edit(
        me.id,
        {
          ViewChannel: true,
          ReadMessageHistory: true,
          SendMessages: true,
          SendMessagesInThreads: true,
          ManageChannels: true,
        },
        { reason: "Bot hapis kategorisini yonetsin" }
      )
      .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  if (!prisonChannel) {
    prisonChannel =
      guild.channels.cache.find(
        (ch) =>
          ch?.type === ChannelType.GuildText &&
          ch.parentId === category.id &&
          isPrisonChannelName(ch.name)
      ) || null;
  }

  if (!prisonChannel) {
    const looseMatch =
      guild.channels.cache.find(
        (ch) => ch?.type === ChannelType.GuildText && isPrisonChannelName(ch.name)
      ) || null;
    if (looseMatch) {
      prisonChannel = looseMatch;
      await prisonChannel
        .setParent(category.id, {
          lockPermissions: false,
          reason: "Mute hapis odasi kategorisine tasindi",
        })
        .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
  }

  if (!prisonChannel) {
    try {
      prisonChannel = await guild.channels.create({
        name: PRISON_CHANNEL_NAME,
        type: ChannelType.GuildText,
        parent: category.id,
        reason: "Mute hapis odasi kurulumu",
      });
    } catch {
      prisonChannel = await guild.channels.create({
        name: PRISON_CHANNEL_FALLBACK_NAME,
        type: ChannelType.GuildText,
        parent: category.id,
        reason: "Mute hapis odasi kurulumu (fallback isim)",
      });
    }
    createdChannel = true;
  } else if (prisonChannel.parentId !== category.id) {
    await prisonChannel
      .setParent(category.id, {
        lockPermissions: false,
        reason: "Mute hapis odasi kategorisine tasindi",
      })
      .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  await prisonChannel.permissionOverwrites
    .edit(
      guild.roles.everyone.id,
      {
        ViewChannel: false,
        SendMessages: false,
        SendMessagesInThreads: false,
        AddReactions: false,
      },
      { reason: "Hapis odasi temel izinleri" }
    )
    .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

  await prisonChannel.permissionOverwrites
    .edit(
      muteRole.id,
      {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: true,
        SendMessagesInThreads: true,
        AddReactions: true,
        CreatePublicThreads: false,
        CreatePrivateThreads: false,
        AttachFiles: false,
        UseApplicationCommands: false,
      },
      { reason: "Muted uyeler sadece hapis odasina yazabilsin" }
    )
    .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

  if (me?.id) {
    await prisonChannel.permissionOverwrites
      .edit(
        me.id,
        {
          ViewChannel: true,
          ReadMessageHistory: true,
          SendMessages: true,
          SendMessagesInThreads: true,
          ManageChannels: true,
          ManageMessages: true,
        },
        { reason: "Bot hapis odasini yonetsin" }
      )
      .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  if (db) {
    await (db.set(PRISON_CATEGORY_KEY(guild.id), category.id) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    await (db.set(PRISON_CHANNEL_KEY(guild.id), prisonChannel.id) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
  }

  return {
    category,
    prisonChannel,
    createdCategory,
    createdChannel,
  };
}

module.exports = {
  name: "mute",
  description: "Mute rolunu olustur, hapis kategorisi/odasi kur ve kisitlamalari uygula.",
  async execute(interaction, client) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }

      if (!interaction.guildId) {
        return interaction.editReply("Bu komut sadece sunucuda calisir.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const isAdmin = interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator);
      const hasPerm = isAdmin || (
        interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageRoles) &&
        interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageChannels)
      );
      if (!hasPerm) {
        return interaction
          .editReply("Bu komut icin `Rolleri Yonet` ve `Kanallari Yonet` yetkisi gerekir.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const sub = interaction.options?.getSubcommand?.(false) || "rol_olustur";
      if (sub !== "rol_olustur") {
        return interaction.editReply("Gecersiz alt komut. /mute rol_olustur kullan.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const guild = interaction.guild;
      const logs = client.features?.Logs;

      let muteRole = null;
      if (logs?.getMuteRoleId) {
        const savedId = await logs.getMuteRoleId(client.db, guild.id);
        if (savedId) {
          muteRole = guild.roles.cache.get(savedId) || await (guild.roles.fetch(savedId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
        }
      }

      if (!muteRole) {
        muteRole = guild.roles.cache.find((role) => /mute/i.test(role.name || "")) || null;
      }

      const me = guild.members.me || await (guild.members.fetch(client.user.id) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
      if (!me) {
        return interaction.editReply("Bot uye bilgisi alinamadi. Tekrar dene.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      if (!me.permissions?.has?.(PermissionFlagsBits.ManageRoles)) {
        return interaction
          .editReply("Botun `Rolleri Yonet` yetkisi yok. Once bu yetkiyi vermelisin.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      if (!me.permissions?.has?.(PermissionFlagsBits.ManageChannels)) {
        return interaction
          .editReply("Botun `Kanallari Yonet` yetkisi yok. Hapis odasi kurmak icin bu yetki gerekir.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      let created = false;
      if (!muteRole) {
        muteRole = await guild.roles.create({
          name: "Muted",
          color: 0xed4245,
          permissions: [],
          mentionable: false,
          hoist: false,
          reason: "Mute rol kurulumu",
        });
        created = true;
      } else {
        if (muteRole.name !== "Muted") {
          await (muteRole.setName("Muted", "Mute rol ismi standardize edildi") || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }
        if (muteRole.color !== 0xed4245) {
          await (muteRole.setColor(0xed4245, "Mute rol rengi standardize edildi") || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }
      }

      if (muteRole.position >= me.roles.highest.position) {
        return interaction
          .editReply("Mute rolu botun en yuksek rolunden ustte/esit. Bot rolunu daha yukari tasimalisin.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const prison = await ensurePrisonArea(guild, muteRole, me, client.db);
      const rulesChannelId = String(guild.rulesChannelId || "");

      let updatedCount = 0;
      let failedCount = 0;
      for (const channel of guild.channels.cache.values()) {
        if (!channel?.permissionOverwrites?.edit) continue;
        if (channel.id === prison.category.id) continue;
        if (channel.id === prison.prisonChannel.id) continue;

        if (rulesChannelId && String(channel.id) === rulesChannelId) {
          try {
            await channel.permissionOverwrites.edit(
              muteRole.id,
              {
                ViewChannel: true,
                ReadMessageHistory: true,
                SendMessages: false,
                SendMessagesInThreads: false,
                AddReactions: false,
                CreatePublicThreads: false,
                CreatePrivateThreads: false,
                AttachFiles: false,
                EmbedLinks: false,
                UseApplicationCommands: false,
              },
              { reason: "Muted kurallar kanalini sadece gorebilsin" }
            );
            updatedCount += 1;
          } catch {
            failedCount += 1;
          }
          continue;
        }

        try {
          await channel.permissionOverwrites.edit(
            muteRole.id,
            {
              ViewChannel: false,
              SendMessages: false,
              AddReactions: false,
              SendMessagesInThreads: false,
              CreatePublicThreads: false,
              CreatePrivateThreads: false,
              AttachFiles: false,
              EmbedLinks: false,
              Connect: false,
              Speak: false,
              UseApplicationCommands: false,
            },
            { reason: "Mute rolu genel kanal kisitlamalari" }
          );
          updatedCount += 1;
        } catch {
          failedCount += 1;
        }
      }

      // Komut tekrar calistiginda da hapis odasinda yazma izni korunur.
      await prison.prisonChannel.permissionOverwrites
        .edit(
          muteRole.id,
          {
            ViewChannel: true,
            ReadMessageHistory: true,
            SendMessages: true,
            SendMessagesInThreads: true,
            AddReactions: true,
          },
          { reason: "Muted hapis odasi yazma izni korundu" }
        )
        .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });

      if (logs?.setMuteRoleId) {
        await logs.setMuteRoleId(client.db, guild.id, muteRole.id);
      } else {
        await client.db.set(`logs_mute_role_${guild.id}`, muteRole.id);
      }

      const out =
        `${created ? "Muted rolu olusturuldu." : "Muted rolu bulundu/guncellendi."}\n` +
        `Rol: <@&${muteRole.id}>\n` +
        `Kategori: ${prison.createdCategory ? "olusturuldu" : "bulundu"} (**${PRISON_CATEGORY_NAME}**)\n` +
        `Hapis odasi: ${prison.createdChannel ? "olusturuldu" : "bulundu"} (<#${prison.prisonChannel.id}>)\n` +
        `Izin uygulanan kanal: ${updatedCount}\n` +
        `Basarisiz kanal: ${failedCount}\n` +
        `Not: Muted rolundekiler sadece hapis odasina yazabilir. Cakisan izin **Administrator** olabilir.`;

      return interaction.editReply(out).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    } catch (err) {
      console.error("mute command error:", err);
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply("Mute rolu olusturulurken hata olustu.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      return interaction.reply({ content: "Mute rolu olusturulurken hata olustu.", ephemeral: true }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
  },
};


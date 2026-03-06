const {
  ActionRowBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
} = require("discord.js");

const MARKET_KEY = (gid) => `market_items_${gid}`;
const INVENTORY_KEY = (gid, uid) => `market_inventory_${gid}_${uid}`;
const SELECT_ID = "market:buy";
const MARKET_THUMBNAIL_URL = "https://i.imgur.com/Dpde9Kq.png";
const MAX_SELECT_OPTIONS = 25;
const MAX_ITEM_NAME = 60;
const MAX_PRICE_DECI = 10_000_000;
const marketLocks = new Map();

function normalizeRoleId(input) {
  const id = String(input || "").trim();
  return /^\d{15,25}$/.test(id) ? id : null;
}

function withMarketLock(guildId, task) {
  const key = String(guildId || "").trim();
  const prev = marketLocks.get(key) || Promise.resolve();

  const next = prev
    .catch((err) => { globalThis.__airWarnSuppressedError?.(err); })
    .then(task)
    .finally(() => {
      if (marketLocks.get(key) === next) {
        marketLocks.delete(key);
      }
    });

  marketLocks.set(key, next);
  return next;
}

function normalizeAction(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeItemName(input) {
  return String(input || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_ITEM_NAME);
}

function parseCoinToDeci(input) {
  const raw = String(input || "")
    .trim()
    .replace(",", ".");
  if (!raw) return null;

  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return null;
  const deci = Math.round(num * 10);
  if (!Number.isFinite(deci) || deci <= 0 || deci > MAX_PRICE_DECI) return null;
  return deci;
}

function normalizePriceDeciFromStored(raw) {
  const direct = Number(raw?.priceDeci);
  if (Number.isFinite(direct) && direct > 0) {
    const safe = Math.floor(direct);
    if (safe > 0 && safe <= MAX_PRICE_DECI) return safe;
  }

  return parseCoinToDeci(raw?.price);
}

function formatCoinDeci(deci) {
  const value = Number(deci || 0) / 10;
  if (!Number.isFinite(value) || value <= 0) return "0.0";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function normalizeStoredItem(raw) {
  if (!raw || typeof raw !== "object") return null;

  const id = String(raw.id || "").trim();
  const name = normalizeItemName(raw.name);
  const parsed = normalizePriceDeciFromStored(raw);
  const priceDeci = Number(parsed || 0);

  if (!id || !name || !Number.isFinite(priceDeci) || priceDeci <= 0) return null;

  return {
    id,
    name,
    priceDeci,
    roleId: normalizeRoleId(raw.roleId),
    createdAt: Number(raw.createdAt || Date.now()),
    createdBy: String(raw.createdBy || ""),
  };
}

async function getMarketItems(db, guildId) {
  const raw = await db.get(MARKET_KEY(guildId));
  const arr = Array.isArray(raw) ? raw : [];
  const normalized = arr.map(normalizeStoredItem).filter(Boolean);
  const items = [];
  const seenNames = new Set();
  for (const item of normalized) {
    const nameKey = item.name.toLowerCase();
    if (seenNames.has(nameKey)) continue;
    seenNames.add(nameKey);
    items.push(item);
  }

  if (items.length !== arr.length || items.length !== normalized.length) {
    await db.set(MARKET_KEY(guildId), items);
  }
  return items;
}

async function setMarketItems(db, guildId, items) {
  const safe = (Array.isArray(items) ? items : []).map(normalizeStoredItem).filter(Boolean);
  const dedup = [];
  const seenIds = new Set();
  const seenNames = new Set();
  for (const item of safe) {
    if (seenIds.has(item.id)) continue;
    const nameKey = item.name.toLowerCase();
    if (seenNames.has(nameKey)) continue;
    seenIds.add(item.id);
    seenNames.add(nameKey);
    dedup.push(item);
  }
  await db.set(MARKET_KEY(guildId), dedup);
  return dedup;
}

function buildMarketPayload(items) {
  const embed = new EmbedBuilder()
    .setColor(0x000000)
    .setTitle("Market")
    .setThumbnail(MARKET_THUMBNAIL_URL);

  if (!Array.isArray(items) || !items.length) {
    embed.setDescription(
      `Market su an bos.\n\n` +
      `Urun eklemek icin:\n` +
      `\`/marketyonet islem:ekle isim:<urun> coin:<miktar> [rol]\``
    );

    return {
      embeds: [embed],
      components: [],
    };
  }

  const shown = items.slice(0, MAX_SELECT_OPTIONS);
  const options = shown.map((item) => ({
    label: item.name.slice(0, 100),
    description: `${formatCoinDeci(item.priceDeci)} coin${item.roleId ? " + rol" : ""}`,
    value: item.id,
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId(SELECT_ID)
    .setPlaceholder("Satin al")
    .addOptions(options);

  const previewLines = shown
    .slice(0, 15)
    .map((item, idx) => {
      const roleLine = item.roleId ? ` (Rol: <@&${item.roleId}>)` : "";
      return `${idx + 1}. **${item.name}** - **${formatCoinDeci(item.priceDeci)}** coin${roleLine}`;
    });

  const remain = items.length - 15;
  const remainLine = remain > 0 ? `\n\n...ve **${remain}** urun daha.` : "";
  embed.setDescription(
    `${previewLines.join("\n")}${remainLine}\n\n` +
    `Satin almak icin asagidan urun sec.`
  );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(select)],
  };
}

async function appendInventoryPurchase(db, guildId, userId, item) {
  const key = INVENTORY_KEY(guildId, userId);
  const raw = (await db.get(key)) || {};
  const map = raw && typeof raw === "object" ? { ...raw } : {};
  const itemKey = `${item.name}::${item.priceDeci}`;
  const prev = map[itemKey] && typeof map[itemKey] === "object" ? map[itemKey] : null;

  map[itemKey] = {
    name: item.name,
    priceDeci: item.priceDeci,
    roleId: normalizeRoleId(item.roleId),
    count: Number(prev?.count || 0) + 1,
    firstAt: Number(prev?.firstAt || Date.now()),
    lastAt: Date.now(),
  };

  await db.set(key, map);
}

async function prepareRoleGrant(interaction, item) {
  const roleId = normalizeRoleId(item?.roleId);
  if (!roleId) {
    return { required: false, ok: true, roleId: null, role: null, member: null };
  }

  const guild = interaction?.guild || null;
  if (!guild) {
    return { required: true, ok: false, roleId, reason: "Sunucu bulunamadi." };
  }

  const role = guild.roles?.cache?.get?.(roleId) || await (guild.roles?.fetch?.(roleId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!role) {
    return { required: true, ok: false, roleId, reason: "Ayarli rol bulunamadi." };
  }
  if (role.id === guild.id || role.managed) {
    return { required: true, ok: false, roleId, reason: "Ayarli rol verilebilir degil." };
  }

  const member = interaction.member?.roles?.add
    ? interaction.member
    : await (guild.members?.fetch?.(interaction.user.id) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!member?.roles?.add) {
    return { required: true, ok: false, roleId, reason: "Uye bilgisi alinmadi." };
  }

  const me = guild.members?.me || await (guild.members?.fetchMe?.() || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
  if (!me?.permissions?.has?.(PermissionFlagsBits.ManageRoles)) {
    return { required: true, ok: false, roleId, reason: "Botun rol verme yetkisi yok." };
  }
  if (!me?.roles?.highest || role.position >= me.roles.highest.position) {
    return { required: true, ok: false, roleId, reason: "Rol botun ustunde oldugu icin verilemiyor." };
  }

  return {
    required: true,
    ok: true,
    roleId,
    role,
    member,
  };
}

async function grantRoleAfterPurchase(prepared) {
  if (!prepared?.required) {
    return { attempted: false, granted: false, already: false, roleId: null, reason: null };
  }
  if (!prepared.ok || !prepared.role || !prepared.member) {
    return {
      attempted: false,
      granted: false,
      already: false,
      roleId: normalizeRoleId(prepared?.roleId),
      reason: String(prepared?.reason || "Rol verilemedi."),
    };
  }

  if (prepared.member.roles?.cache?.has?.(prepared.role.id)) {
    return { attempted: true, granted: false, already: true, roleId: prepared.role.id, reason: null };
  }

  const granted = await prepared.member.roles
    .add(prepared.role.id, "Market satin alimi")
    .then(() => true)
    .catch(() => false);

  if (!granted) {
    return {
      attempted: true,
      granted: false,
      already: false,
      roleId: prepared.role.id,
      reason: "Satinalimdan sonra rol verilemedi.",
    };
  }

  return { attempted: true, granted: true, already: false, roleId: prepared.role.id, reason: null };
}

module.exports = {
  name: "market",
  description: "Coin marketini goruntule ve urun satin al.",
  async execute(interaction, client) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
      }

      if (!interaction.guildId) {
        return interaction.editReply("Bu komut sadece sunucuda calisir.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const action = normalizeAction(interaction.options?.getString?.("islem", false));
      const rawName = interaction.options?.getString?.("isim", false);
      const coinValue = interaction.options?.getNumber?.("coin", false);
      const role = interaction.options?.getRole?.("rol", false) || null;

      if (!action) {
        const items = await getMarketItems(client.db, interaction.guildId);
        const payload = buildMarketPayload(items);
        return interaction.editReply(payload).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const canManageMarket =
        interaction.guild?.ownerId === interaction.user.id ||
        interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator) ||
        interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild);
      if (!canManageMarket) {
        return interaction
          .editReply("Market urun ekleme/silme islemleri icin sunucu sahibi veya yonetici olmalisin.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const name = normalizeItemName(rawName);
      const priceDeci = parseCoinToDeci(coinValue);
      const roleId = normalizeRoleId(role?.id);

      if (action === "ekle") {
        if (!name) {
          return interaction.editReply("Eklemek icin urun adi girmelisin.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }
        if (!priceDeci) {
          return interaction.editReply("Gecerli bir coin miktari gir. (Orn: 10 veya 10.5)").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        if (roleId) {
          if (roleId === interaction.guild.id) {
            return interaction.editReply("@everyone market urunu rolu olamaz.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
          }
          if (role?.managed) {
            return interaction.editReply("Yonetilen roller market rolu olarak secilemez.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
          }

          const me = interaction.guild.members?.me ||
            await (interaction.guild.members.fetchMe() || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
          if (!me?.permissions?.has?.(PermissionFlagsBits.ManageRoles)) {
            return interaction.editReply("Botun rol verme yetkisi yok.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
          }
          if (!me?.roles?.highest || role.position >= me.roles.highest.position) {
            return interaction.editReply("Secilen rol botun ustunde. Bot rolunu yukari tasi.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
          }
        }

        const result = await withMarketLock(interaction.guildId, async () => {
          const items = await getMarketItems(client.db, interaction.guildId);
          const duplicate = items.some((item) => item.name.toLowerCase() === name.toLowerCase());
          if (duplicate) return { duplicate: true };

          const id = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
          items.push({
            id,
            name,
            priceDeci,
            roleId,
            createdAt: Date.now(),
            createdBy: interaction.user.id,
          });

          await setMarketItems(client.db, interaction.guildId, items);
          return { duplicate: false };
        });

        if (result?.duplicate) {
          return interaction
            .editReply("Bu isimde bir urun zaten markette var.")
            .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        return interaction
          .editReply(
            `Market urunu eklendi:\n` +
            `- Isim: **${name}**\n` +
            `- Fiyat: **${formatCoinDeci(priceDeci)}** coin` +
            `${roleId ? `\n- Rol: <@&${roleId}>` : ""}`
          )
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (action === "sil") {
        if (!name) {
          return interaction.editReply("Silmek icin urun adi girmelisin.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        const removed = await withMarketLock(interaction.guildId, async () => {
          const items = await getMarketItems(client.db, interaction.guildId);
          const idx = items.findIndex((item) => item.name.toLowerCase() === name.toLowerCase());
          if (idx < 0) return null;

          const [item] = items.splice(idx, 1);
          await setMarketItems(client.db, interaction.guildId, items);
          return item;
        });

        if (!removed) {
          return interaction
            .editReply("Silinecek urun bulunamadi. Isim ayni olmali.")
            .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }

        return interaction
          .editReply(
            `Market urunu silindi:\n` +
            `- Isim: **${removed.name}**\n` +
            `- Fiyat: **${formatCoinDeci(removed.priceDeci)}** coin`
          )
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      return interaction
        .editReply("Gecersiz islem. `/marketyonet` komutunda `islem` alanina `ekle` veya `sil` yaz.")
        .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    } catch (err) {
      console.error("market command error:", err);
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply("Market islemi sirasinda hata olustu.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      return interaction.reply({ content: "Market islemi sirasinda hata olustu.", ephemeral: true }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
  },
  async handleSelect(interaction, client) {
    if (!interaction?.isStringSelectMenu?.()) return false;
    if (interaction.customId !== SELECT_ID) return false;
    if (!interaction.guildId) return false;

    let acknowledged = false;
    if (!interaction.deferred && !interaction.replied) {
      acknowledged = await interaction.deferUpdate().then(() => true).catch(() => false);
    } else {
      acknowledged = true;
    }

    const sendPrivate = async (content) => {
      if (acknowledged) {
        return interaction.followUp({ content, ephemeral: true }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      return interaction.reply({ content, ephemeral: true }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    };

    const refreshMenu = async () => {
      const items = await getMarketItems(client.db, interaction.guildId);
      const payload = buildMarketPayload(items);
      if (interaction.message?.editable) {
        await (interaction.message.edit(payload) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        return;
      }
      if (!acknowledged) {
        await (interaction.update(payload) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
    };

    const itemId = String(interaction.values?.[0] || "").trim();
    if (!itemId) {
      await refreshMenu();
      await sendPrivate("Urun secimi gecersiz.");
      return true;
    }

    const level = client.features?.Level;
    if (!level?.spendCoins || !level?.getCoinBalance) {
      await refreshMenu();
      await sendPrivate("Coin sistemi su an aktif degil.");
      return true;
    }

    const items = await getMarketItems(client.db, interaction.guildId);
    const item = items.find((x) => x.id === itemId);

    if (!item) {
      await refreshMenu();
      await sendPrivate("Secilen urun artik markette yok. `/market` ile listeyi yenileyebilirsin.");
      return true;
    }

    const rolePreparation = await prepareRoleGrant(interaction, item);
    if (rolePreparation.required && !rolePreparation.ok) {
      await refreshMenu();
      await sendPrivate(
        `Bu urun su an satin alinamiyor.\n` +
        `Sebep: ${rolePreparation.reason || "Rol ayari gecersiz."}`
      );
      return true;
    }

    const spent = await level.spendCoins(client.db, interaction.guildId, interaction.user.id, item.priceDeci);
    if (!spent?.ok) {
      const coinDeci = Number(spent?.balanceBeforeDeci || 0);
      await refreshMenu();
      await sendPrivate(
        `Coinin yetersiz.\n` +
        `- Gerekli: **${formatCoinDeci(item.priceDeci)}**\n` +
        `- Sende: **${formatCoinDeci(coinDeci)}**`
      );
      return true;
    }

    await (appendInventoryPurchase(client.db, interaction.guildId, interaction.user.id, item) || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    const roleResult = await grantRoleAfterPurchase(rolePreparation);

    const newBalance = Number(spent.balanceAfterDeci || 0);
    await refreshMenu();
    const roleLine = roleResult?.granted
      ? `\nRol verildi: <@&${roleResult.roleId}>`
      : roleResult?.already
        ? `\nRol zaten sende: <@&${roleResult.roleId}>`
        : roleResult?.reason
          ? `\nRol verilemedi: ${roleResult.reason}`
          : "";
    await sendPrivate(
      `Satin alindi: **${item.name}** (**${formatCoinDeci(item.priceDeci)}** coin)\n` +
      `Kalan coin: **${formatCoinDeci(newBalance)}**` +
      roleLine
    );
    return true;
  },
};

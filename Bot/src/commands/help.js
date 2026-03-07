const { createEmbed } = require("../utils/embed");
const { getGlobalCommandsBody } = require("../slash/register");

const HELP_SECTIONS = [
  {
    title: "Genel Komutlar",
    names: ["help", "avatar", "profile", "servertop", "market", "sicil", "kelimeoyunu", "sayioyunu", "durum"],
  },
  {
    title: "Moderasyon Komutlari",
    names: ["ceza", "mute", "autorol", "bump", "bumpremind", "yedek", "giveaway", "slashsync", "komutoda", "marketyonet", "panic"],
  },
  {
    title: "Koruma Panelleri",
    names: ["protection", "sohbet", "sunucu", "sunucuyetki"],
  },
  {
    title: "Log ve Seviye",
    names: ["log", "seviye", "textlevelrol", "voicelevelrol", "hosgeldin", "hosgeldinembed"],
  },
  {
    title: "Tepki Roller",
    names: ["tepki", "tepkirol", "embedtepki"],
  },
  {
    title: "Ticket",
    names: ["ticket"],
  },
  {
    title: "Voice Oda Yonetimi",
    names: ["setcreate", "setup", "panel", "voice"],
  },
];

const SECTION_BY_NAME = new Map(
  HELP_SECTIONS.flatMap((section) => section.names.map((name) => [name, section.title]))
);

const SECTION_ORDER_BY_NAME = new Map(
  HELP_SECTIONS.map((section) => [
    section.title,
    new Map(section.names.map((name, idx) => [name, idx])),
  ])
);

const ACTIVE_COMMANDS_CACHE_TTL_MS = 30_000;
const activeCommandsCache = new WeakMap();

function normalizeCommand(raw) {
  const base = raw?.toJSON ? raw.toJSON() : raw;
  const name = String(base?.name || "").trim().toLowerCase();
  if (!name) return null;

  return {
    name,
    description: String(base?.description || "").trim(),
    type: Number(base?.type || 1),
    options: Array.isArray(base?.options) ? base.options : [],
    dmPermission:
      typeof base?.dm_permission === "boolean"
        ? base.dm_permission
        : (typeof base?.dmPermission === "boolean" ? base.dmPermission : null),
  };
}

function dedupeByName(commands) {
  const out = [];
  const seen = new Set();
  for (const command of commands || []) {
    if (!command?.name || seen.has(command.name)) continue;
    seen.add(command.name);
    out.push(command);
  }
  return out;
}

function getCachedActiveCommands(client) {
  if (!client) return null;
  const cached = activeCommandsCache.get(client);
  if (!cached) return null;
  if (Date.now() - Number(cached.at || 0) > ACTIVE_COMMANDS_CACHE_TTL_MS) {
    activeCommandsCache.delete(client);
    return null;
  }
  return Array.isArray(cached.commands) ? cached.commands : null;
}

function setCachedActiveCommands(client, commands) {
  if (!client || !Array.isArray(commands)) return;
  activeCommandsCache.set(client, {
    at: Date.now(),
    commands,
  });
}

function clearActiveCommandsCache(client) {
  if (!client) return;
  activeCommandsCache.delete(client);
}

async function getActiveSlashCommands(client) {
  const cached = getCachedActiveCommands(client);
  if (cached?.length) return cached;

  const fallback = dedupeByName(
    (getGlobalCommandsBody() || [])
      .map(normalizeCommand)
      .filter((cmd) => cmd && cmd.type === 1)
      .sort((a, b) => a.name.localeCompare(b.name, "tr"))
  );

  const app = client?.application;
  if (!app?.commands?.fetch) {
    setCachedActiveCommands(client, fallback);
    return fallback;
  }

  const fetched = await (app.commands.fetch() || Promise.resolve(null)).catch((err) => {
    globalThis.__airWarnSuppressedError?.(err);
    return null;
  });

  if (!fetched?.size) {
    setCachedActiveCommands(client, fallback);
    return fallback;
  }

  const live = dedupeByName(
    [...fetched.values()]
      .map(normalizeCommand)
      .filter((cmd) => cmd && cmd.type === 1)
      .sort((a, b) => a.name.localeCompare(b.name, "tr"))
  );

  const selected = live.length ? live : fallback;
  setCachedActiveCommands(client, selected);
  return selected;
}

function optionToken(option) {
  const name = String(option?.name || "").trim();
  if (!name) return null;
  return option?.required ? `<${name}>` : `[${name}]`;
}

function formatUsageLines(command) {
  const name = String(command?.name || "").trim();
  if (!name) return [];

  const options = Array.isArray(command?.options) ? command.options : [];
  const topSubcommands = options.filter((opt) => Number(opt?.type) === 1);
  const subcommandGroups = options.filter((opt) => Number(opt?.type) === 2);

  const lines = [];

  for (const sub of topSubcommands) {
    const tokens = (Array.isArray(sub?.options) ? sub.options : [])
      .filter((opt) => ![1, 2].includes(Number(opt?.type)))
      .map(optionToken)
      .filter(Boolean);
    lines.push(`/${name} ${sub.name}${tokens.length ? ` ${tokens.join(" ")}` : ""}`);
  }

  for (const group of subcommandGroups) {
    for (const sub of Array.isArray(group?.options) ? group.options : []) {
      if (Number(sub?.type) !== 1) continue;
      const tokens = (Array.isArray(sub?.options) ? sub.options : [])
        .filter((opt) => ![1, 2].includes(Number(opt?.type)))
        .map(optionToken)
        .filter(Boolean);
      lines.push(`/${name} ${group.name} ${sub.name}${tokens.length ? ` ${tokens.join(" ")}` : ""}`);
    }
  }

  if (lines.length) return lines;

  const flatTokens = options
    .filter((opt) => ![1, 2].includes(Number(opt?.type)))
    .map(optionToken)
    .filter(Boolean);
  return [`/${name}${flatTokens.length ? ` ${flatTokens.join(" ")}` : ""}`];
}

function groupCommandsBySection(commands) {
  const map = new Map();
  for (const section of HELP_SECTIONS) {
    map.set(section.title, []);
  }
  map.set("Diger Komutlar", []);

  for (const command of commands || []) {
    const sectionTitle = SECTION_BY_NAME.get(command.name) || "Diger Komutlar";
    map.get(sectionTitle).push(command);
  }

  for (const [title, list] of map.entries()) {
    if (title === "Diger Komutlar") {
      list.sort((a, b) => a.name.localeCompare(b.name, "tr"));
    } else {
      const order = SECTION_ORDER_BY_NAME.get(title) || new Map();
      list.sort((a, b) => {
        const aOrder = order.has(a.name) ? order.get(a.name) : Number.MAX_SAFE_INTEGER;
        const bOrder = order.has(b.name) ? order.get(b.name) : Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.name.localeCompare(b.name, "tr");
      });
    }

    if (!list.length) {
      map.delete(title);
    }
  }

  return map;
}

function splitFieldLines(title, lines, maxLen = 1000) {
  const out = [];
  let chunk = [];
  let currentLen = 0;

  for (const line of lines) {
    const text = String(line || "");
    const lineLen = text.length + (chunk.length ? 1 : 0);
    if (chunk.length && currentLen + lineLen > maxLen) {
      out.push(chunk.join("\n"));
      chunk = [text];
      currentLen = text.length;
      continue;
    }
    chunk.push(text);
    currentLen += lineLen;
  }

  if (chunk.length) out.push(chunk.join("\n"));

  return out.map((value, idx) => ({
    name: idx === 0 ? title : `${title} (${idx + 1})`,
    value,
    inline: false,
  }));
}

function buildHelpEmbeds(commands, userTag) {
  const grouped = groupCommandsBySection(commands);
  const fields = [];

  for (const [title, list] of grouped.entries()) {
    const lines = [];
    for (const cmd of list) {
      const usages = formatUsageLines(cmd);
      if (!usages.length) continue;
      const desc = cmd.description || "Aciklama yok.";
      lines.push(`- \`${usages[0]}\` -> ${desc}`);
      for (const extraUsage of usages.slice(1)) {
        lines.push(`  + \`${extraUsage}\``);
      }
    }
    if (!lines.length) continue;
    fields.push(...splitFieldLines(title, lines));
  }

  if (!fields.length) {
    return [
      createEmbed()
        .setTitle("Air Komut Rehberi")
        .setDescription("Aktif slash komutu bulunamadi."),
    ];
  }

  const totalCommands = Array.isArray(commands) ? commands.length : 0;
  const baseDescription =
    "Tum slash komutlar kategori bazli listelenmistir.\n" +
    `Toplam komut: **${totalCommands}**\n` +
    "Parametreler: `<zorunlu>` `[opsiyonel]`";

  const chunks = [];
  for (let i = 0; i < fields.length; i += 5) {
    chunks.push(fields.slice(i, i + 5));
  }

  return chunks.map((chunk, idx) => {
    const embed = createEmbed()
      .setTitle(idx === 0 ? "Air Komut Rehberi" : `Air Komut Rehberi (${idx + 1})`)
      .setDescription(idx === 0 ? baseDescription : "Devam eden komut listesi")
      .addFields(chunk)
      .setTimestamp();

    if (idx === 0 && userTag) {
      embed.setFooter({ text: `Isteyen: ${userTag}` });
    }

    return embed;
  });
}

function buildEmergencyHelpEmbeds(userTag) {
  const commands = dedupeByName(
    (getGlobalCommandsBody() || [])
      .map(normalizeCommand)
      .filter((cmd) => cmd && cmd.type === 1)
      .sort((a, b) => a.name.localeCompare(b.name, "tr"))
  );

  const lines = [];
  for (const cmd of commands) {
    const usage = formatUsageLines(cmd)[0] || `/${cmd.name}`;
    lines.push(`- \`${usage}\` -> ${cmd.description || "Aciklama yok."}`);
  }

  const content = lines.length ? lines.join("\n") : "- Aktif komut bulunamadi.";
  return [
    createEmbed()
      .setTitle("Air Komut Rehberi")
      .setDescription("Yardim listesi (guvenli mod)")
      .addFields({
        name: "Komutlar",
        value: content.slice(0, 1000),
        inline: false,
      })
      .setFooter({ text: `Isteyen: ${userTag || "-"}` })
      .setTimestamp(),
  ];
}

module.exports = {
  name: "help",
  description: "Tum slash komutlari kategori bazli listeler.",
  async execute(interaction, client) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }

      const userTag = interaction?.user?.tag || interaction?.user?.id || "";
      let embeds = [];

      try {
        const commands = await getActiveSlashCommands(client);
        embeds = buildHelpEmbeds(commands, userTag);
      } catch (buildErr) {
        console.error("help list build error:", buildErr);
        embeds = buildEmergencyHelpEmbeds(userTag);
      }

      return interaction.editReply({ embeds }).catch((err) => {
        globalThis.__airWarnSuppressedError?.(err);
      });
    } catch (err) {
      console.error("help command error:", err);
      if (interaction.deferred || interaction.replied) {
        return interaction
          .editReply("Help komutu calisirken hata olustu.")
          .catch((replyErr) => { globalThis.__airWarnSuppressedError?.(replyErr); });
      }
      return interaction
        .reply({ content: "Help komutu calisirken hata olustu.", ephemeral: true })
        .catch((replyErr) => { globalThis.__airWarnSuppressedError?.(replyErr); });
    }
  },
  __private: {
    normalizeCommand,
    formatUsageLines,
    groupCommandsBySection,
    buildHelpEmbeds,
    buildEmergencyHelpEmbeds,
    getActiveSlashCommands,
    clearActiveCommandsCache,
  },
};

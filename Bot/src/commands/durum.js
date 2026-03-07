const { PermissionFlagsBits } = require("discord.js");

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let idx = 0;
  let n = value;
  while (n >= 1024 && idx < units.length - 1) {
    n /= 1024;
    idx += 1;
  }
  return `${n.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatAgo(ms) {
  const delta = Math.max(0, Number(ms || 0));
  const sec = Math.floor(delta / 1000);
  const day = Math.floor(sec / 86400);
  const hour = Math.floor((sec % 86400) / 3600);
  const min = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts = [];
  if (day) parts.push(`${day}g`);
  if (hour || day) parts.push(`${hour}s`);
  if (min || hour || day) parts.push(`${min}d`);
  parts.push(`${s}sn`);
  return parts.join(" ");
}

function canViewStatus(interaction) {
  return Boolean(
    interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild) ||
      interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator)
  );
}

module.exports = {
  name: "durum",
  description: "Botun anlik saglik ve sistem durumunu gosterir.",
  async execute(interaction, client) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }

      if (!interaction.guildId) {
        return interaction.editReply("Bu komut sadece sunucuda calisir.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (!canViewStatus(interaction)) {
        return interaction
          .editReply("Bu komut icin Sunucuyu Yonet yetkisi gerekir.")
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      const system = client.features?.SystemOps || require("../features/SystemOps");
      const status = await system.getStatus(client, interaction.guildId || "global");

      const lines = [];
      lines.push(`Uptime: **${formatAgo(status.uptimeMs)}**`);
      lines.push(`WS Ping: **${status.wsPingMs} ms**`);
      lines.push(`DB Gecikme: **${status.dbLatencyMs} ms**`);
      lines.push(`Event Loop Lag: **${status.loopLagMs} ms**`);
      lines.push(`Sunucu Sayisi: **${status.guildCount}**`);
      lines.push(
        `Bellek: RSS **${formatBytes(status.memory.rss)}** | Heap **${formatBytes(status.memory.heapUsed)} / ${formatBytes(status.memory.heapTotal)}**`
      );
      lines.push(
        `Komut Ist.: Toplam **${status.commandCount}**, Rate-limit **${status.rateLimitedCount}**`
      );
      lines.push(
        `Oto Yedek: **${status.autoBackup.intervalMin} dk** | Saklama: **${status.autoBackup.keepCount}**`
      );

      if (status.lastBackup?.name) {
        lines.push(
          `Son Yedek: **${status.lastBackup.name}** (${formatBytes(status.lastBackup.sizeBytes)})`
        );
      } else {
        lines.push("Son Yedek: -");
      }

      if (status.pendingRestore?.fileName) {
        lines.push(
          `Bekleyen Restore: **${status.pendingRestore.fileName}** (restart bekliyor)`
        );
      } else {
        lines.push("Bekleyen Restore: -");
      }

      if (Array.isArray(status.auditRecent) && status.auditRecent.length) {
        lines.push("");
        lines.push("Son Komutlar:");
        for (const row of status.auditRecent.slice(0, 5)) {
          const at = Number(row?.at || 0);
          const stamp = at ? `<t:${Math.floor(at / 1000)}:R>` : "-";
          const name = row?.subcommand ? `/${row.command} ${row.subcommand}` : `/${row.command}`;
          lines.push(`- ${stamp} ${name} - <@${row.userId}> (${row.ok ? "ok" : "fail"})`);
        }
      }

      return interaction.editReply(lines.join("\n")).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    } catch (err) {
      console.error("durum command error:", err);
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply("Durum komutunda hata olustu.").catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }
      return interaction.reply({ content: "Durum komutunda hata olustu.", ephemeral: true }).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    }
  },
};

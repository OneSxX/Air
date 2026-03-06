const {
  normalizeUserId,
  resolveBotOwnerId,
} = require("../utils/ownerAccess");

function resolveBackupAccess(interaction, client) {
  const userId = normalizeUserId(interaction?.user?.id);
  const ownerId = resolveBotOwnerId(client);
  return {
    allowed: Boolean(userId && ownerId && userId === ownerId),
    ownerId,
  };
}

function normalizeSub(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0131/g, "i");
}

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

function mapRestoreConfirmationError(reason) {
  if (reason === "not_found") {
    return "Bu dosya icin aktif restore onayi yok. Once `onay` kodu almadan `/yedek yukle` calistir.";
  }
  if (reason === "expired") {
    return "Restore onay kodunun suresi doldu. Yeni kod almak icin komutu `onay` olmadan tekrar calistir.";
  }
  if (reason === "invalid_request") {
    return "Yedek dosyasi veya onay kodu gecersiz.";
  }
  return "Restore onay kodu gecersiz.";
}

function logSuppressedError(context, err) {
  if (!err) return;
  console.warn(`[yedek] ${context}:`, err?.message || err);
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

module.exports = {
  name: "yedek",
  description: "Veritabani yedegi alir, listeler ve restore icin siraya alir.",
  async execute(interaction, client) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }

      if (!interaction.guildId) {
        return safeEditReply(interaction, "Bu komut sadece sunucuda calisir.", "guild_only");
      }

      const access = resolveBackupAccess(interaction, client);
      if (!access.allowed) {
        const base = "Bu komutu sadece bot sahibi kullanabilir.";
        const hint = access.ownerId
          ? ""
          : " BOT_OWNER_ID / DISCORD_OWNER_ID ayari eksik gorunuyor.";
        return safeEditReply(interaction, `${base}${hint}`, "owner_check");
      }

      const system = client.features?.SystemOps || require("../features/SystemOps");
      const sub = normalizeSub(interaction.options?.getSubcommand?.(false) || "durum");

      if (!["al", "liste", "yukle", "durum"].includes(sub)) {
        return safeEditReply(interaction, "Gecersiz alt komut. `/yedek al|liste|yukle|durum` kullan.", "subcommand");
      }

      if (sub === "al") {
        const backup = await system.createBackup(client, {
          reason: "manual",
          requestedBy: interaction.user.id,
        });
        return safeEditReply(
          interaction,
          `Yedek alindi.\n` +
            `- Dosya: **${backup.name}**\n` +
            `- Boyut: **${formatBytes(backup.sizeBytes)}**\n` +
            `- Zaman: <t:${Math.floor(Number(backup.mtimeMs || Date.now()) / 1000)}:F>`,
          "backup_create"
        );
      }

      if (sub === "liste") {
        const list = system.listBackups(15);
        if (!list.length) {
          return safeEditReply(interaction, "Henuz yedek yok. `/yedek al` ile olustur.", "backup_list_empty");
        }

        const lines = list.map((item, idx) =>
          `${idx + 1}. **${item.name}** | ${formatBytes(item.sizeBytes)} | <t:${Math.floor(item.mtimeMs / 1000)}:R>`
        );

        return safeEditReply(interaction, `Son yedekler:\n${lines.join("\n")}`, "backup_list");
      }

      if (sub === "yukle") {
        const file = String(interaction.options?.getString?.("dosya", true) || "").trim();
        const confirmationCode = String(interaction.options?.getString?.("onay", false) || "").trim();

        if (!confirmationCode) {
          let issued;
          try {
            issued = system.issueRestoreConfirmation(file, interaction.user.id);
          } catch (err) {
            return safeEditReply(interaction, err?.message || "Restore onayi olusturulamadi.", "restore_issue");
          }

          return safeEditReply(
            interaction,
            `Restore onayi gerekli.\n` +
              `- Dosya: **${issued.fileName}**\n` +
              `- Onay kodu: \`${issued.code}\`\n` +
              `- Gecerlilik: <t:${Math.floor(issued.expiresAt / 1000)}:R>\n` +
              `Ayni islemi tamamlamak icin tekrar calistir:\n` +
              `\`/yedek yukle dosya:${issued.fileName} onay:${issued.code}\``,
            "restore_issue_success"
          );
        }

        const confirmed = system.consumeRestoreConfirmation(file, interaction.user.id, confirmationCode);
        if (!confirmed?.ok) {
          return safeEditReply(
            interaction,
            mapRestoreConfirmationError(confirmed?.reason),
            "restore_confirm_fail"
          );
        }

        let pending;
        try {
          pending = system.scheduleRestore(confirmed.fileName, interaction.user.id);
        } catch (err) {
          return safeEditReply(interaction, err?.message || "Restore siraya alinamadi.", "restore_schedule");
        }

        return safeEditReply(
          interaction,
          `Restore siraya alindi: **${pending.fileName}**\n` +
            `Bu restore'un uygulanmasi icin botu yeniden baslatman gerekiyor.`,
          "restore_scheduled"
        );
      }

      const status = await system.getStatus(client, interaction.guildId);
      const last = status.lastBackup?.name
        ? `**${status.lastBackup.name}** (${formatBytes(status.lastBackup.sizeBytes)})`
        : "-";
      const pending = status.pendingRestore?.fileName
        ? `**${status.pendingRestore.fileName}** (restart bekliyor)`
        : "-";

      return safeEditReply(
        interaction,
        `Yedek durumu:\n` +
          `- Son yedek: ${last}\n` +
          `- Bekleyen restore: ${pending}\n` +
          `- Oto yedek: **${status.autoBackup.intervalMin} dk**\n` +
          `- Saklama: **${status.autoBackup.keepCount}**`,
        "status"
      );
    } catch (err) {
      console.error("yedek command error:", err);
      if (interaction.deferred || interaction.replied) {
        return safeEditReply(interaction, "Yedek komutunda hata olustu.", "fatal_edit");
      }
      return safeReply(interaction, { content: "Yedek komutunda hata olustu.", ephemeral: true }, "fatal_reply");
    }
  },
};

module.exports.__private = {
  normalizeUserId,
  resolveBotOwnerId,
  resolveBackupAccess,
  mapRestoreConfirmationError,
};

const { isExternalFeatureCommand } = require("../features/externalCommands");
const {
  checkCommandChannelRestriction,
  buildCommandChannelBlockedMessage,
} = require("../utils/commandChannel");

module.exports = {
  name: "interactionCreate",
  async execute(client, interaction) {
    const systemOps = client?.features?.SystemOps;
    const startedAt = Date.now();

    try {
      if (
        interaction?.isStringSelectMenu?.() ||
        interaction?.isRoleSelectMenu?.() ||
        interaction?.isChannelSelectMenu?.() ||
        interaction?.isModalSubmit?.() ||
        interaction?.isUserSelectMenu?.() ||
        interaction?.isButton?.()
      ) {
        const handledProtection = await client?.features?.Protection?.handleLimitUI?.(interaction, client);
        if (handledProtection) return;

        const handledLogs = await client?.features?.Logs?.handleInteraction?.(interaction, client);
        if (handledLogs) return;

        const handledGiveaway = await client?.features?.Giveaway?.joinFromButton?.(interaction, client);
        if (handledGiveaway) return;

        const marketCommand = client?.commands?.get?.("market");
        if (marketCommand?.handleSelect) {
          const handledMarket = await marketCommand.handleSelect(interaction, client);
          if (handledMarket) return;
        }
      }

      if (!interaction?.isChatInputCommand?.()) return;

      // These commands are handled by their own feature listeners.
      if (isExternalFeatureCommand(interaction?.commandName)) {
        return;
      }

      const channelGate = await checkCommandChannelRestriction(interaction, client, {
        bypassCommands: ["komutoda"],
      });
      if (!channelGate.allowed) {
        return interaction
          .reply({
            content: buildCommandChannelBlockedMessage(channelGate.channelId),
            ephemeral: true,
          })
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      if (systemOps?.checkCommandRateLimit) {
        const rate = systemOps.checkCommandRateLimit(interaction, client);
        if (rate?.limited) {
          const retrySec = Math.max(1, Math.ceil(Number(rate.retryMs || 0) / 1000));
          return interaction
            .reply({
              content: `Cok hizli komut kullaniyorsun. ${retrySec} sn sonra tekrar dene.`,
              ephemeral: true,
            })
            .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
        }
      }

      const command = client?.commands?.get?.(interaction.commandName);
      if (!command) {
        return interaction
          .reply({
            content: `Komut bulunamadi: **/${interaction.commandName}**`,
            ephemeral: true,
          })
          .catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
      }

      await command.execute(interaction, client);

      if (systemOps?.recordCommandAudit) {
        await systemOps.recordCommandAudit(interaction, client, {
          ok: true,
          durationMs: Date.now() - startedAt,
        });
      }

      try {
        const level = client.features?.Level;
        if (level?.onCommand) {
          await level.onCommand(interaction, client);
        }
      } catch (e) {
        console.error("Level onCommand hata:", e);
      }
    } catch (err) {
      console.error("interactionCreate error:", err);

      const shouldNotify =
        interaction?.isChatInputCommand?.() &&
        !isExternalFeatureCommand(interaction?.commandName);
      if (!shouldNotify) return;

      try {
        if (systemOps?.recordCommandAudit) {
          await systemOps.recordCommandAudit(interaction, client, {
            ok: false,
            durationMs: Date.now() - startedAt,
            error: err?.message || "interaction_error",
          });
        }
      } catch {}

      try {
        if (interaction?.deferred && !interaction?.replied) {
          await interaction.editReply({
            content: "Komut calistirilirken hata olustu.",
            ephemeral: true,
          });
        } else if (!interaction?.deferred && !interaction?.replied) {
          await interaction.reply({
            content: "Komut calistirilirken hata olustu.",
            ephemeral: true,
          });
        } else {
          await interaction.followUp({
            content: "Komut calistirilirken hata olustu.",
            ephemeral: true,
          });
        }
      } catch {}
    }
  },
};

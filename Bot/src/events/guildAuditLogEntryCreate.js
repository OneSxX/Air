module.exports = {
  name: "guildAuditLogEntryCreate",
  once: false,
  async execute(client, entry, guild) {
    try {
      const logs = client.features?.Logs;
      if (logs?.onGuildAuditLogEntryCreate) {
        await logs.onGuildAuditLogEntryCreate(entry, guild, client);
      }
    } catch (e) {
      console.error("Logs onGuildAuditLogEntryCreate hata:", e);
    }
  },
};

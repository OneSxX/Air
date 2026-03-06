module.exports = {
  name: "guildBanRemove",
  once: false,
  async execute(client, ban) {
    try {
      const logs = client.features?.Logs;
      if (logs?.onGuildBanRemove) await logs.onGuildBanRemove(ban, client);
    } catch (e) {
      console.error("Logs onGuildBanRemove hata:", e);
    }
  },
};

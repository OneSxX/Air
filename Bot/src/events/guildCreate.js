module.exports = {
  name: "guildCreate",
  once: false,
  async execute(client, guild) {
    try {
      const protection = client.features?.Protection;
      if (protection?.onGuildCreate) await protection.onGuildCreate(guild, client);
    } catch (e) {
      console.error("Protection onGuildCreate hata:", e);
    }

    try {
      const logs = client.features?.Logs;
      if (logs?.onGuildCreate) await logs.onGuildCreate(guild, client);
    } catch (e) {
      console.error("Logs onGuildCreate hata:", e);
    }
  },
};

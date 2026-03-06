module.exports = {
  name: "guildUpdate",
  once: false,
  async execute(client, oldGuild, newGuild) {
    try {
      const p = client.features?.Protection;
      if (p?.onGuildUpdate) await p.onGuildUpdate(oldGuild, newGuild, client);
    } catch (e) {
      console.error("Protection onGuildUpdate hata:", e);
    }

    try {
      const logs = client.features?.Logs;
      if (logs?.onGuildUpdate) await logs.onGuildUpdate(oldGuild, newGuild, client);
    } catch (e) {
      console.error("Logs onGuildUpdate hata:", e);
    }
  },
};

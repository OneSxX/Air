module.exports = {
  name: "guildBanAdd",
  once: false,
  async execute(client, ban) {
    try {
      const p = client.features?.Protection;
      if (p?.onGuildBanAdd) await p.onGuildBanAdd(ban, client);
    } catch (e) {
      console.error("Protection onGuildBanAdd hata:", e);
    }

    try {
      const logs = client.features?.Logs;
      if (logs?.onGuildBanAdd) await logs.onGuildBanAdd(ban, client);
    } catch (e) {
      console.error("Logs onGuildBanAdd hata:", e);
    }
  },
};


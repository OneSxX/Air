module.exports = {
  name: "channelCreate",
  once: false,
  async execute(client, channel) {
    try {
      const p = client.features?.Protection;
      if (p?.onChannelCreate) await p.onChannelCreate(channel, client);
    } catch (e) {
      console.error("Protection onChannelCreate hata:", e);
    }

    try {
      const logs = client.features?.Logs;
      if (logs?.onChannelCreate) await logs.onChannelCreate(channel, client);
    } catch (e) {
      console.error("Logs onChannelCreate hata:", e);
    }
  },
};

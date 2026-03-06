module.exports = {
  name: "channelDelete",
  once: false,
  async execute(client, channel) {
    try {
      const p = client.features?.Protection;
      if (p?.onChannelDelete) await p.onChannelDelete(channel, client);
    } catch (e) {
      console.error("Protection onChannelDelete hata:", e);
    }

    try {
      const logs = client.features?.Logs;
      if (logs?.onChannelDelete) await logs.onChannelDelete(channel, client);
    } catch (e) {
      console.error("Logs onChannelDelete hata:", e);
    }
  },
};

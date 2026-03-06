module.exports = {
  name: "channelUpdate",
  once: false,
  async execute(client, oldChannel, newChannel) {
    try {
      const p = client.features?.Protection;
      if (p?.onChannelUpdate) await p.onChannelUpdate(oldChannel, newChannel, client);
    } catch (e) {
      console.error("Protection onChannelUpdate hata:", e);
    }

    try {
      const logs = client.features?.Logs;
      if (logs?.onChannelUpdate) await logs.onChannelUpdate(oldChannel, newChannel, client);
    } catch (e) {
      console.error("Logs onChannelUpdate hata:", e);
    }
  },
};

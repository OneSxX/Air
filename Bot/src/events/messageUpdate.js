module.exports = {
  name: "messageUpdate",
  once: false,
  async execute(client, oldMessage, newMessage) {
    try {
      const p = client.features?.Protection;
      if (p?.onMessageUpdate) await p.onMessageUpdate(oldMessage, newMessage, client);
    } catch (e) {
      console.error("Protection onMessageUpdate hata:", e);
    }

    try {
      const logs = client.features?.Logs;
      if (logs?.onMessageUpdate) {
        await logs.onMessageUpdate(oldMessage, newMessage, client);
      }
    } catch (e) {
      console.error("Logs onMessageUpdate hata:", e);
    }
  },
};

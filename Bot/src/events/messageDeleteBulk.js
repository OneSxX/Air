module.exports = {
  name: "messageDeleteBulk",
  once: false,
  async execute(client, messages) {
    try {
      const logs = client.features?.Logs;
      if (logs?.onMessageDeleteBulk) {
        await logs.onMessageDeleteBulk(messages, client);
      }
    } catch (e) {
      console.error("Logs onMessageDeleteBulk hata:", e);
    }
  },
};

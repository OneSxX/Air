module.exports = {
  name: "messageDelete",
  once: false,
  async execute(client, message) {
    try {
      const logs = client.features?.Logs;
      if (logs?.onMessageDelete) await logs.onMessageDelete(message, client);
    } catch (e) {
      console.error("Logs onMessageDelete hata:", e);
    }
  },
};


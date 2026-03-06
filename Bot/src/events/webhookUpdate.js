module.exports = {
  name: "webhookUpdate",
  once: false,
  async execute(client, channel) {
    try {
      const p = client.features?.Protection;
      if (p?.onWebhookUpdate) await p.onWebhookUpdate(channel, client);
    } catch (e) {
      console.error("Protection onWebhookUpdate hata:", e);
    }

    try {
      const logs = client.features?.Logs;
      if (logs?.onWebhookUpdate) await logs.onWebhookUpdate(channel, client);
    } catch (e) {
      console.error("Logs onWebhookUpdate hata:", e);
    }
  },
};

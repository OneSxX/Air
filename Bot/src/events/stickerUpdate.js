module.exports = {
  name: "stickerUpdate",
  once: false,
  async execute(client, oldSticker, newSticker) {
    try {
      const logs = client.features?.Logs;
      if (logs?.onStickerUpdate) {
        await logs.onStickerUpdate(oldSticker, newSticker, client);
      }
    } catch (e) {
      console.error("Logs onStickerUpdate hata:", e);
    }
  },
};

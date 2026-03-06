module.exports = {
  name: "stickerDelete",
  once: false,
  async execute(client, sticker) {
    try {
      const logs = client.features?.Logs;
      if (logs?.onStickerDelete) {
        await logs.onStickerDelete(sticker, client);
      }
    } catch (e) {
      console.error("Logs onStickerDelete hata:", e);
    }
  },
};

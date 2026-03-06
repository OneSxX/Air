module.exports = {
  name: "stickerCreate",
  once: false,
  async execute(client, sticker) {
    try {
      const logs = client.features?.Logs;
      if (logs?.onStickerCreate) {
        await logs.onStickerCreate(sticker, client);
      }
    } catch (e) {
      console.error("Logs onStickerCreate hata:", e);
    }
  },
};

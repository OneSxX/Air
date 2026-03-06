module.exports = {
  name: "emojiCreate",
  once: false,
  async execute(client, emoji) {
    try {
      const logs = client.features?.Logs;
      if (logs?.onEmojiCreate) {
        await logs.onEmojiCreate(emoji, client);
      }
    } catch (e) {
      console.error("Logs onEmojiCreate hata:", e);
    }
  },
};

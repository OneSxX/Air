module.exports = {
  name: "emojiDelete",
  once: false,
  async execute(client, emoji) {
    try {
      const logs = client.features?.Logs;
      if (logs?.onEmojiDelete) {
        await logs.onEmojiDelete(emoji, client);
      }
    } catch (e) {
      console.error("Logs onEmojiDelete hata:", e);
    }
  },
};

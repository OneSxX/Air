module.exports = {
  name: "emojiUpdate",
  once: false,
  async execute(client, oldEmoji, newEmoji) {
    try {
      const logs = client.features?.Logs;
      if (logs?.onEmojiUpdate) {
        await logs.onEmojiUpdate(oldEmoji, newEmoji, client);
      }
    } catch (e) {
      console.error("Logs onEmojiUpdate hata:", e);
    }
  },
};

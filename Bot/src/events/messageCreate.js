module.exports = {
  name: "messageCreate",
  once: false,
  async execute(client, message) {
    if (!message.guild) return;

    try {
      const reminder = client.features?.Reminder;
      if (reminder?.onMessage) await reminder.onMessage(message, client);
    } catch (e) {
      console.error("Reminder onMessage hata:", e);
    }

    if (message.author?.bot) return;

    try {
      const numberGame = client.features?.NumberGame;
      if (numberGame?.onMessage) {
        const result = await numberGame.onMessage(message, client);
        if (result?.handled) return;
      }
    } catch (e) {
      console.error("NumberGame onMessage hata:", e);
    }

    try {
      const wordGame = client.features?.WordGame;
      if (wordGame?.onMessage) {
        const result = await wordGame.onMessage(message, client);
        if (result?.handled) return;
      }
    } catch (e) {
      console.error("WordGame onMessage hata:", e);
    }

    try {
      const p = client.features?.Protection;
      if (p?.onMessage) await p.onMessage(message, client);
    } catch (e) {
      console.error("Protection onMessage hata:", e);
    }

    try {
      const level = client.features?.Level;
      if (level?.onMessage) await level.onMessage(message, client);
    } catch (e) {
      console.error("Level onMessage hata:", e);
    }
  },
};

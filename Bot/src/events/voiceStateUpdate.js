module.exports = {
  name: "voiceStateUpdate",
  once: false,
  async execute(client, oldState, newState) {
    try {
      const level = client.features?.Level;
      if (level?.onVoiceStateUpdate) {
        await level.onVoiceStateUpdate(oldState, newState, client);
      }
    } catch (e) {
      console.error("Level onVoiceStateUpdate hata:", e);
    }

    try {
      const logs = client.features?.Logs;
      if (logs?.onVoiceStateUpdate) {
        await logs.onVoiceStateUpdate(oldState, newState, client);
      }
    } catch (e) {
      console.error("Logs onVoiceStateUpdate hata:", e);
    }
  },
};

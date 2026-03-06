module.exports = {
  name: "messageReactionRemove",
  once: false,
  async execute(client, reaction, user) {
    try {
      const feature = client.features?.ReactionRole;
      if (feature?.onReactionRemove) {
        await feature.onReactionRemove(reaction, user, client);
      }
    } catch (e) {
      console.error("ReactionRole onReactionRemove hata:", e);
    }
  },
};


module.exports = {
  name: "messageReactionAdd",
  once: false,
  async execute(client, reaction, user) {
    try {
      const feature = client.features?.ReactionRole;
      if (feature?.onReactionAdd) {
        await feature.onReactionAdd(reaction, user, client);
      }
    } catch (e) {
      console.error("ReactionRole onReactionAdd hata:", e);
    }
  },
};


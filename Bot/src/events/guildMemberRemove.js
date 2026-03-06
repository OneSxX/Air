module.exports = {
  name: "guildMemberRemove",
  once: false,
  async execute(client, member) {
    try {
      const level = client.features?.Level;
      if (level?.onGuildMemberRemove) await level.onGuildMemberRemove(member, client);
    } catch (e) {
      console.error("Level onGuildMemberRemove hata:", e);
    }

    try {
      const p = client.features?.Protection;
      if (p?.onGuildMemberRemove) await p.onGuildMemberRemove(member, client);
    } catch (e) {
      console.error("Protection onGuildMemberRemove hata:", e);
    }

    try {
      const logs = client.features?.Logs;
      if (logs?.onGuildMemberRemove) await logs.onGuildMemberRemove(member, client);
    } catch (e) {
      console.error("Logs onGuildMemberRemove hata:", e);
    }
  },
};

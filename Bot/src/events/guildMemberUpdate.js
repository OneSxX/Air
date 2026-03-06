module.exports = {
  name: "guildMemberUpdate",
  once: false,
  async execute(client, oldMember, newMember) {
    try {
      const p = client.features?.Protection;
      if (p?.onGuildMemberUpdate) await p.onGuildMemberUpdate(oldMember, newMember, client);
    } catch (e) {
      console.error("Protection onGuildMemberUpdate hata:", e);
    }

    try {
      const logs = client.features?.Logs;
      if (logs?.onGuildMemberUpdate) await logs.onGuildMemberUpdate(oldMember, newMember, client);
    } catch (e) {
      console.error("Logs onGuildMemberUpdate hata:", e);
    }
  },
};


module.exports = {
  name: "inviteCreate",
  once: false,
  async execute(client, invite) {
    try {
      const logs = client.features?.Logs;
      if (logs?.onInviteCreate) await logs.onInviteCreate(invite, client);
    } catch (e) {
      console.error("Logs onInviteCreate hata:", e);
    }
  },
};

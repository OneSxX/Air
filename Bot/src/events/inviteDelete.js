module.exports = {
  name: "inviteDelete",
  once: false,
  async execute(client, invite) {
    try {
      const logs = client.features?.Logs;
      if (logs?.onInviteDelete) await logs.onInviteDelete(invite, client);
    } catch (e) {
      console.error("Logs onInviteDelete hata:", e);
    }
  },
};

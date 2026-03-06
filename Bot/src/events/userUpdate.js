module.exports = {
  name: "userUpdate",
  once: false,
  async execute(client, oldUser, newUser) {
    try {
      const logs = client.features?.Logs;
      if (logs?.onUserUpdate) {
        await logs.onUserUpdate(oldUser, newUser, client);
      }
    } catch (e) {
      console.error("Logs onUserUpdate hata:", e);
    }
  },
};

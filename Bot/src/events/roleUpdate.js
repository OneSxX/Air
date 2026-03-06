module.exports = {
  name: "roleUpdate",
  once: false,
  async execute(client, oldRole, newRole) {
    try {
      const p = client.features?.Protection;
      if (p?.onRoleUpdate) await p.onRoleUpdate(oldRole, newRole, client);
    } catch (e) {
      console.error("Protection onRoleUpdate hata:", e);
    }

    try {
      const logs = client.features?.Logs;
      if (logs?.onRoleUpdate) await logs.onRoleUpdate(oldRole, newRole, client);
    } catch (e) {
      console.error("Logs onRoleUpdate hata:", e);
    }
  },
};

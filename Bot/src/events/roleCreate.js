module.exports = {
  name: "roleCreate",
  once: false,
  async execute(client, role) {
    try {
      const p = client.features?.Protection;
      if (p?.onRoleCreate) await p.onRoleCreate(role, client);
    } catch (e) {
      console.error("Protection onRoleCreate hata:", e);
    }

    try {
      const logs = client.features?.Logs;
      if (logs?.onRoleCreate) await logs.onRoleCreate(role, client);
    } catch (e) {
      console.error("Logs onRoleCreate hata:", e);
    }
  },
};

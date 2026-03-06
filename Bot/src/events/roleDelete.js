module.exports = {
  name: "roleDelete",
  once: false,
  async execute(client, role) {
    try {
      const p = client.features?.Protection;
      if (p?.onRoleDelete) await p.onRoleDelete(role, client);
    } catch (e) {
      console.error("Protection onRoleDelete hata:", e);
    }

    try {
      const logs = client.features?.Logs;
      if (logs?.onRoleDelete) await logs.onRoleDelete(role, client);
    } catch (e) {
      console.error("Logs onRoleDelete hata:", e);
    }
  },
};

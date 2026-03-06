const { PermissionFlagsBits } = require("discord.js");

module.exports = {
  name: "guildMemberAdd",
  once: false,
  async execute(client, member) {
    try {
      const level = client.features?.Level;
      if (level?.onGuildMemberAdd) await level.onGuildMemberAdd(member, client);
    } catch (e) {
      console.error("Level onGuildMemberAdd hata:", e);
    }

    try {
      const p = client.features?.Protection;
      if (p?.onGuildMemberAdd) await p.onGuildMemberAdd(member, client);
    } catch (e) {
      console.error("Protection onGuildMemberAdd hata:", e);
    }

    try {
      const logs = client.features?.Logs;
      if (logs?.onGuildMemberAdd) await logs.onGuildMemberAdd(member, client);
    } catch (e) {
      console.error("Logs onGuildMemberAdd hata:", e);
    }

    try {
      const welcome = client.features?.Welcome;
      if (welcome?.onGuildMemberAdd) await welcome.onGuildMemberAdd(member, client);
    } catch (e) {
      console.error("Welcome onGuildMemberAdd hata:", e);
    }

    try {
      if (!member?.guild || member.user?.bot) return;

      const key = `auto_role_${member.guild.id}`;
      const roleId = await client.db.get(key);
      if (!roleId) return;

      const role = member.guild.roles.cache.get(roleId) || await (member.guild.roles.fetch(roleId) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
      if (!role || role.managed) return;

      const me = member.guild.members.me || await (member.guild.members.fetch(client.user.id) || Promise.resolve(null)).catch((err) => { globalThis.__airWarnSuppressedError?.(err); return null; });
      if (!me) return;
      if (!me.permissions?.has?.(PermissionFlagsBits.ManageRoles)) return;
      if (role.position >= me.roles.highest.position) return;
      if (member.roles.cache.has(role.id)) return;

      await (member.roles.add(role.id, "Auto rol") || Promise.resolve()).catch((err) => { globalThis.__airWarnSuppressedError?.(err); });
    } catch (e) {
      console.error("Auto role onGuildMemberAdd hata:", e);
    }
  },
};

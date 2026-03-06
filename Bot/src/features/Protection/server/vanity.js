const { sendLog } = require("../utils/audit");

async function onGuildUpdate(oldGuild, newGuild, db) {
  if (!newGuild?.id) return;

  const gid = newGuild.id;
  const cfg = (await db.get(`prot_cfg_${gid}`)) || { toggles: {} };
  if (!cfg?.toggles?.vanity) return;

  // bazı sunucularda vanityURLCode null olabilir
  const oldCode = oldGuild?.vanityURLCode || null;
  const newCode = newGuild?.vanityURLCode || null;

  if (oldCode === newCode) return;

  await sendLog(
    cfg,
    newGuild,
    `🔁 **Özel URL Değiştirme Bildirimi**\nEski: **${oldCode ?? "Yok"}**\nYeni: **${newCode ?? "Yok"}**`
  );
}

module.exports = { onGuildUpdate };
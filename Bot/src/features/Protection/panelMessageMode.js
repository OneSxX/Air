function panelTypeFromSelectId(customId) {
  if (customId === "prot:ui:chat") return "chat";
  if (customId === "prot:ui:server") return "server";
  if (customId === "prot:ui:limits") return "limits";
  return null;
}

function getPanelKindsFromMessage(msg) {
  const out = new Set();
  const rows = msg?.components || [];

  for (const row of rows) {
    for (const component of row?.components || []) {
      const panelType = panelTypeFromSelectId(component?.customId);
      if (panelType) out.add(panelType);
    }
  }

  return out;
}

function getSinglePanelTypeFromMessage(msg) {
  const kinds = [...getPanelKindsFromMessage(msg)];
  if (kinds.length !== 1) return null;
  return kinds[0];
}

function isCombinedPanelMessage(msg) {
  const kinds = getPanelKindsFromMessage(msg);
  return kinds.has("chat") && kinds.has("server") && kinds.has("limits");
}

module.exports = {
  panelTypeFromSelectId,
  getPanelKindsFromMessage,
  getSinglePanelTypeFromMessage,
  isCombinedPanelMessage,
};

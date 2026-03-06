const test = require("node:test");
const assert = require("node:assert/strict");

const {
  renderPanels,
  renderCombinedPanel,
} = require("../src/features/Protection/panel");

function extractComponentCustomIds(payload) {
  const out = [];
  for (const row of payload?.components || []) {
    for (const c of row?.components || []) {
      const id = c?.data?.custom_id || c?.customId || null;
      if (id) out.push(id);
    }
  }
  return out;
}

test("renderPanels returns three separate panel payloads", () => {
  const panels = renderPanels({ toggles: {} });

  assert.ok(panels.chat);
  assert.ok(panels.server);
  assert.ok(panels.limits);
  assert.equal((panels.chat.embeds || []).length, 1);
  assert.equal((panels.server.embeds || []).length, 1);
  assert.equal((panels.limits.embeds || []).length, 1);
});

test("renderCombinedPanel returns single payload with all controls", () => {
  const payload = renderCombinedPanel({ toggles: {} });

  assert.equal((payload.embeds || []).length, 3);
  assert.equal((payload.components || []).length, 4);

  const ids = extractComponentCustomIds(payload);
  assert.equal(ids.includes("prot:ui:chat"), true);
  assert.equal(ids.includes("prot:ui:server"), true);
  assert.equal(ids.includes("prot:ui:limits"), true);
  assert.equal(ids.includes("prot:all:setup"), true);
  assert.equal(ids.includes("prot:all:disable"), true);
});

test("render panels include actor label in footer when provided", () => {
  const actor = { tag: "PanelUser#1234", username: "PanelUser" };
  const panels = renderPanels({ toggles: {} }, { actor });
  const combined = renderCombinedPanel({ toggles: {} }, { actor });

  const chatFooter = panels.chat.embeds?.[0]?.data?.footer?.text || "";
  const serverFooter = panels.server.embeds?.[0]?.data?.footer?.text || "";
  const limitsFooter = panels.limits.embeds?.[0]?.data?.footer?.text || "";
  const combinedLimitsFooter = combined.embeds?.[2]?.data?.footer?.text || "";

  assert.equal(chatFooter.includes("Son kullanan: PanelUser#1234"), true);
  assert.equal(serverFooter.includes("Son kullanan: PanelUser#1234"), true);
  assert.equal(limitsFooter.includes("Son kullanan: PanelUser#1234"), true);
  assert.equal(combinedLimitsFooter.includes("Son kullanan: PanelUser#1234"), true);
});

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  panelTypeFromSelectId,
  getSinglePanelTypeFromMessage,
  isCombinedPanelMessage,
} = require("../src/features/Protection/panelMessageMode");

function makeMessage(customIds) {
  return {
    components: customIds.map((id) => ({
      components: [{ customId: id }],
    })),
  };
}

test("panelTypeFromSelectId maps protection selects", () => {
  assert.equal(panelTypeFromSelectId("prot:ui:chat"), "chat");
  assert.equal(panelTypeFromSelectId("prot:ui:server"), "server");
  assert.equal(panelTypeFromSelectId("prot:ui:limits"), "limits");
  assert.equal(panelTypeFromSelectId("unknown:id"), null);
});

test("single panel message resolves to one panel type", () => {
  const msg = makeMessage(["prot:ui:chat"]);
  assert.equal(getSinglePanelTypeFromMessage(msg), "chat");
  assert.equal(isCombinedPanelMessage(msg), false);
});

test("combined panel message is detected and not treated as single", () => {
  const msg = makeMessage(["prot:ui:chat", "prot:ui:server", "prot:ui:limits"]);
  assert.equal(getSinglePanelTypeFromMessage(msg), null);
  assert.equal(isCombinedPanelMessage(msg), true);
});

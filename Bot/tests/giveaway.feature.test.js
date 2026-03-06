const test = require("node:test");
const assert = require("node:assert/strict");

const giveawayFeature = require("../src/features/Giveaway");
const giveawayCommand = require("../src/commands/giveaway");

test("pickRandomWinners returns unique winners up to requested count", () => {
  const { pickRandomWinners } = giveawayFeature.__private;
  const participants = ["1".repeat(18), "2".repeat(18), "3".repeat(18), "4".repeat(18)];
  const winners = pickRandomWinners(participants, 3);
  assert.equal(winners.length, 3);
  assert.equal(new Set(winners).size, 3);
});

test("parseDurationInput parses common duration formats", () => {
  const { parseDurationInput } = giveawayCommand.__private;
  assert.equal(parseDurationInput("30m"), 30 * 60 * 1000);
  assert.equal(parseDurationInput("2h 30m"), (2 * 60 + 30) * 60 * 1000);
  assert.equal(parseDurationInput("5sn"), null);
});

test("parseButtonAction resolves join and leave confirmation ids", () => {
  const { parseButtonAction } = giveawayFeature.__private;
  assert.deepEqual(parseButtonAction("gw:join"), { type: "join", messageId: null });
  assert.deepEqual(parseButtonAction("gw:leave:yes:123456789012345678"), {
    type: "leave_confirm",
    messageId: "123456789012345678",
  });
  assert.deepEqual(parseButtonAction("gw:leave:no:123456789012345678"), {
    type: "leave_cancel",
    messageId: "123456789012345678",
  });
  assert.equal(parseButtonAction("gw:leave:yes:abc"), null);
});

test("winnerLabel returns singular/plural in Turkish", () => {
  const { winnerLabel } = giveawayFeature.__private;
  assert.equal(winnerLabel(1), "Kazanan");
  assert.equal(winnerLabel(2), "Kazananlar");
  assert.equal(winnerLabel(3), "Kazananlar");
});

test("buildAnnouncementContent formats decorated end message", () => {
  const { buildAnnouncementContent } = giveawayFeature.__private;
  const row = { prize: "Deneme Odul" };
  const oneWinner = buildAnnouncementContent(row, ["1".repeat(18)], { reroll: false });
  assert.match(oneWinner, /\*\*Giveaway Bitti\*\*/);
  assert.match(oneWinner, /・Odul: Deneme Odul/);
  assert.match(oneWinner, /・Kazanan: <@1{18}>/);

  const twoWinners = buildAnnouncementContent(row, ["1".repeat(18), "2".repeat(18)], { reroll: false });
  assert.match(twoWinners, /・Kazananlar: <@1{18}>, <@2{18}>/);
});

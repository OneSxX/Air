const test = require("node:test");
const assert = require("node:assert/strict");

const music = require("../src/features/Music");

test("formatDuration renders mm:ss and hh:mm:ss", () => {
  const { formatDuration } = music.__private;
  assert.equal(formatDuration(0), "00:00");
  assert.equal(formatDuration(65), "01:05");
  assert.equal(formatDuration(3661), "01:01:01");
});

test("canControlState requires same voice channel", () => {
  const { canControlState } = music.__private;

  assert.equal(canControlState({ voiceChannelId: null }, "123").ok, false);
  assert.equal(canControlState({ voiceChannelId: "111" }, "222").ok, false);
  assert.equal(canControlState({ voiceChannelId: "111" }, "111").ok, true);
});

test("parseSpotifyInput parses track and playlist urls", () => {
  const { parseSpotifyInput } = music.__private;

  const track = parseSpotifyInput("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc");
  assert.equal(track?.type, "track");
  assert.equal(track?.id, "4uLU6hMCjMI75M1A2tKUQC");

  const playlist = parseSpotifyInput("https://open.spotify.com/intl-tr/playlist/37i9dQZF1DXcBWIGoYBM5M");
  assert.equal(playlist?.type, "playlist");
  assert.equal(playlist?.id, "37i9dQZF1DXcBWIGoYBM5M");

  assert.equal(parseSpotifyInput("https://youtube.com/watch?v=test"), null);
});

test("buildSpotifySearchQuery joins title and artists", () => {
  const { buildSpotifySearchQuery } = music.__private;

  const query = buildSpotifySearchQuery({
    name: "Blinding Lights",
    artists: ["The Weeknd"],
  });
  assert.equal(query, "Blinding Lights The Weeknd audio");
});

test("sleep resolves for non-negative wait", async () => {
  const { sleep } = music.__private;
  const start = Date.now();
  await sleep(10);
  assert.equal(Date.now() - start >= 0, true);
});

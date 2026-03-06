const { EmbedBuilder } = require("discord.js");

const EMBED_COLOR = 0x000000;

function createEmbed() {
  return new EmbedBuilder().setColor(EMBED_COLOR);
}

function enforceBlackEmbedColor() {
  // Backward compatibility placeholder.
  // Color forcing is disabled so per-event .setColor(...) values are preserved.
}

module.exports = {
  EMBED_COLOR,
  createEmbed,
  enforceBlackEmbedColor,
};

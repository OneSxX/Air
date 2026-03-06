// src/features/voiceManager/index.js
module.exports = (client, db, config) => {
  // Multi-sunucu voice manager’ı burada register ediyoruz
  const register = require("./voiceManager");
  return register(client, db, config);
};
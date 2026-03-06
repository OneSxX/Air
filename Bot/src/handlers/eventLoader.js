const fs = require("fs");
const path = require("path");

function byNameAsc(a, b) {
  return a.localeCompare(b, "en");
}

module.exports = async function loadEvents(client) {
  const eventsDir = path.join(__dirname, "..", "events");
  if (!fs.existsSync(eventsDir)) {
    console.warn(`[event-loader] events directory not found: ${eventsDir}`);
    return 0;
  }

  const files = fs
    .readdirSync(eventsDir)
    .filter((name) => name.endsWith(".js"))
    .sort(byNameAsc);

  let loaded = 0;

  for (const fileName of files) {
    const filePath = path.join(eventsDir, fileName);

    try {
      delete require.cache[require.resolve(filePath)];
      const exported = require(filePath);
      const event = exported?.default ?? exported;

      if (!event?.name || typeof event.execute !== "function") {
        console.warn(`[event-loader] invalid event module skipped: ${fileName}`);
        continue;
      }

      const handler = (...args) => event.execute(client, ...args);
      if (event.once) {
        client.once(event.name, handler);
      } else {
        client.on(event.name, handler);
      }

      loaded += 1;
      console.log(`[event-loader] loaded: ${event.name} (${fileName})`);
    } catch (err) {
      console.error(`[event-loader] failed: ${fileName}`, err?.message || err);
    }
  }

  return loaded;
};

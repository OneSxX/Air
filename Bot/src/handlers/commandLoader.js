const fs = require("fs");
const path = require("path");

function byNameAsc(a, b) {
  return a.localeCompare(b, "en");
}

function walkJsFiles(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.sort((a, b) => byNameAsc(a.name, b.name));

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkJsFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".js")) {
      out.push(fullPath);
    }
  }

  return out;
}

module.exports = async function loadCommands(client) {
  if (!client?.commands || typeof client.commands.set !== "function") {
    throw new Error("command loader requires client.commands Collection");
  }

  const commandsDir = path.join(__dirname, "..", "commands");
  if (!fs.existsSync(commandsDir)) {
    console.warn(`[command-loader] commands directory not found: ${commandsDir}`);
    return 0;
  }

  const files = walkJsFiles(commandsDir);
  let loaded = 0;

  for (const file of files) {
    try {
      delete require.cache[require.resolve(file)];
      const exported = require(file);
      const command = exported?.default ?? exported;

      if (!command?.name || typeof command.execute !== "function") {
        continue;
      }
      if (client.commands.has(command.name)) {
        console.warn(`[command-loader] duplicate command ignored: ${command.name} (${file})`);
        continue;
      }

      client.commands.set(command.name, command);
      loaded += 1;
    } catch (err) {
      console.error(`[command-loader] failed: ${file}`, err?.message || err);
    }
  }

  console.log(`[command-loader] loaded ${loaded} command(s).`);
  return loaded;
};

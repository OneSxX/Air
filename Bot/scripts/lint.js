const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = process.cwd();
const targetDirs = ["src", "tests", "scripts"]
  .map((p) => path.join(rootDir, p))
  .filter((p) => fs.existsSync(p) && fs.statSync(p).isDirectory());

function walkJsFiles(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name, "en"));

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

function runSyntaxChecks(files) {
  let failed = false;

  for (const file of files) {
    const res = spawnSync(process.execPath, ["--check", file], {
      encoding: "utf8",
    });
    if (res.status === 0) continue;

    failed = true;
    console.error(`[lint] syntax error: ${path.relative(rootDir, file)}`);
    if (res.stderr) console.error(res.stderr.trim());
  }

  return !failed;
}

function validateSlashCommands() {
  const registerPath = path.join(rootDir, "src", "slash", "register.js");
  const legacyRegisterPath = path.join(rootDir, "src", "commands", "register.js");

  if (fs.existsSync(legacyRegisterPath)) {
    throw new Error("legacy slash register found at src/commands/register.js");
  }
  if (!fs.existsSync(registerPath)) {
    throw new Error("missing slash register at src/slash/register.js");
  }

  const { getGlobalCommandsBody } = require(registerPath);
  const body = getGlobalCommandsBody();
  if (!Array.isArray(body)) {
    throw new Error("getGlobalCommandsBody() must return an array");
  }

  const seenNames = new Set();
  for (const cmd of body) {
    const name = String(cmd?.name || "").trim();
    if (!name) throw new Error("slash command with empty name detected");
    if (seenNames.has(name)) throw new Error(`duplicate slash command name: ${name}`);
    seenNames.add(name);
  }
}

function validateExternalFeatureCommands() {
  const registerPath = path.join(rootDir, "src", "slash", "register.js");
  const externalCommandsPath = path.join(rootDir, "src", "features", "externalCommands.js");
  const commandsDir = path.join(rootDir, "src", "commands");

  if (!fs.existsSync(externalCommandsPath)) {
    throw new Error("missing external command map at src/features/externalCommands.js");
  }

  const { getGlobalCommandsBody } = require(registerPath);
  const { listExternalFeatureCommands, isExternalFeatureCommand } = require(externalCommandsPath);

  const body = getGlobalCommandsBody();
  const slashNames = new Set(
    body
      .map((cmd) => String(cmd?.name || "").trim().toLowerCase())
      .filter(Boolean)
  );

  const externalNames = listExternalFeatureCommands();
  for (const name of externalNames) {
    if (!slashNames.has(name)) {
      throw new Error(`external feature command missing in slash body: ${name}`);
    }
  }

  if (!fs.existsSync(commandsDir)) return;

  const files = walkJsFiles(commandsDir);
  for (const file of files) {
    delete require.cache[require.resolve(file)];
    const exported = require(file);
    const command = exported?.default ?? exported;
    const name = String(command?.name || "").trim().toLowerCase();
    if (!name) continue;
    if (isExternalFeatureCommand(name)) {
      throw new Error(
        `external feature command must not be in src/commands: ${name} (${path.relative(rootDir, file)})`
      );
    }
  }
}

function main() {
  const files = targetDirs.flatMap((dir) => walkJsFiles(dir));
  if (!files.length) {
    console.log("[lint] no JavaScript files found.");
    return;
  }

  const syntaxOk = runSyntaxChecks(files);
  let slashOk = true;
  let externalMapOk = true;

  try {
    validateSlashCommands();
  } catch (err) {
    slashOk = false;
    console.error(`[lint] ${err?.message || err}`);
  }

  try {
    validateExternalFeatureCommands();
  } catch (err) {
    externalMapOk = false;
    console.error(`[lint] ${err?.message || err}`);
  }

  if (!syntaxOk || !slashOk || !externalMapOk) {
    process.exit(1);
  }

  console.log(`[lint] ok (${files.length} files checked).`);
}

main();

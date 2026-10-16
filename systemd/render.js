import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "../src/config.js";
import { readTailscaleIdentity } from "../src/tailscale.js";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export function renderUnit(template, values) {
  const tokens = {
    "@ROOT@": values.root,
    "@NODE@": values.node,
    "@PATH@": values.path,
    "@HOME@": values.home,
    "@PORT@": String(values.port),
    "@OPERATOR_LOGIN@": values.login,
  };
  let text = template;
  for (const [token, value] of Object.entries(tokens)) {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`Missing a value for ${token}.`);
    }
    if (value.includes("\n") || value.includes('"')) {
      throw new Error(`${token} contains a character the service file cannot store.`);
    }
    if (!text.includes(token)) throw new Error(`Service template is missing ${token}.`);
    text = text.split(token).join(value);
  }
  return text;
}

export function servicePath(env = process.env, nodeBin = process.execPath, home = homedir()) {
  const parts = [dirname(nodeBin), join(home, ".local", "bin")];
  for (const part of (env.PATH ?? "").split(":")) {
    if (part.startsWith("/") && !parts.includes(part)) parts.push(part);
  }
  for (const part of ["/usr/bin", "/bin"]) {
    if (!parts.includes(part)) parts.push(part);
  }
  return parts.join(":");
}

function envFile() {
  return join(projectRoot, ".env");
}

function writeEnv(login, port) {
  writeFileSync(envFile(), `OPERATOR_LOGIN=${login}\nPORT=${port}\n`);
}

export function ensureEnv(env = process.env) {
  const file = envFile();
  if (!existsSync(file)) {
    const login = (env.OPERATOR_LOGIN ?? "").trim();
    const port = (env.PORT ?? "").trim() || "3000";
    if (login && login !== "you@example.com") writeEnv(login, port);
    else {
      const identity = readTailscaleIdentity();
      writeEnv(identity.login, port);
      console.error(`Wrote .env with this machine's Tailscale login (${identity.login}).`);
    }
  }
  const values = parseEnv(readFileSync(file, "utf8"));
  const login = (values.OPERATOR_LOGIN ?? "").trim();
  const port = (values.PORT ?? "").trim() || "3000";
  if (!login || login === "you@example.com") {
    throw new Error("Set OPERATOR_LOGIN in .env to your Tailscale login. See .env.example.");
  }
  if (!Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error("PORT in .env must be an integer from 1 to 65535.");
  }
  return { login, port };
}

function main() {
  const dest = process.argv[2];
  if (!dest) {
    console.error("Usage: node systemd/render.js <unit-destination>");
    process.exit(1);
  }
  const settings = ensureEnv();
  const template = readFileSync(join(projectRoot, "systemd", "cursor-remote.service"), "utf8");
  const unit = renderUnit(template, {
    root: projectRoot,
    node: process.execPath,
    path: servicePath(),
    home: homedir(),
    port: settings.port,
    login: settings.login,
  });
  writeFileSync(dest, unit);
  console.error(`Wrote ${dest}`);
  console.error(`Operator login: ${settings.login}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

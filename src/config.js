import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const EXAMPLE_LOGIN = "you@example.com";

export function parseEnv(text) {
  const values = {};
  const lines = String(text).replace(/^\uFEFF/, "").split(/\r?\n/);
  for (const line of lines) {
    let body = line.trim();
    if (!body || body.startsWith("#")) continue;
    if (body.startsWith("export ")) body = body.slice("export ".length).trim();
    const eq = body.indexOf("=");
    if (eq <= 0) continue;
    const key = body.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = body.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export function applyEnv(values, env = process.env) {
  for (const [key, value] of Object.entries(values)) {
    if (env[key] === undefined || env[key] === "") env[key] = value;
  }
}

export function loadProjectEnv(projectRoot, env = process.env) {
  const file = join(projectRoot, ".env");
  if (!existsSync(file)) return;
  applyEnv(parseEnv(readFileSync(file, "utf8")), env);
}

export function readSettings(env = process.env) {
  const login = (env.OPERATOR_LOGIN ?? "").trim();
  const portText = (env.PORT ?? "").trim() || "3000";
  const port = Number(portText);
  if (!login || login === EXAMPLE_LOGIN) {
    throw new Error(
      "OPERATOR_LOGIN is not set. Copy .env.example to .env and set it to your Tailscale login, or run ./systemd/install.sh.",
    );
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer from 1 to 65535.");
  }
  return { operatorLogin: login, port };
}

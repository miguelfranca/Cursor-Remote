import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";

export function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, "utf8"));
}

export function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const next = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(file, next);
}

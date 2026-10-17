import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

/** @param {string|null|undefined} prior pre-edit text; null = file did not exist; undefined = read disk */
export function remember(changes, file, prior) {
  if (Object.hasOwn(changes, file)) return false;
  const content = prior !== undefined ? prior : currentText(file);
  changes[file] = { existed: content !== null, content, touchedAt: Date.now() };
  return true;
}

/** Fix a baseline that was snapshotted after the write (empty change) when we later learn the real prior. */
export function repairBaseline(changes, file, prior) {
  if (prior === undefined || !Object.hasOwn(changes, file)) return false;
  const baseline = changes[file];
  const disk = currentText(file);
  if (baseline.content !== disk) return false;
  if (prior === disk) return false;
  changes[file] = { ...baseline, existed: prior !== null, content: prior };
  return true;
}

export function restore(file, baseline) {
  if (!baseline.existed) {
    if (existsSync(file)) rmSync(file);
  } else {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, baseline.content);
  }
}

export function currentText(file) {
  if (!existsSync(file)) return null;
  return readFileSync(file, "utf8");
}

import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

const PROFILE_FLAG = "--user-data-dir";

export function profileOfStore(storeFile) {
  return resolve(storeFile, "..", "..", "..");
}

export function isDesktopIdeRunning(profileDirectory, {
  processRoot = "/proc",
  defaultProfile = join(homedir(), ".config", "Cursor"),
} = {}) {
  const wanted = resolve(profileDirectory);
  for (const entry of readdirSync(processRoot)) {
    if (!/^\d+$/.test(entry)) continue;
    const commandLine = readCommandLine(join(processRoot, entry, "cmdline"));
    if (!commandLine.length || basename(commandLine[0]) !== "cursor") continue;
    const profile = profileArgument(commandLine) ?? defaultProfile;
    if (profile && resolve(profile) === wanted) return true;
  }
  return false;
}

function readCommandLine(file) {
  try {
    return readFileSync(file, "utf8").split("\0").filter(Boolean);
  } catch {
    return [];
  }
}

function profileArgument(commandLine) {
  for (let index = 0; index < commandLine.length; index += 1) {
    const argument = commandLine[index];
    if (argument === PROFILE_FLAG) return commandLine[index + 1] ?? null;
    if (argument.startsWith(`${PROFILE_FLAG}=`)) return argument.slice(PROFILE_FLAG.length + 1);
  }
  return null;
}

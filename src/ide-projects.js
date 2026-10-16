import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readJson } from "./json-file.js";

export function ideProjectDirectories(storageFile) {
  let data;
  try {
    data = readJson(storageFile, {});
  } catch {
    return [];
  }
  const uris = [];
  const opened = data.profileAssociations?.workspaces;
  if (opened && typeof opened === "object") uris.push(...Object.keys(opened));
  for (const folder of data.backupWorkspaces?.folders ?? []) uris.push(folder?.folderUri);
  for (const window of data.windowsState?.openedWindows ?? []) uris.push(window?.folder);
  uris.push(data.windowsState?.lastActiveWindow?.folder);

  const directories = [];
  for (const uri of uris) {
    const directory = folderPath(uri);
    if (directory && !directories.includes(directory)) directories.push(directory);
  }
  return directories;
}

function folderPath(uri) {
  if (typeof uri !== "string" || !uri.startsWith("file://")) return null;
  let directory;
  try {
    directory = fileURLToPath(uri);
  } catch {
    return null;
  }
  if (!existsSync(directory)) return null;
  try {
    if (!statSync(directory).isDirectory()) return null;
  } catch {
    return null;
  }
  return directory;
}

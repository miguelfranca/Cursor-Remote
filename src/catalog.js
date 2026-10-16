import { realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";
import { readJson, writeJson } from "./json-file.js";

export function createCatalog(file) {
  function load() {
    const data = readJson(file, { directories: [] });
    return Array.isArray(data.directories) ? data.directories : [];
  }

  function save(directories) {
    writeJson(file, { directories });
  }

  function addDirectory(directory) {
    const directories = load();
    if (!directories.includes(directory)) {
      directories.push(directory);
      save(directories);
    }
    return directory;
  }

  return {
    list() {
      return load().map((directory) => ({
        path: directory,
        name: basename(directory),
      }));
    },
    has(directory) {
      return load().includes(directory);
    },
    add(input) {
      return addDirectory(normalizeDirectory(input));
    },
    remove(input) {
      const directory = resolve(input);
      save(load().filter((entry) => entry !== directory));
    },
    restore(directory) {
      addDirectory(directory);
    },
  };
}

export function normalizeDirectory(input) {
  if (!isAbsolute(input)) {
    throw new Error("A catalog directory must be an absolute path.");
  }
  const directory = realpathSync(resolve(input));
  if (!statSync(directory).isDirectory()) {
    throw new Error("A catalog entry must be a directory.");
  }
  return directory;
}

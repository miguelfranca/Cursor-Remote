import { fileURLToPath } from "node:url";
import { createCatalog } from "./catalog.js";
import { join, dirname } from "node:path";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const catalog = createCatalog(join(dataDir, "catalog.json"));
const [command, input] = process.argv.slice(2);

try {
  if (command === "add") console.log(catalog.add(input));
  else if (command === "remove") {
    catalog.remove(input);
    console.log(`removed ${input}`);
  } else if (command === "list" || !command) {
    for (const entry of catalog.list()) console.log(`${entry.name}\t${entry.path}`);
  } else {
    throw new Error("Use add, remove, or list.");
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

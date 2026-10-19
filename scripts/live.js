import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectEnv, readSettings } from "../src/config.js";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
loadProjectEnv(projectRoot);

const host = "127.0.0.1";
const { port } = readSettings();
const address = `http://${host}:${port}`;

let finished = false;
const request = http.get(address, { timeout: 2000 }, (response) => {
  response.resume();
  finish(true);
});

request.on("timeout", () => {
  request.destroy();
  finish(false);
});
request.on("error", () => finish(false));

function finish(live) {
  if (finished) return;
  finished = true;
  console.log(live ? `Live on ${address}` : `Not live on ${address}`);
  process.exit(live ? 0 : 1);
}

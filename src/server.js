import { readFileSync } from "node:fs";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectEnv, readSettings } from "./config.js";
import { createHub } from "./hub.js";
import { clientPage, page } from "./page.js";

const host = "127.0.0.1";
const root = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(root, "..");
loadProjectEnv(projectRoot);

let operatorLogin;
let port;
try {
  ({ operatorLogin, port } = readSettings());
} catch (error) {
  console.error(error instanceof Error ? error.message : "Configuration is invalid.");
  process.exit(1);
}
const hub = createHub({ dataDir: join(root, "..", "data") });
const webAppFiles = new Map([
  readWebAppFile("/manifest.webmanifest", "application/manifest+json", "manifest.webmanifest"),
  readWebAppFile("/icon-192.png", "image/png", "icon-192.png"),
  readWebAppFile("/icon-512.png", "image/png", "icon-512.png"),
]);

setInterval(() => hub.guardCatalog(), 1000);
setInterval(() => hub.syncDesktop(), 5000);

const server = http.createServer(async (request, response) => {
  const login = headerValue(request.headers["tailscale-user-login"]);
  if (login !== operatorLogin) {
    response.writeHead(403, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end(page("Refused", "<h1>Refused</h1><p>This Tailscale login cannot use the client.</p>"));
    return;
  }
  try {
    await route(request, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    sendJson(response, 400, { error: message });
  }
});

server.listen(port, host, () => {
  console.log(`Client listening on http://${host}:${port}`);
});

async function route(request, response) {
  const url = new URL(request.url, `http://${host}`);
  if (request.method === "GET" && url.pathname === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end(clientPage());
    return;
  }
  const webAppFile = webAppFiles.get(url.pathname);
  if (request.method === "GET" && webAppFile) {
    response.writeHead(200, {
      "content-type": webAppFile.contentType,
      "cache-control": "no-store",
    });
    response.end(webAppFile.body);
    return;
  }
  if (request.method === "GET" && url.pathname === "/events") {
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
    });
    const send = (snapshot) => response.write(`data: ${JSON.stringify(snapshot)}\n\n`);
    const unsubscribe = hub.subscribe(send);
    request.on("close", unsubscribe);
    return;
  }
  if (request.method !== "POST") {
    sendJson(response, 404, { error: "Not found." });
    return;
  }
  const body = await readBody(request);
  if (url.pathname === "/workspace") hub.selectWorkspace(body.path);
  else if (url.pathname === "/prompt") await hub.prompt(body.text ?? "", body.skills ?? [], body.files ?? []);
  else if (url.pathname === "/follow-up") await hub.followUp(body.text ?? "", body.skills ?? [], body.files ?? []);
  else if (url.pathname === "/send-now") await hub.sendNow(body.id);
  else if (url.pathname === "/queue") hub.editQueued(body.id, body.text ?? "");
  else if (url.pathname === "/queue-remove") hub.removeQueued(body.id);
  else if (url.pathname === "/stop") hub.stop();
  else if (url.pathname === "/permission") hub.answerPermission(body.decision);
  else if (url.pathname === "/question") hub.answerQuestion(body);
  else if (url.pathname === "/plan") hub.answerPlan(Boolean(body.accept));
  else if (url.pathname === "/mode") hub.setMode(body.mode);
  else if (url.pathname === "/model") await hub.setModel(body.value);
  else if (url.pathname === "/pin") hub.pin(body.name, Boolean(body.pinned));
  else if (url.pathname === "/session") await hub.openSession(body.id);
  else if (url.pathname === "/change") hub.change(body.path, body.action);
  else if (url.pathname === "/changes") hub.changeAll(body.action);
  else {
    sendJson(response, 404, { error: "Not found." });
    return;
  }
  sendJson(response, 200, hub.snapshot());
}

function readBody(request) {
  const limit = 28 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("That request is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error("The request body must be JSON."));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, value) {
  if (response.headersSent) return;
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
}

function readWebAppFile(pathname, contentType, filename) {
  return [pathname, { contentType, body: readFileSync(join(projectRoot, "public", filename)) }];
}

function headerValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

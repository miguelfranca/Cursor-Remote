import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { applyEnv, parseEnv, readSettings } from "../src/config.js";
import { identityFromStatus } from "../src/tailscale.js";
import { renderUnit, servicePath } from "../systemd/render.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("parseEnv keeps assignments and skips comments", () => {
  const values = parseEnv(`
# comment
export OPERATOR_LOGIN="ada@example.com"
PORT=3000
not a setting
`);
  assert.deepEqual(values, { OPERATOR_LOGIN: "ada@example.com", PORT: "3000" });
});

test("applyEnv fills blanks and leaves existing values", () => {
  const env = { PORT: "4000", OPERATOR_LOGIN: "" };
  applyEnv({ PORT: "3000", OPERATOR_LOGIN: "ada@example.com" }, env);
  assert.equal(env.PORT, "4000");
  assert.equal(env.OPERATOR_LOGIN, "ada@example.com");
});

test("readSettings requires a real operator login and a port", () => {
  assert.equal(readSettings({ OPERATOR_LOGIN: "ada@example.com" }).port, 3000);
  assert.throws(() => readSettings({ OPERATOR_LOGIN: "you@example.com" }));
  assert.throws(() => readSettings({ OPERATOR_LOGIN: "ada@example.com", PORT: "0" }));
});

test("identityFromStatus reads the tailnet login and bookmark", () => {
  const identity = identityFromStatus({
    Self: { UserID: 7, DNSName: "host.tailnet.ts.net." },
    User: { 7: { LoginName: "ada@example.com" } },
  });
  assert.equal(identity.login, "ada@example.com");
  assert.equal(identity.bookmark, "https://host.tailnet.ts.net/");
});

test("service template has no machine-specific paths or logins", () => {
  const template = readFileSync(join(root, "systemd", "cursor-remote.service"), "utf8");
  assert.equal(template.includes("/home/"), false);
  assert.equal(template.includes("@gmail"), false);
  assert.match(template, /@OPERATOR_LOGIN@/);
});

test("renderUnit fills the service template", () => {
  const template = readFileSync(join(root, "systemd", "cursor-remote.service"), "utf8");
  const unit = renderUnit(template, {
    root: "/srv/cursor remote",
    node: "/usr/bin/node",
    path: "/usr/bin",
    home: "/home/ada",
    port: 3000,
    login: "ada@example.com",
  });
  assert.match(unit, /WorkingDirectory=\/srv\/cursor remote/);
  assert.match(unit, /ExecStart="\/usr\/bin\/node" src\/server\.js/);
  assert.match(unit, /Environment="OPERATOR_LOGIN=ada@example.com"/);
  assert.equal(unit.includes("@ROOT@"), false);
});

test("servicePath puts node and the user bin ahead of the existing PATH", () => {
  const path = servicePath({ PATH: "/usr/bin:./:/bin" }, "/opt/node/bin/node", "/home/ada");
  assert.equal(path.split(":")[0], "/opt/node/bin");
  assert.equal(path.split(":")[1], "/home/ada/.local/bin");
  assert.equal(path.includes("./"), false);
});

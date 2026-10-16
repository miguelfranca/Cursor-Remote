import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { clientPage, page } from "../src/page.js";

const publicDirectory = new URL("../public/", import.meta.url);

test("client page links the installable manifest", () => {
  const html = clientPage();
  assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest\?v=2">/);
  assert.match(html, /<meta name="theme-color" content="#000000">/);
  assert.equal(page("Refused", "<p>No</p>").includes("manifest"), false);

  const manifest = JSON.parse(readFileSync(new URL("manifest.webmanifest", publicDirectory)));
  assert.equal(manifest.name, "Cursor");
  assert.equal(manifest.short_name, "Cursor");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.deepEqual(
    manifest.icons.map((icon) => icon.sizes),
    ["192x192", "512x512"],
  );
  assert.deepEqual(pngSize("icon-192.png"), { width: 192, height: 192 });
  assert.deepEqual(pngSize("icon-512.png"), { width: 512, height: 512 });
});

function pngSize(name) {
  const bytes = readFileSync(new URL(name, publicDirectory));
  assert.equal(bytes.toString("ascii", 1, 4), "PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

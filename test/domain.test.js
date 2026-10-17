import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { createCatalog } from "../src/catalog.js";
import { displayText, normalizeFiles, promptBlocks } from "../src/files.js";
import { ideProjectDirectories } from "../src/ide-projects.js";
import { accept, currentText, remember, repairBaseline, undo } from "../src/changes.js";
import { activityLabel, commandKey, isFileMutation, pathsFromTool, priorFromTool } from "../src/command-key.js";
import { diffParts, unifiedDiff } from "../src/diff.js";
import { renderMarkdown } from "../src/markdown.js";

test("catalog starts empty and only lists added directories", () => {
  const root = mkdtempSync(join(tmpdir(), "catalog-"));
  const project = join(root, "project");
  mkdirSync(project);
  const catalog = createCatalog(join(root, "catalog.json"));
  assert.deepEqual(catalog.list(), []);
  catalog.add(project);
  assert.equal(catalog.list()[0].path, project);
  assert.throws(() => catalog.add(join(root, "missing")));
  catalog.remove(project);
  assert.equal(catalog.has(project), false);
});

test("ide projects are the folders Cursor has opened", () => {
  const root = mkdtempSync(join(tmpdir(), "ide-"));
  const project = join(root, "Finance App");
  const missing = join(root, "gone");
  const file = join(root, "notes.txt");
  mkdirSync(project);
  writeFileSync(file, "x");
  const storage = join(root, "storage.json");
  writeFileSync(storage, JSON.stringify({
    profileAssociations: {
      workspaces: {
        [pathToFileURL(project).href]: "default",
        [pathToFileURL(missing).href]: "default",
        [pathToFileURL(file).href]: "default",
      },
    },
    backupWorkspaces: { folders: [{ folderUri: pathToFileURL(project).href }] },
    windowsState: { openedWindows: [{ folder: "vscode-remote://example/elsewhere" }] },
  }));
  assert.deepEqual(ideProjectDirectories(storage), [project]);
  assert.deepEqual(ideProjectDirectories(join(root, "missing.json")), []);
});

test("file attachments become image and resource prompt blocks", () => {
  const png = Buffer.from("89504e470d0a1a0a", "hex").toString("base64");
  const note = Buffer.from("hello notes", "utf8").toString("base64");
  const pdf = Buffer.from("%PDF-1.4", "utf8").toString("base64");
  const files = normalizeFiles([
    { name: "shot.png", mimeType: "image/png", data: png },
    { name: "notes.txt", mimeType: "text/plain", data: note },
    { name: "spec.pdf", mimeType: "application/pdf", data: pdf },
  ]);
  const blocks = promptBlocks("Look at these", files);
  assert.equal(blocks[0].type, "text");
  assert.equal(blocks[1].type, "image");
  assert.equal(blocks[2].type, "resource");
  assert.equal(blocks[2].resource.text, "hello notes");
  assert.equal(blocks[3].resource.blob, pdf);
  assert.equal(displayText("Look at these", files), "Look at these\n\nAttached: shot.png, notes.txt, spec.pdf");
  assert.throws(() => normalizeFiles([{ name: "bad.bin", data: "!!!!" }]));
});

test("undo restores an edit, a created file, and a deleted file", () => {
  const root = mkdtempSync(join(tmpdir(), "changes-"));
  const edited = join(root, "edited.txt");
  const created = join(root, "created.txt");
  const deleted = join(root, "deleted.txt");
  writeFileSync(edited, "mine");
  writeFileSync(deleted, "keep");
  const changes = {};
  remember(changes, edited);
  remember(changes, created);
  remember(changes, deleted);
  writeFileSync(edited, "agent");
  writeFileSync(created, "new");
  writeFileSync(deleted, "");
  rmSync(deleted);
  undo(changes, created);
  undo(changes, deleted);
  assert.equal(currentText(created), null);
  assert.equal(currentText(deleted), "keep");
  accept(changes, edited);
  assert.equal(currentText(edited), "agent");
  assert.deepEqual(changes, {});
});

test("allow for the session matches one exact command", () => {
  const first = commandKey({ kind: "execute", title: "test", rawInput: { command: "npm test" } });
  const again = commandKey({ kind: "execute", title: "test", rawInput: { command: "npm test" } });
  const other = commandKey({ kind: "execute", title: "push", rawInput: { command: "git push" } });
  const read = commandKey({ kind: "read", title: "Read", rawInput: { path: "a.js" } });
  assert.equal(first.key, again.key);
  assert.notEqual(first.key, other.key);
  assert.equal(read, null);
});

test("activity labels describe the current tool", () => {
  assert.equal(activityLabel({ kind: "read", rawInput: { path: "src/page.js" } }), "Reading page.js");
  assert.equal(activityLabel({ kind: "edit", title: "Edit", locations: [{ path: "hub.js" }] }), "Editing hub.js");
  assert.equal(activityLabel({ kind: "execute", rawInput: { command: "npm test" } }), "Running npm test");
  assert.equal(activityLabel({ kind: "think" }), "Thinking");
  assert.equal(activityLabel({ title: "Search codebase" }), "Search codebase");
});

test("assistant markdown becomes safe html", () => {
  const html = renderMarkdown([
    "# Title",
    "",
    "A **bold** list:",
    "",
    "- one",
    "- two",
    "",
    "```js",
    "const x = 1;",
    "```",
    "",
    "See [docs](https://example.com) and `<script>`.",
  ].join("\n"));
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(html, /<pre class="md-code" data-lang="js"><code>const x = 1;<\/code><\/pre>/);
  assert.match(html, /href="https:\/\/example.com"/);
  assert.match(html, /&lt;script&gt;/);
  assert.equal(html.includes("<script>"), false);
});

test("bold can span lines inside a paragraph", () => {
  const html = renderMarkdown("This is **bold\ntext** here");
  assert.match(html, /<strong>bold<br>text<\/strong>/);
  assert.equal(html.includes("**"), false);
});

test("large file diffs show changed hunks instead of a stub", () => {
  const before = Array.from({ length: 500 }, (_, index) => `line ${index}`).join("\n");
  const afterLines = Array.from({ length: 500 }, (_, index) => `line ${index}`);
  afterLines[200] = "line 200 edited";
  const diff = unifiedDiff(before, afterLines.join("\n"), "big.js");
  assert.match(diff, /line 200 edited/);
  assert.equal(diff.includes("too large"), false);
  assert.match(diff, /^@@ /m);
});

test("diff parts keep surrounding lines behind expandable gaps", () => {
  const before = Array.from({ length: 40 }, (_, index) => `line ${index}`).join("\n");
  const afterLines = Array.from({ length: 40 }, (_, index) => `line ${index}`);
  afterLines[20] = "line 20 edited";
  const parts = diffParts(before, afterLines.join("\n"));
  assert.equal(parts[0].type, "gap");
  assert.ok(parts[0].lines.length > 10);
  assert.equal(parts[1].type, "hunk");
  assert.ok(parts[1].lines.some((line) => line.includes("line 20 edited")));
  assert.equal(parts[2].type, "gap");
  assert.ok(parts[2].lines.length > 10);
});

test("only mutating tools become file changes", () => {
  assert.equal(isFileMutation({ kind: "read", rawInput: { path: "a.js" } }), false);
  assert.equal(isFileMutation({ kind: "edit", rawInput: { path: "a.js" } }), true);
  assert.equal(isFileMutation({
    content: [{ type: "diff", changes: [{ path: "a.js", operation: "modify" }] }],
  }), true);
  assert.deepEqual(
    pathsFromTool({ content: [{ type: "diff", changes: [{ path: "/tmp/a.js", operation: "modify" }] }] }),
    ["/tmp/a.js"],
  );
});

test("baseline prefers tool prior when disk already has the write", () => {
  const root = mkdtempSync(join(tmpdir(), "prior-"));
  const file = join(root, "parse_catalog.json");
  const before = '{\n  "patterns": ["for each eligible friend you refer"]\n}\n';
  const after = '{\n  "patterns": ["for each ... refer"]\n}\n';
  writeFileSync(file, after);
  const fromDiff = priorFromTool({
    kind: "edit",
    content: [{ type: "diff", path: file, oldText: before, newText: after }],
  }, file);
  assert.equal(fromDiff, before);
  const fromCursor = priorFromTool({
    kind: "edit",
    rawOutput: {
      providerOptions: {
        cursor: {
          highLevelToolCallResult: {
            output: { success: { path: file, beforeFullFileContent: before, afterFullFileContent: after } },
          },
        },
      },
    },
  }, file);
  assert.equal(fromCursor, before);
  const fromReplace = priorFromTool({
    kind: "edit",
    rawInput: {
      path: file,
      old_string: '["for each eligible friend you refer"]',
      new_string: '["for each ... refer"]',
    },
  }, file);
  assert.equal(fromReplace, before);
  const changes = {};
  remember(changes, file, fromDiff);
  assert.equal(changes[file].content, before);
  assert.ok(unifiedDiff(changes[file].content, currentText(file), file));
});

test("repairBaseline fixes a post-write snapshot when prior arrives later", () => {
  const root = mkdtempSync(join(tmpdir(), "repair-"));
  const file = join(root, "rules.json");
  const before = '{"a":1}';
  const after = '{"a":2}';
  writeFileSync(file, after);
  const changes = {};
  remember(changes, file);
  assert.equal(changes[file].content, after);
  assert.equal(unifiedDiff(changes[file].content, currentText(file), file), "");
  assert.equal(repairBaseline(changes, file, before), true);
  assert.equal(changes[file].content, before);
  assert.ok(unifiedDiff(changes[file].content, currentText(file), file));
});

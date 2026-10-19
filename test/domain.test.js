import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { createCatalog } from "../src/catalog.js";
import { displayText, normalizeFiles, promptBlocks } from "../src/files.js";
import { ideProjectDirectories } from "../src/ide-projects.js";
import { currentText, remember, repairBaseline, restore } from "../src/changes.js";
import { activityLabel, commandKey, isFileMutation, mutationAction, pathsFromTool, priorFromTool } from "../src/command-key.js";
import { changeParts, diffParts, unifiedDiff } from "../src/diff.js";
import { queueAfterRun } from "../src/hub.js";
import { renderMarkdown } from "../src/markdown.js";

test("a finished turn sends the next queued follow-up, and stop or an error does not", () => {
  assert.equal(queueAfterRun({ stopReason: "end_turn" }), "send-next");
  assert.equal(queueAfterRun({ stopReason: "end_turn", stopped: true }), "keep");
  assert.equal(queueAfterRun({ stopReason: "cancelled", stopped: true }), "keep");
  assert.equal(queueAfterRun({ failed: true }), "keep");
  assert.equal(queueAfterRun({ stopReason: "refusal" }), "keep");
  assert.equal(queueAfterRun({ stopReason: "max_tokens" }), "keep");
  assert.equal(queueAfterRun(null), "keep");
  assert.equal(queueAfterRun({ stopped: true, sendNowId: "one", stopReason: "cancelled" }), "send-now");
});

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

test("an empty file appearing or disappearing still counts as a change", () => {
  assert.deepEqual(changeParts({ existed: false, content: null }, ""), [{ type: "hunk", lines: ["@@ new empty file @@"] }]);
  assert.deepEqual(changeParts({ existed: true, content: "" }, null), [{ type: "hunk", lines: ["@@ deleted empty file @@"] }]);
  assert.deepEqual(changeParts({ existed: true, content: "" }, ""), []);
  assert.deepEqual(changeParts({ existed: false, content: null }, null), []);
  assert.equal(changeParts({ existed: false, content: null }, "text").length, 1);
});

test("restore brings back a created file and a deleted file", () => {
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
  restore(created, changes[created]);
  restore(deleted, changes[deleted]);
  assert.equal(currentText(created), null);
  assert.equal(currentText(deleted), "keep");
  assert.equal(currentText(edited), "agent");
  assert.equal(changes[edited].existed, true);
  assert.equal(changes[edited].content, "mine");
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

test("deleting a file created in the same chat is a delete", () => {
  const root = mkdtempSync(join(tmpdir(), "delete-label-"));
  const file = join(root, "sample2.txt");
  const named = { kind: "other", name: "delete_file", title: "Delete", rawInput: { path: file } };
  assert.equal(isFileMutation(named), true);
  assert.equal(mutationAction(named, { existed: false, content: null }), "delete");
  const cleared = {
    kind: "edit",
    content: [{ type: "diff", path: file, oldText: "-- /dev/null", newText: "" }],
  };
  assert.equal(mutationAction(cleared, { existed: false, content: null }), "delete");
  writeFileSync(file, "hello\n");
  const created = {
    kind: "edit",
    content: [{ type: "diff", path: file, oldText: "-- /dev/null", newText: "hello\n" }],
  };
  assert.equal(mutationAction(created, { existed: false, content: null }), "create");
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
  const newFileFromDiffString = priorFromTool({
    kind: "edit",
    content: [{ type: "diff", path: file, oldText: "-- /dev/null", newText: `++ b/file.json\n${after}` }],
  }, file);
  assert.equal(newFileFromDiffString, null);
  const excerptFromDiffString = priorFromTool({
    kind: "edit",
    content: [{ type: "diff", path: file, oldText: '-- a/file.json\n  "patterns": ["for each eligible friend you refer"]', newText: '++ b/file.json\n  "patterns": ["for each ... refer"]' }],
  }, file);
  assert.equal(excerptFromDiffString, undefined);
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

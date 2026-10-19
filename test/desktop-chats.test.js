import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { continuationPrompt, createDesktopChats } from "../src/desktop-chats/index.js";
import { pendingExchanges } from "../src/desktop-chats/exchanges.js";
import { isDesktopIdeRunning, profileOfStore } from "../src/desktop-chats/ide-running.js";
import { bytesField, fieldValues, readFields, varintField } from "../src/desktop-chats/protobuf.js";
import { desktopWorkspaceId, encodeState, putBlob } from "../src/desktop-chats/store.js";

const templateChatId = "aaaaaaaa-0000-0000-0000-000000000001";

function seededStore() {
  const root = mkdtempSync(join(tmpdir(), "desktop-chats-"));
  const workspace = join(root, "Cursor Remote");
  mkdirSync(workspace);
  const authFile = join(workspace, "auth.ts");
  writeFileSync(authFile, "new auth\n");
  const storeFile = join(root, "profile", "User", "globalStorage", "state.vscdb");
  mkdirSync(join(storeFile, ".."), { recursive: true });
  const database = new DatabaseSync(storeFile);
  database.exec(`
    create table cursorDiskKV (key text unique on conflict replace, value blob);
    create table composerHeaders (composerId text primary key, workspaceId text, createdAt integer, lastUpdatedAt integer,
      isArchived integer, isSubagent integer, recency integer, checkpointAt integer, value text, subagentTypeName text);
  `);
  const systemHash = putBlob(database, Buffer.from(JSON.stringify({ role: "system", content: "You are an agent." })));
  const state = Buffer.concat([bytesField(1, systemHash), varintField(10, 1)]);
  const record = {
    _v: 18,
    composerId: templateChatId,
    name: "Fix the login bug",
    lastUpdatedAt: 1000,
    conversationState: encodeState(state),
    fullConversationHeadersOnly: [
      { bubbleId: "user-1", type: 1 },
      { bubbleId: "thinking-1", type: 2, grouping: { capabilityType: 30 } },
      {
        bubbleId: "edit-1",
        type: 2,
        grouping: { capabilityType: 15, toolCallCase: "editToolCall", toolCallId: "tool-1", toolDisplayPath: authFile },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      { bubbleId: "reply-1", type: 2 },
      { bubbleId: "notice-1", type: 1, grouping: { isSimulatedMsg: true } },
      { bubbleId: "notice-reply-1", type: 2 },
    ],
  };
  const bubbles = {
    "user-1": { _v: 3, type: 1, bubbleId: "user-1", text: "Fix the login bug", context: { fileSelections: ["auth.ts"] } },
    "thinking-1": { _v: 3, type: 2, bubbleId: "thinking-1", text: "", capabilityType: 30 },
    "reply-1": { _v: 3, type: 2, bubbleId: "reply-1", text: "I will inspect auth.ts." },
    "notice-1": {
      _v: 3,
      type: 1,
      bubbleId: "notice-1",
      isSimulatedMsg: true,
      simulatedMsgReason: 3,
      text: "<system_notification>The following task has finished.</system_notification>",
    },
    "notice-reply-1": { _v: 3, type: 2, bubbleId: "notice-reply-1", text: "The server restarted." },
  };
  const insert = database.prepare("insert into cursorDiskKV(key, value) values (?, ?)");
  insert.run(`composerData:${templateChatId}`, JSON.stringify(record));
  for (const [bubbleId, bubble] of Object.entries(bubbles)) {
    insert.run(`bubbleId:${templateChatId}:${bubbleId}`, JSON.stringify(bubble));
  }
  insert.run(`inlineDiff:${desktopWorkspaceId(workspace)}:diff-1`, JSON.stringify({
    diffId: "diff-1",
    uri: { external: pathToFileURL(authFile).href, path: authFile, scheme: "file" },
    originalTextLines: ["old auth", ""],
    composerMetadata: { composerId: templateChatId, toolCallId: "tool-1" },
  }));
  database.prepare(
    "insert into composerHeaders values (?, ?, 1000, 1000, 0, 0, 1000, 1000, ?, '')",
  ).run(templateChatId, desktopWorkspaceId(workspace), JSON.stringify({ name: "Fix the login bug" }));
  database.close();
  const desktop = createDesktopChats({ storeFile, ideRunning: () => false });
  return { workspace, storeFile, desktop, authFile };
}

function readValue(storeFile, key) {
  const database = new DatabaseSync(storeFile, { readOnly: true });
  const value = database.prepare("select value from cursorDiskKV where key = ?").get(key)?.value;
  database.close();
  return value === undefined ? undefined : String(value);
}

function spoken(messages) {
  return messages.map((message) => message.text ?? `change ${message.path}`);
}

function phoneSession(overrides) {
  return {
    id: "session-1",
    title: "Phone chat",
    mode: "ask",
    configOptions: [{ category: "model", currentValue: "grok-4.7[fast=true]" }],
    transcript: [],
    changes: {},
    updatedAt: 5000,
    ...overrides,
  };
}

test("desktop chats are read from the IDE store without thinking, tool steps, or background task notices", () => {
  const { workspace, desktop, authFile } = seededStore();
  assert.deepEqual(desktop.list(workspace), [{ id: templateChatId, title: "Fix the login bug", updatedAt: 1000 }]);
  assert.deepEqual(desktop.read(templateChatId).messages, [
    { bubbleId: "user-1", role: "user", text: "Fix the login bug" },
    { bubbleId: "edit-1", role: "change", path: authFile, action: "edit" },
    { bubbleId: "reply-1", role: "assistant", text: "I will inspect auth.ts." },
  ]);
  const prompt = continuationPrompt(desktop.read(templateChatId).messages, "Do that next.");
  assert.match(prompt, /Fix the login bug/);
  assert.equal(prompt.includes(authFile), false);
  assert.match(prompt, /Do that next\.$/);
});

test("desktop pending edits show as changes, and the earliest baseline wins", () => {
  const { workspace, desktop, authFile } = seededStore();
  const [desktopChange] = desktop.changes({ directory: workspace, chatId: templateChatId });
  assert.equal(desktopChange.path, authFile);
  assert.equal(desktopChange.own, false);
  assert.deepEqual(desktopChange.baseline, { existed: true, content: "old auth\n" });

  const phoneBaseline = (touchedAt) => ({ [authFile]: { existed: true, content: "middle auth\n", touchedAt } });
  const phoneLater = desktop.changes({ directory: workspace, chatId: templateChatId, ownChanges: phoneBaseline(Date.parse("2026-02-01")) });
  assert.equal(phoneLater.length, 1);
  assert.equal(phoneLater[0].baseline.content, "old auth\n");
  assert.deepEqual(phoneLater[0].rowKeys, desktopChange.rowKeys);
  const phoneEarlier = desktop.changes({ directory: workspace, chatId: templateChatId, ownChanges: phoneBaseline(Date.parse("2025-12-01")) });
  assert.equal(phoneEarlier[0].baseline.content, "middle auth\n");
  const linkedLater = phoneBaseline(Date.parse("2026-02-01"));
  linkedLater[authFile].desktopDiffId = "diff-1";
  const linked = desktop.changes({ directory: workspace, chatId: templateChatId, ownChanges: linkedLater });
  assert.equal(linked[0].baseline.content, "old auth\n");
  assert.deepEqual(linked[0].rowKeys, desktopChange.rowKeys);

  assert.deepEqual(desktop.changes({ directory: workspace, chatId: templateChatId, rowsToRemove: desktopChange.rowKeys }), []);
  const answered = { directory: workspace, chatId: templateChatId, rowsToRemove: desktopChange.rowKeys };
  assert.deepEqual(desktop.status(answered), { state: "waiting", pending: "accepted" });
  writeFileSync(authFile, "old auth\n");
  assert.equal(desktop.status(answered), null);
  assert.equal(desktop.removeRows(desktopChange.rowKeys), true);
  assert.deepEqual(desktop.pendingRows(workspace), []);
});

test("a drifted desktop row is put back to the edit's original text", () => {
  const { workspace, storeFile, desktop, authFile } = seededStore();
  const beforeKey = "composer.content.before-auth";
  const database = new DatabaseSync(storeFile);
  const insert = database.prepare("insert or replace into cursorDiskKV(key, value) values (?, ?)");
  insert.run(beforeKey, "old auth\n");
  insert.run(`bubbleId:${templateChatId}:edit-1`, JSON.stringify({
    toolFormerData: { result: JSON.stringify({ beforeContentId: beforeKey }) },
  }));
  insert.run(`inlineDiff:${desktopWorkspaceId(workspace)}:diff-1`, JSON.stringify({
    diffId: "diff-1",
    uri: { external: pathToFileURL(authFile).href, path: authFile, scheme: "file" },
    originalTextLines: ["mutated"],
    composerMetadata: { composerId: templateChatId, toolCallId: "tool-1" },
  }));
  database.close();

  const seen = desktop.changes({
    directory: workspace,
    chatId: templateChatId,
    ownChanges: {
      [authFile]: {
        existed: true,
        content: "middle auth\n",
        touchedAt: Date.parse("2026-02-01"),
        desktopBubbleId: "phone-edit",
        desktopDiffId: "diff-1",
      },
    },
  });
  assert.equal(seen[0].baseline.content, "old auth\n");

  const session = phoneSession({
    ideChatId: templateChatId,
    desktopWritten: 1,
    changes: {
      [authFile]: {
        existed: true,
        content: "middle auth\n",
        touchedAt: Date.parse("2026-02-01"),
        desktopBubbleId: "phone-edit",
        desktopDiffId: "diff-1",
      },
    },
    transcript: [{ role: "user", text: "Already written" }],
  });
  assert.equal(desktop.write(workspace, session), true);
  const row = desktop.pendingRows(workspace).find((candidate) => candidate.diffId === "diff-1");
  assert.deepEqual(row.originalLines, ["old auth", ""]);
  const headers = JSON.parse(readValue(storeFile, `composerData:${templateChatId}`)).fullConversationHeadersOnly;
  assert.equal(headers.some((header) => header.bubbleId === "phone-edit"), false);

  const again = new DatabaseSync(storeFile);
  again.prepare("insert or replace into cursorDiskKV(key, value) values (?, ?)").run(
    `inlineDiff:${desktopWorkspaceId(workspace)}:diff-1`,
    JSON.stringify({
      diffId: "diff-1",
      uri: { external: pathToFileURL(authFile).href, path: authFile, scheme: "file" },
      originalTextLines: ["mutated"],
      composerMetadata: { composerId: templateChatId, toolCallId: "tool-1" },
    }),
  );
  again.close();
  session.changes = {};
  assert.equal(desktop.write(workspace, session), true);
  const repaired = desktop.pendingRows(workspace).find((candidate) => candidate.diffId === "diff-1");
  assert.deepEqual(repaired.originalLines, ["old auth", ""]);
});

test("a phone change is written into the desktop chat as an edit with a pending row", () => {
  const { workspace, storeFile, desktop } = seededStore();
  const page = join(workspace, "page.js");
  writeFileSync(page, "after\n");
  const session = phoneSession({
    ideChatId: templateChatId,
    changes: { [page]: { existed: true, content: "before\n", touchedAt: 6000 } },
    transcript: [
      { role: "user", text: "Edit the page" },
      { role: "change", path: page, action: "edit" },
      { role: "assistant", text: "Edited." },
    ],
  });

  assert.equal(desktop.write(workspace, session), true);
  const diffId = session.changes[page].desktopDiffId;
  const row = desktop.pendingRows(workspace).find((candidate) => candidate.diffId === diffId);
  assert.equal(row.chatId, templateChatId);
  assert.deepEqual(row.originalLines, ["before", ""]);
  const pageChange = desktop.changes({ directory: workspace, chatId: templateChatId, ownChanges: session.changes })
    .find((change) => change.path === page);
  assert.deepEqual(pageChange.rowKeys, [row.rowKey]);

  const record = JSON.parse(readValue(storeFile, `composerData:${templateChatId}`));
  const appended = record.fullConversationHeadersOnly.slice(-3);
  assert.deepEqual(appended.map((header) => header.type), [1, 2, 2]);
  assert.equal(appended[1].grouping.toolDisplayPath, page);
  assert.equal(appended[1].grouping.editLinesAdded, 1);
  const fileState = record.originalFileStates[pathToFileURL(page).href];
  assert.equal(readValue(storeFile, fileState.contentKey), "before\n");
  assert.equal(fileState.firstEditBubbleId, appended[1].bubbleId);

  assert.deepEqual(desktop.transcript(session).slice(3), session.transcript);
  assert.equal(desktop.write(workspace, session), false);
});

test("a phone session becomes a desktop chat once its exchanges finish", () => {
  const { workspace, storeFile, desktop } = seededStore();
  const session = phoneSession({
    transcript: [
      { role: "user", text: "Rename the button" },
      { role: "assistant", text: "Renaming it." },
      { role: "change", path: "/tmp/page.js", action: "edit" },
      { role: "assistant", text: "Done." },
      { role: "user", text: "Now the title" },
    ],
  });

  assert.equal(desktop.write(workspace, session, { lastIsRunning: true }), true);
  assert.ok(session.ideChatId);
  assert.equal(session.desktopWritten, 4);
  assert.deepEqual(desktop.status({ directory: workspace, session }), { state: "waiting", pending: "messages" });
  assert.deepEqual(desktop.list(workspace).map((chat) => chat.title), ["Phone chat", "Fix the login bug"]);
  assert.deepEqual(
    desktop.read(session.ideChatId).messages.map(({ role, text }) => ({ role, text })),
    [{ role: "user", text: "Rename the button" }, { role: "assistant", text: "Renaming it.\n\nDone." }],
  );
  assert.deepEqual(desktop.transcript(session), session.transcript);

  assert.equal(desktop.write(workspace, session), true);
  assert.equal(session.desktopWritten, 5);
  assert.equal(desktop.status({ directory: workspace, session }), null);
  assert.deepEqual(desktop.transcript(session), session.transcript);
  assert.equal(desktop.write(workspace, session), false);

  const database = new DatabaseSync(storeFile, { readOnly: true });
  const record = JSON.parse(database.prepare("select value from cursorDiskKV where key = ?").get(`composerData:${session.ideChatId}`).value);
  const userBubble = JSON.parse(database.prepare("select value from cursorDiskKV where key = ?")
    .get(`bubbleId:${session.ideChatId}:${record.fullConversationHeadersOnly[0].bubbleId}`).value);
  database.close();
  assert.equal(record.unifiedMode, "chat");
  assert.deepEqual(record.modelConfig, {
    modelName: "grok-4.7",
    maxMode: false,
    selectedModels: [{ modelId: "grok-4.7", parameters: [{ id: "fast", value: "true" }] }],
  });
  assert.deepEqual(userBubble.context, { fileSelections: [] });
});

test("a file created on the phone is written the way Cursor writes its own new files", () => {
  const { workspace, storeFile, desktop } = seededStore();
  const created = join(workspace, "new.txt");
  writeFileSync(created, "fresh\n");
  const session = phoneSession({
    ideChatId: templateChatId,
    changes: { [created]: { existed: false, content: null, touchedAt: 6000 } },
    transcript: [
      { role: "user", text: "Add new.txt" },
      { role: "change", path: created, action: "create" },
      { role: "assistant", text: "Added." },
    ],
  });

  assert.equal(desktop.write(workspace, session), true);
  const row = desktop.pendingRows(workspace).find((candidate) => candidate.path === created);
  assert.deepEqual(row.originalLines, []);
  const record = JSON.parse(readValue(storeFile, `composerData:${templateChatId}`));
  assert.equal(record.originalFileStates[pathToFileURL(created).href].isNewlyCreated, true);
  assert.deepEqual(record.newlyCreatedFiles[0].uri, {
    $mid: 1,
    external: pathToFileURL(created).href,
    path: created,
    scheme: "file",
  });
});

test("a phone deletion is written as a desktop delete message without a pending row", () => {
  const { workspace, storeFile, desktop } = seededStore();
  const gone = join(workspace, "gone.txt");
  const session = phoneSession({
    ideChatId: templateChatId,
    changes: { [gone]: { existed: true, content: "bye\n", touchedAt: 6000 } },
    transcript: [
      { role: "user", text: "Remove gone.txt" },
      { role: "change", path: gone, action: "delete" },
      { role: "assistant", text: "Removed." },
    ],
  });

  assert.equal(desktop.write(workspace, session), true);
  const { desktopBubbleId, desktopDiffId } = session.changes[gone];
  assert.ok(desktopBubbleId);
  assert.equal(desktopDiffId, undefined);
  assert.equal(desktop.pendingRows(workspace).some((row) => row.path === gone), false);
  const bubble = JSON.parse(readValue(storeFile, `bubbleId:${templateChatId}:${desktopBubbleId}`));
  assert.equal(bubble.toolFormerData.name, "delete_file");
  assert.equal(JSON.parse(bubble.toolFormerData.result).fileDeletedSuccessfully, true);
  const toolCall = readFields(Buffer.from(bubble.toolFormerData.toolCallBinary, "base64"));
  const deleteCall = readFields(fieldValues(toolCall, 3)[0]);
  const result = readFields(fieldValues(deleteCall, 2)[0]);
  const success = readFields(fieldValues(result, 1)[0]);
  assert.equal(fieldValues(success, 4)[0].toString("utf8"), "bye\n");
  const record = JSON.parse(readValue(storeFile, `composerData:${templateChatId}`));
  assert.equal(readValue(storeFile, record.originalFileStates[pathToFileURL(gone).href].contentKey), "bye\n");
  assert.deepEqual(
    desktop.read(templateChatId).messages.find((message) => message.path === gone),
    { bubbleId: desktopBubbleId, role: "change", path: gone, action: "delete" },
  );
  assert.equal(desktop.write(workspace, session), false);
});

test("a file edited and later deleted in a desktop chat gets a marker for each", () => {
  const { workspace, desktop, authFile } = seededStore();
  rmSync(authFile);
  const session = phoneSession({
    ideChatId: templateChatId,
    changes: { [authFile]: { existed: true, content: "new auth\n", touchedAt: Date.parse("2026-02-01") } },
    transcript: [
      { role: "user", text: "Remove auth.ts" },
      { role: "change", path: authFile, action: "delete" },
      { role: "assistant", text: "Removed." },
    ],
  });

  assert.equal(desktop.write(workspace, session), true);
  assert.deepEqual(
    desktop.read(templateChatId).messages.filter((message) => message.path === authFile).map((message) => message.action),
    ["edit", "delete"],
  );
});

test("a session that continued a desktop chat adds its lines after what the IDE saved", () => {
  const { workspace, storeFile, desktop, authFile } = seededStore();
  const session = phoneSession({
    ideChatId: templateChatId,
    transcript: [{ role: "user", text: "Also cover the refresh token" }, { role: "assistant", text: "Covered." }],
  });

  const expected = [
    "Fix the login bug",
    `change ${authFile}`,
    "I will inspect auth.ts.",
    "Also cover the refresh token",
    "Covered.",
  ];
  assert.deepEqual(spoken(desktop.transcript(session)), expected);
  assert.equal(desktop.write(workspace, session), true);
  assert.equal(session.ideChatId, templateChatId);
  assert.deepEqual(spoken(desktop.read(templateChatId).messages), expected);
  assert.deepEqual(spoken(desktop.transcript(session)), expected);
  const [userBubbleId] = Object.keys(session.desktopBubbles);
  const database = new DatabaseSync(storeFile, { readOnly: true });
  const userBubble = JSON.parse(database.prepare("select value from cursorDiskKV where key = ?")
    .get(`bubbleId:${templateChatId}:${userBubbleId}`).value);
  database.close();
  assert.equal(userBubble.isSimulatedMsg, undefined);
});

test("a desktop chat in an unknown format refuses the write and keeps the lines waiting", () => {
  const { workspace, storeFile, desktop } = seededStore();
  const database = new DatabaseSync(storeFile);
  const key = `composerData:${templateChatId}`;
  const record = JSON.parse(database.prepare("select value from cursorDiskKV where key = ?").get(key).value);
  database.prepare("update cursorDiskKV set value = ? where key = ?").run(JSON.stringify({ ...record, _v: 19 }), key);
  database.close();
  const session = phoneSession({
    ideChatId: templateChatId,
    transcript: [{ role: "user", text: "Hello" }, { role: "assistant", text: "Hi." }],
  });

  assert.equal(desktop.write(workspace, session), true);
  assert.equal(desktop.status({ directory: workspace, session }).state, "refused");
  assert.match(desktop.status({ directory: workspace, session }).reason, /version 19/);
  assert.equal(session.desktopWritten, undefined);
  assert.equal(desktop.write(workspace, session), false);
});

test("pending exchanges keep leading change markers and skip the running one", () => {
  const transcript = [
    { role: "user", text: "One" },
    { role: "assistant", text: "Reply" },
    { role: "change", path: "/a", action: "edit" },
    { role: "user", text: "Two" },
  ];
  assert.deepEqual(pendingExchanges(transcript, 2, false), [{
    userText: "Two",
    assistantText: "",
    userRange: [2, 4],
    assistantRange: [4, 4],
    end: 4,
  }]);
  assert.equal(pendingExchanges(transcript, 0, true).length, 1);
});

test("the desktop IDE counts as running only for the same profile", () => {
  const root = mkdtempSync(join(tmpdir(), "proc-"));
  const defaultProfile = join(root, "home", ".config", "Cursor");
  const otherProfile = join(root, "home", ".cursor-sync-test");
  const processes = {
    10: ["/usr/share/cursor/cursor", `--user-data-dir=${otherProfile}`],
    11: ["/home/me/.local/bin/agent", "acp"],
  };
  for (const [id, commandLine] of Object.entries(processes)) {
    mkdirSync(join(root, String(id)));
    writeFileSync(join(root, String(id), "cmdline"), `${commandLine.join("\0")}\0`);
  }
  const storeFile = join(defaultProfile, "User", "globalStorage", "state.vscdb");
  assert.equal(profileOfStore(storeFile), defaultProfile);
  assert.equal(isDesktopIdeRunning(defaultProfile, { processRoot: root, defaultProfile }), false);
  assert.equal(isDesktopIdeRunning(otherProfile, { processRoot: root, defaultProfile }), true);
  mkdirSync(join(root, "12"));
  writeFileSync(join(root, "12", "cmdline"), "/usr/share/cursor/cursor\0--no-sandbox\0");
  assert.equal(isDesktopIdeRunning(defaultProfile, { processRoot: root, defaultProfile }), true);
});

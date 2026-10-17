import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { continuationPrompt, createDesktopChats } from "../src/desktop-chats/index.js";
import { pendingExchanges } from "../src/desktop-chats/exchanges.js";
import { isDesktopIdeRunning, profileOfStore } from "../src/desktop-chats/ide-running.js";
import { bytesField, varintField } from "../src/desktop-chats/protobuf.js";
import { desktopWorkspaceId, encodeState, putBlob } from "../src/desktop-chats/store.js";

const templateChatId = "aaaaaaaa-0000-0000-0000-000000000001";

function seededStore() {
  const root = mkdtempSync(join(tmpdir(), "desktop-chats-"));
  const workspace = join(root, "Cursor Remote");
  mkdirSync(workspace);
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
  database.prepare(
    "insert into composerHeaders values (?, ?, 1000, 1000, 0, 0, 1000, 1000, ?, '')",
  ).run(templateChatId, desktopWorkspaceId(workspace), JSON.stringify({ name: "Fix the login bug" }));
  database.close();
  const desktop = createDesktopChats({ storeFile, ideRunning: () => false });
  return { workspace, storeFile, desktop };
}

function phoneSession(overrides) {
  return {
    id: "session-1",
    title: "Phone chat",
    mode: "ask",
    configOptions: [{ category: "model", currentValue: "grok-4.7[fast=true]" }],
    transcript: [],
    updatedAt: 5000,
    ...overrides,
  };
}

test("desktop chats are read from the IDE store without thinking, tool steps, or background task notices", () => {
  const { workspace, desktop } = seededStore();
  assert.deepEqual(desktop.list(workspace), [{ id: templateChatId, title: "Fix the login bug", updatedAt: 1000 }]);
  assert.deepEqual(
    desktop.read(templateChatId).messages.map(({ role, text }) => ({ role, text })),
    [{ role: "user", text: "Fix the login bug" }, { role: "assistant", text: "I will inspect auth.ts." }],
  );
  const prompt = continuationPrompt(desktop.read(templateChatId).messages, "Do that next.");
  assert.match(prompt, /Fix the login bug/);
  assert.match(prompt, /Do that next\.$/);
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

  assert.equal(desktop.write(workspace, session, true), true);
  assert.ok(session.ideChatId);
  assert.equal(session.desktopWritten, 4);
  assert.deepEqual(desktop.status(session), { state: "waiting" });
  assert.deepEqual(desktop.list(workspace).map((chat) => chat.title), ["Phone chat", "Fix the login bug"]);
  assert.deepEqual(
    desktop.read(session.ideChatId).messages.map(({ role, text }) => ({ role, text })),
    [{ role: "user", text: "Rename the button" }, { role: "assistant", text: "Renaming it.\n\nDone." }],
  );
  assert.deepEqual(desktop.transcript(session), session.transcript);

  assert.equal(desktop.write(workspace, session, false), true);
  assert.equal(session.desktopWritten, 5);
  assert.equal(desktop.status(session), null);
  assert.deepEqual(desktop.transcript(session), session.transcript);
  assert.equal(desktop.write(workspace, session, false), false);

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

test("a session that continued a desktop chat adds its lines after what the IDE saved", () => {
  const { workspace, storeFile, desktop } = seededStore();
  const session = phoneSession({
    ideChatId: templateChatId,
    transcript: [{ role: "user", text: "Also cover the refresh token" }, { role: "assistant", text: "Covered." }],
  });

  assert.deepEqual(desktop.transcript(session).map((message) => message.text), [
    "Fix the login bug",
    "I will inspect auth.ts.",
    "Also cover the refresh token",
    "Covered.",
  ]);
  assert.equal(desktop.write(workspace, session, false), true);
  assert.equal(session.ideChatId, templateChatId);
  assert.deepEqual(desktop.read(templateChatId).messages.map((message) => message.text), [
    "Fix the login bug",
    "I will inspect auth.ts.",
    "Also cover the refresh token",
    "Covered.",
  ]);
  assert.deepEqual(desktop.transcript(session).map((message) => message.text), [
    "Fix the login bug",
    "I will inspect auth.ts.",
    "Also cover the refresh token",
    "Covered.",
  ]);
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

  assert.equal(desktop.write(workspace, session, false), true);
  assert.equal(desktop.status(session).state, "refused");
  assert.match(desktop.status(session).reason, /version 19/);
  assert.equal(session.desktopWritten, undefined);
  assert.equal(desktop.write(workspace, session, false), false);
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

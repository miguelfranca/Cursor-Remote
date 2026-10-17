import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { readFields } from "./protobuf.js";

export const USER_BUBBLE = 1;
export const ASSISTANT_BUBBLE = 2;
const BACKGROUND_TASK_COMPLETION = 3;

export function openStore(storeFile, { readOnly }) {
  if (!existsSync(storeFile)) return null;
  return new DatabaseSync(storeFile, { readOnly, timeout: 5000 });
}

export function desktopWorkspaceId(directory) {
  const inode = statSync(directory, { bigint: true }).ino;
  return createHash("md5").update(`${directory}${inode}`).digest("hex");
}

export function listChatHeaders(database, directory) {
  let workspaceId;
  try {
    workspaceId = desktopWorkspaceId(directory);
  } catch {
    return [];
  }
  return database.prepare(
    `select composerId, lastUpdatedAt, value from composerHeaders
     where workspaceId = ? and isSubagent = 0 and isArchived = 0
     order by lastUpdatedAt desc`,
  ).all(workspaceId).flatMap((row) => {
    const header = parseJson(row.value);
    if (!header || header.isDraft) return [];
    return [{ id: row.composerId, title: header.name || "Untitled chat", updatedAt: Number(row.lastUpdatedAt) || 0 }];
  });
}

export function chatHeaderRow(database, chatId) {
  return database.prepare("select * from composerHeaders where composerId = ?").get(chatId) ?? null;
}

export function readValue(database, key) {
  return database.prepare("select value from cursorDiskKV where key = ?").get(key)?.value ?? null;
}

export function writeValue(database, key, value) {
  database.prepare("insert or replace into cursorDiskKV(key, value) values (?, ?)").run(key, value);
}

export function readRecord(database, chatId) {
  return parseJson(readValue(database, recordKey(chatId)));
}

export function recordKey(chatId) {
  return `composerData:${chatId}`;
}

export function bubbleKey(chatId, bubbleId) {
  return `bubbleId:${chatId}:${bubbleId}`;
}

export function readBubble(database, chatId, bubbleId) {
  return parseJson(readValue(database, bubbleKey(chatId, bubbleId)));
}

export function isAssistantText(bubble) {
  return bubble?.type === ASSISTANT_BUBBLE && Boolean(bubble.text) && !bubble.capabilityType;
}

export function isTypedUserMessage(bubble) {
  return bubble?.type === USER_BUBBLE && !bubble.isSimulatedMsg;
}

export function readChatMessages(database, chatId) {
  const record = readRecord(database, chatId);
  if (!Array.isArray(record?.fullConversationHeadersOnly)) return null;
  const wanted = record.fullConversationHeadersOnly.filter((header) =>
    header.type === USER_BUBBLE || (header.type === ASSISTANT_BUBBLE && !header.grouping?.capabilityType),
  );
  const bubbles = readBubbles(database, chatId, wanted.map((header) => header.bubbleId));
  const messages = [];
  let answeringBackgroundTask = false;
  for (const { bubbleId } of wanted) {
    const bubble = bubbles.get(bubbleId);
    if (bubble?.type === USER_BUBBLE) {
      answeringBackgroundTask = isBackgroundTaskCompletion(bubble);
      if (bubble.text && !answeringBackgroundTask) messages.push({ bubbleId, role: "user", text: bubble.text });
    } else if (isAssistantText(bubble) && !answeringBackgroundTask) {
      messages.push({ bubbleId, role: "assistant", text: bubble.text });
    }
  }
  return messages;
}

export function putBlob(database, bytes) {
  const payload = Buffer.from(bytes);
  const digest = createHash("sha256").update(payload).digest();
  writeValue(database, blobKey(digest), payload);
  return digest;
}

export function readBlob(database, digest) {
  const value = readValue(database, blobKey(digest));
  return value === null ? null : Buffer.from(value);
}

export function decodeState(text) {
  if (typeof text !== "string" || !text.startsWith("~")) throw new Error("The conversation state has an unknown format.");
  const bytes = Buffer.from(text.slice(1), "base64");
  return { bytes, fields: readFields(bytes) };
}

export function encodeState(bytes) {
  return `~${Buffer.from(bytes).toString("base64")}`;
}

export function parseJson(value) {
  if (value === null || value === undefined) return null;
  try {
    return JSON.parse(typeof value === "string" ? value : Buffer.from(value).toString("utf8"));
  } catch {
    return null;
  }
}

function isBackgroundTaskCompletion(bubble) {
  return bubble.isSimulatedMsg === true && bubble.simulatedMsgReason === BACKGROUND_TASK_COMPLETION;
}

function readBubbles(database, chatId, bubbleIds) {
  const bubbles = new Map();
  const batchSize = 500;
  for (let start = 0; start < bubbleIds.length; start += batchSize) {
    const batch = bubbleIds.slice(start, start + batchSize);
    const placeholders = batch.map(() => "?").join(",");
    const rows = database.prepare(`select key, value from cursorDiskKV where key in (${placeholders})`)
      .all(...batch.map((bubbleId) => bubbleKey(chatId, bubbleId)));
    for (const row of rows) bubbles.set(row.key.slice(bubbleKey(chatId, "").length), parseJson(row.value));
  }
  return bubbles;
}

function blobKey(digest) {
  return `agentKv:blob:${Buffer.from(digest).toString("hex")}`;
}

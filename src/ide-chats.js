import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const parsed = new Map();
const contextLimit = 100000;

export function listIdeChats(workspace, projectsRoot = join(homedir(), ".cursor", "projects")) {
  if (!workspace) return [];
  const directory = join(projectsRoot, projectSlug(workspace), "agent-transcripts");
  if (!existsSync(directory)) return [];
  const chats = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const chat = loadChat(join(directory, entry.name, `${entry.name}.jsonl`), entry.name);
    if (chat) chats.push(chat);
  }
  return chats.sort((left, right) => right.updatedAt - left.updatedAt);
}

export function continuationPrompt(messages, text) {
  if (!messages?.length) return text;
  const body = recentContext(messages);
  return `Continue this conversation from where it left off.\n\n${body}\n\nUser:\n${text}`;
}

export function projectSlug(workspace) {
  return workspace.replace(/^\//, "").replace(/[^A-Za-z0-9]/g, "-");
}

function recentContext(messages) {
  const parts = [];
  let size = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const chunk = `${message.role === "user" ? "User" : "Assistant"}:\n${message.text}`;
    const next = size === 0 ? chunk.length : size + 2 + chunk.length;
    if (size > 0 && next > contextLimit) break;
    parts.push(chunk);
    size = next;
  }
  return parts.reverse().join("\n\n");
}

function loadChat(file, id) {
  if (!existsSync(file)) return null;
  let stat;
  try {
    stat = statSync(file);
  } catch {
    return null;
  }
  const hit = parsed.get(file);
  if (hit?.mtimeMs === stat.mtimeMs) return hit.chat;
  const messages = [];
  let raw = "";
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return null;
  }
  let skipAssistant = false;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const role = entry.role;
    if (role !== "user" && role !== "assistant") continue;
    const rawText = partsText(entry.message);
    if (role === "user") {
      const text = visibleUserText(rawText);
      if (!text) {
        skipAssistant = isInternalOnlyUserMessage(rawText);
        continue;
      }
      skipAssistant = false;
      if (messages.length && messages[messages.length - 1].role === "user") {
        messages[messages.length - 1].text += `\n${text}`;
      } else {
        messages.push({ role, text });
      }
      continue;
    }
    if (skipAssistant) {
      skipAssistant = false;
      continue;
    }
    const text = rawText.trim();
    if (!text) continue;
    if (messages.length && messages[messages.length - 1].role === "assistant") {
      messages[messages.length - 1].text += `\n${text}`;
    } else {
      messages.push({ role, text });
    }
  }
  const chat = messages.length
    ? { id, title: titleFrom(messages), updatedAt: stat.mtimeMs, messages }
    : null;
  parsed.set(file, { mtimeMs: stat.mtimeMs, chat });
  return chat;
}

function partsText(message) {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n\n")
    .trim();
}

function visibleUserText(text) {
  const cleaned = stripEnvelope(text);
  const queries = [...cleaned.matchAll(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/g)]
    .map((match) => match[1].trim())
    .filter(Boolean)
    .filter((query) => !isInternalUserQuery(query));
  if (queries.length) return queries.join("\n\n");
  if (/<user_query>/.test(text)) return "";
  return cleaned
    .replace(/<manually_attached_skills>[\s\S]*?<\/manually_attached_skills>/g, "")
    .replace(/<agent_transcripts>[\s\S]*?<\/agent_transcripts>/g, "")
    .trim();
}

function isInternalOnlyUserMessage(text) {
  const cleaned = stripEnvelope(text);
  const queries = [...cleaned.matchAll(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  return queries.length > 0 && queries.every((query) => isInternalUserQuery(query));
}

function stripEnvelope(text) {
  return String(text)
    .replace(/<system_notification>[\s\S]*?<\/system_notification>/g, "")
    .replace(/<timestamp>[\s\S]*?<\/timestamp>/g, "");
}

function isInternalUserQuery(text) {
  const normalized = String(text).replace(/\s+/g, " ").trim();
  if (/^Briefly inform the user about the task result\b/i.test(normalized)) return true;
  if (/^The following task has finished\b/i.test(normalized)) return true;
  return false;
}

function titleFrom(messages) {
  const first = messages.find((message) => message.role === "user")?.text ?? "Chat";
  const line = first.replace(/\s+/g, " ").trim();
  return line.slice(0, 80) || "Chat";
}

import { currentText } from "../changes.js";
import { changeParts } from "../diff.js";
import { baselineLines, conversationChanges, rowBaseline } from "./changes.js";
import { TRAILING_CHANGE, exchangeIndexOf, hasUnwrittenMessages, linkedTranscript, pendingExchanges } from "./exchanges.js";
import { isDesktopIdeRunning, profileOfStore } from "./ide-running.js";
import {
  chatHeaderRow,
  deleteValues,
  desktopWorkspaceId,
  listChatHeaders,
  listPendingRows,
  openStore,
  parseJson,
  readChat,
} from "./store.js";
import { RefusedWrite, repairPendingBaselines, writeExchanges } from "./writer.js";

export { continuationPrompt } from "./continuation.js";

// Cursor adds and fills message bubbles without always moving the chat's lastUpdatedAt.
const CHAT_CACHE_MS = 3000;

export function createDesktopChats({
  storeFile,
  ideRunning = () => isDesktopIdeRunning(profileOfStore(storeFile)),
}) {
  const chatCache = new Map();
  let reader = null;

  function withReader(read, fallback) {
    try {
      reader ??= openStore(storeFile, { readOnly: true });
      return reader ? read(reader) : fallback;
    } catch {
      return fallback;
    }
  }

  function withWriter(work) {
    const database = openStore(storeFile, { readOnly: false });
    if (!database) throw new RefusedWrite("Cursor's chat store was not found.");
    try {
      return work(database);
    } finally {
      database.close();
    }
  }

  function list(directory) {
    if (!directory) return [];
    return withReader((database) => listChatHeaders(database, directory), []);
  }

  function read(chatId) {
    if (!chatId) return null;
    return withReader((database) => {
      const header = chatHeaderRow(database, chatId);
      if (!header) return null;
      const cached = chatCache.get(chatId);
      if (cached?.updatedAt === header.lastUpdatedAt && Date.now() - cached.readAt < CHAT_CACHE_MS) return cached.chat;
      const content = readChat(database, chatId);
      const chat = content && {
        id: chatId,
        title: parseJson(header.value)?.name || "Untitled chat",
        updatedAt: Number(header.lastUpdatedAt) || 0,
        ...content,
      };
      chatCache.set(chatId, { updatedAt: header.lastUpdatedAt, readAt: Date.now(), chat });
      return chat;
    }, null);
  }

  function pendingRows(directory) {
    return withReader((database) => listPendingRows(database, desktopWorkspaceId(directory)), null);
  }

  function rowsForChat(directory, chatId) {
    if (!chatId) return [];
    return (pendingRows(directory) ?? []).filter((row) => row.chatId === chatId);
  }

  function changes({ directory, chatId, ownChanges = {}, rowsToRemove = [] }) {
    return conversationChanges({ ownChanges, rows: rowsForChat(directory, chatId), chat: read(chatId), rowsToRemove });
  }

  function transcript(session) {
    const chat = read(session.ideChatId);
    return chat ? linkedTranscript(chat.messages, session) : session.transcript;
  }

  function status({ directory, session, chatId, rowsToRemove = [] }) {
    if (session?.desktopRefused) return { state: "refused", reason: session.desktopRefused };
    if (session && hasUnwrittenMessages(session.transcript, session.desktopWritten ?? 0)) return { state: "waiting", pending: "messages" };
    if (acceptedStillPendingInCursor(directory, chatId, rowsToRemove)) return { state: "waiting", pending: "accepted" };
    return null;
  }

  function acceptedStillPendingInCursor(directory, chatId, rowsToRemove) {
    if (!chatId || !rowsToRemove.length) return false;
    const queued = new Set(rowsToRemove);
    const chat = read(chatId);
    return rowsForChat(directory, chatId).some((row) =>
      queued.has(row.rowKey)
      && changeParts(rowBaseline(row, chat), currentText(row.path)).length > 0);
  }

  function unwrittenFileChanges(session, exchanges, open) {
    const writtenUpTo = session.desktopWritten ?? 0;
    return open
      .filter((change) => change.fromSession && !session.changes[change.path].desktopBubbleId)
      .flatMap((change) => {
        const content = currentText(change.path);
        if (!changeParts(change.baseline, content).length) return [];
        const markerIndex = session.transcript.findLastIndex((message) => message.role === "change" && message.path === change.path);
        const exchangeIndex = markerIndex < writtenUpTo ? TRAILING_CHANGE : exchangeIndexOf(exchanges, markerIndex);
        if (exchangeIndex === TRAILING_CHANGE && markerIndex >= writtenUpTo) return [];
        return [{ path: change.path, baseline: change.baseline, content, rowKey: change.rowKeys[0] ?? null, exchangeIndex }];
      });
  }

  function sameLines(left, right) {
    return left.length === right.length && left.every((line, index) => line === right[index]);
  }

  function baselineRepairs(directory, open, fileChanges) {
    const covered = new Set(fileChanges.map((change) => change.rowKey).filter(Boolean));
    const rows = new Map((pendingRows(directory) ?? []).map((row) => [row.rowKey, row]));
    const repairs = [];
    for (const change of open) {
      const lines = baselineLines(change.baseline);
      for (const rowKey of change.rowKeys) {
        if (covered.has(rowKey)) continue;
        const row = rows.get(rowKey);
        if (!row || sameLines(row.originalLines, lines)) continue;
        repairs.push({ rowKey, originalTextLines: lines });
      }
    }
    return repairs;
  }

  function write(directory, session, { lastIsRunning = false, rowsToRemove = [] } = {}) {
    const exchanges = pendingExchanges(session.transcript, session.desktopWritten ?? 0, lastIsRunning);
    const open = session.ideChatId
      ? changes({ directory, chatId: session.ideChatId, ownChanges: session.changes, rowsToRemove })
      : [];
    const fileChanges = unwrittenFileChanges(session, exchanges, open);
    const repairs = baselineRepairs(directory, open, fileChanges);
    if (!exchanges.length && !(session.ideChatId && fileChanges.length) && !repairs.length) return false;
    try {
      const written = withWriter((database) => {
        const result = exchanges.length || fileChanges.length
          ? writeExchanges(database, { chatId: session.ideChatId, directory, session, exchanges, fileChanges })
          : { chatId: session.ideChatId, bubbles: {}, fileChanges: {} };
        repairPendingBaselines(database, repairs);
        return result;
      });
      session.ideChatId = written.chatId;
      session.desktopBubbles = { ...session.desktopBubbles, ...written.bubbles };
      if (exchanges.length) session.desktopWritten = exchanges.at(-1).end;
      for (const [path, { bubbleId, diffId }] of Object.entries(written.fileChanges)) {
        const baseline = session.changes[path];
        if (!baseline) continue;
        baseline.desktopBubbleId = bubbleId;
        if (diffId) baseline.desktopDiffId = diffId;
      }
      session.desktopRefused = null;
      chatCache.delete(written.chatId);
      return true;
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      if (session.desktopRefused === reason) return false;
      session.desktopRefused = reason;
      return true;
    }
  }

  function removeRows(rowKeys) {
    if (!rowKeys.length) return true;
    try {
      withWriter((database) => deleteValues(database, rowKeys));
      return true;
    } catch {
      return false;
    }
  }

  return { list, read, changes, pendingRows, transcript, status, write, removeRows, ideRunning };
}

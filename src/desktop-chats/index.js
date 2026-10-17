import { currentText } from "../changes.js";
import { conversationChanges } from "./changes.js";
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
import { RefusedWrite, writeExchanges } from "./writer.js";

export { continuationPrompt } from "./continuation.js";

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
      if (cached?.updatedAt === header.lastUpdatedAt) return cached.chat;
      const content = readChat(database, chatId);
      const chat = content && {
        id: chatId,
        title: parseJson(header.value)?.name || "Untitled chat",
        updatedAt: Number(header.lastUpdatedAt) || 0,
        ...content,
      };
      chatCache.set(chatId, { updatedAt: header.lastUpdatedAt, chat });
      return chat;
    }, null);
  }

  function pendingRows(directory) {
    return withReader((database) => listPendingRows(database, desktopWorkspaceId(directory)), null);
  }

  function changes({ directory, chatId, ownChanges = {}, rowsToRemove = [] }) {
    const rows = chatId ? (pendingRows(directory) ?? []).filter((row) => row.chatId === chatId) : [];
    return conversationChanges({ ownChanges, rows, chat: read(chatId), rowsToRemove });
  }

  function transcript(session) {
    const chat = read(session.ideChatId);
    return chat ? linkedTranscript(chat.messages, session) : session.transcript;
  }

  function status(session) {
    if (session.desktopRefused) return { state: "refused", reason: session.desktopRefused };
    if (hasUnwrittenMessages(session.transcript, session.desktopWritten ?? 0)) return { state: "waiting" };
    return null;
  }

  function unwrittenFileChanges(directory, session, exchanges, rowsToRemove) {
    const writtenUpTo = session.desktopWritten ?? 0;
    return changes({ directory, chatId: session.ideChatId, ownChanges: session.changes, rowsToRemove })
      .filter((change) => change.own && !session.changes[change.path].desktopBubbleId)
      .flatMap((change) => {
        const content = currentText(change.path);
        const unchanged = content === null ? !change.baseline.existed : content === (change.baseline.content ?? "");
        if (unchanged) return [];
        const markerIndex = session.transcript.findIndex((message) => message.role === "change" && message.path === change.path);
        const exchangeIndex = markerIndex < writtenUpTo ? TRAILING_CHANGE : exchangeIndexOf(exchanges, markerIndex);
        if (exchangeIndex === TRAILING_CHANGE && markerIndex >= writtenUpTo) return [];
        return [{ path: change.path, baseline: change.baseline, content, rowKey: change.rowKeys[0] ?? null, exchangeIndex }];
      });
  }

  function write(directory, session, { lastIsRunning = false, rowsToRemove = [] } = {}) {
    const exchanges = pendingExchanges(session.transcript, session.desktopWritten ?? 0, lastIsRunning);
    const fileChanges = unwrittenFileChanges(directory, session, exchanges, rowsToRemove);
    if (!exchanges.length && !(session.ideChatId && fileChanges.length)) return false;
    try {
      const written = withWriter((database) =>
        writeExchanges(database, { chatId: session.ideChatId, directory, session, exchanges, fileChanges }));
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

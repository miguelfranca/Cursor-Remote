import { hasUnwrittenMessages, linkedTranscript, pendingExchanges } from "./exchanges.js";
import { isDesktopIdeRunning, profileOfStore } from "./ide-running.js";
import { chatHeaderRow, listChatHeaders, openStore, parseJson, readChatMessages } from "./store.js";
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
      const messages = readChatMessages(database, chatId);
      const chat = messages && {
        id: chatId,
        title: parseJson(header.value)?.name || "Untitled chat",
        updatedAt: Number(header.lastUpdatedAt) || 0,
        messages,
      };
      chatCache.set(chatId, { updatedAt: header.lastUpdatedAt, chat });
      return chat;
    }, null);
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

  function write(directory, session, lastIsRunning) {
    const exchanges = pendingExchanges(session.transcript, session.desktopWritten ?? 0, lastIsRunning);
    if (!exchanges.length) return false;
    let database = null;
    try {
      database = openStore(storeFile, { readOnly: false });
      if (!database) throw new RefusedWrite("Cursor's chat store was not found.");
      const written = writeExchanges(database, { chatId: session.ideChatId, directory, session, exchanges });
      session.ideChatId = written.chatId;
      session.desktopBubbles = { ...session.desktopBubbles, ...written.bubbles };
      session.desktopWritten = exchanges.at(-1).end;
      session.desktopRefused = null;
      chatCache.delete(written.chatId);
      return true;
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      if (session.desktopRefused === reason) return false;
      session.desktopRefused = reason;
      return true;
    } finally {
      database?.close();
    }
  }

  return { list, read, transcript, status, write, ideRunning };
}

export function pendingExchanges(transcript, writtenUpTo, lastIsRunning) {
  const exchanges = [];
  let current = null;
  for (let index = writtenUpTo; index < transcript.length; index += 1) {
    const message = transcript[index];
    if (message.role === "user") {
      if (current) exchanges.push(finish(current, index));
      current = { start: current ? index : writtenUpTo, userIndex: index, userText: message.text, replies: [] };
    } else if (message.role === "assistant" && current) {
      current.replies.push(message.text);
    }
  }
  if (current && !lastIsRunning) exchanges.push(finish(current, transcript.length));
  return exchanges;
}

export function hasUnwrittenMessages(transcript, writtenUpTo) {
  return transcript.slice(writtenUpTo).some((message) => message.role === "user" || message.role === "assistant");
}

export function linkedTranscript(chatMessages, session) {
  const ranges = session.desktopBubbles ?? {};
  const shown = chatMessages.flatMap((message) => {
    const range = ranges[message.bubbleId];
    if (range) return session.transcript.slice(range[0], range[1]);
    const { bubbleId, ...shownMessage } = message;
    return [shownMessage];
  });
  return [...shown, ...session.transcript.slice(session.desktopWritten ?? 0)];
}

export const TRAILING_CHANGE = -1;

export function exchangeIndexOf(exchanges, transcriptIndex) {
  return exchanges.findIndex((exchange) => transcriptIndex >= exchange.userRange[0] && transcriptIndex < exchange.end);
}

function finish(exchange, end) {
  return {
    userText: exchange.userText,
    assistantText: exchange.replies.map((text) => text.trim()).filter(Boolean).join("\n\n"),
    userRange: [exchange.start, exchange.userIndex + 1],
    assistantRange: [exchange.userIndex + 1, end],
    end,
  };
}

const contextLimit = 100000;

export function continuationPrompt(messages, text) {
  const spoken = (messages ?? []).filter((message) => message.role === "user" || message.role === "assistant");
  if (!spoken.length) return text;
  return `Continue this conversation from where it left off.\n\n${recentContext(spoken)}\n\nUser:\n${text}`;
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

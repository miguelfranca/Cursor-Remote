import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { lineCounts } from "../diff.js";
import { TRAILING_CHANGE } from "./exchanges.js";
import { bytesField, fieldValues, readFields, stringField, varintField } from "./protobuf.js";
import {
  ASSISTANT_BUBBLE,
  USER_BUBBLE,
  bubbleKey,
  chatHeaderRow,
  decodeState,
  desktopWorkspaceId,
  encodeState,
  isAssistantText,
  isTypedUserMessage,
  parseJson,
  pendingRowKey,
  putBlob,
  readBlob,
  readBubble,
  readRecord,
  readValue,
  recordKey,
  writeValue,
} from "./store.js";

const RECORD_VERSION = 18;
const TEMPLATE_CANDIDATES = 40;
const TOOL_CAPABILITY = 15;
const DESKTOP_MODES = {
  agent: { unifiedMode: "agent", number: 1 },
  ask: { unifiedMode: "chat", number: 2 },
  plan: { unifiedMode: "agent", number: 1 },
};
const STATE_FIELDS = {
  rootPrompt: 1,
  turn: 8,
  workspaceUri: 9,
  mode: 10,
  agentType: 22,
  startedAt: 26,
  timeZone: 27,
  recentUserMessage: 38,
};

export class RefusedWrite extends Error {}

export function writeExchanges(database, { chatId, directory, session, exchanges, fileChanges = [] }) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const written = chatId
      ? appendToChat(database, { chatId, directory, session, exchanges, fileChanges })
      : createChat(database, { directory, session, exchanges, fileChanges });
    if (exchanges.length) verifyLastExchange(database, written.chatId, exchanges.at(-1));
    database.exec("COMMIT");
    return written;
  } catch (cause) {
    database.exec("ROLLBACK");
    throw cause;
  }
}

function appendToChat(database, { chatId, directory, session, exchanges, fileChanges }) {
  const record = readRecord(database, chatId);
  const headerRow = chatHeaderRow(database, chatId);
  if (!record || !headerRow) throw new RefusedWrite("The desktop chat is no longer in Cursor.");
  const state = readableState(record);
  const sources = bubbleSources(database, chatId, record) ?? findTemplate(database, directory).sources;
  const time = Math.max(Number(record.lastUpdatedAt) || 0, session.updatedAt || Date.now());
  record.originalFileStates ??= {};
  const appended = buildExchanges(database, {
    chatId,
    workspaceId: workspaceIdOf(directory),
    exchanges,
    fileChanges,
    sources,
    session,
    time,
    fileStates: record.originalFileStates,
  });
  record.conversationState = encodeState(Buffer.concat([
    state.bytes,
    ...appended.rootPrompts,
    ...appended.turns,
    ...appended.recentUserMessages,
  ]));
  record.fullConversationHeadersOnly = [...record.fullConversationHeadersOnly, ...appended.headers];
  stampUpdated(record, time);
  record.status = "completed";
  writeValue(database, recordKey(chatId), JSON.stringify(record));
  const headerValue = parseJson(headerRow.value) ?? {};
  stampUpdated(headerValue, time);
  database.prepare(
    "update composerHeaders set lastUpdatedAt = ?, recency = ?, checkpointAt = ?, value = ? where composerId = ?",
  ).run(time, time, time, JSON.stringify(headerValue), chatId);
  return { chatId, bubbles: appended.ranges, fileChanges: appended.fileChanges };
}

function createChat(database, { directory, session, exchanges, fileChanges }) {
  const template = findTemplate(database, directory);
  const chatId = randomUUID();
  const workspaceId = workspaceIdOf(directory);
  const time = session.updatedAt || Date.now();
  const mode = desktopMode(session.mode);
  const fileStates = {};
  const appended = buildExchanges(database, {
    chatId,
    workspaceId,
    exchanges,
    fileChanges,
    sources: template.sources,
    session,
    time,
    fileStates,
  });
  const state = Buffer.concat([
    bytesField(STATE_FIELDS.rootPrompt, template.systemPrompt),
    ...appended.rootPrompts,
    ...appended.turns,
    stringField(STATE_FIELDS.workspaceUri, pathToFileURL(directory).href),
    varintField(STATE_FIELDS.mode, mode.number),
    stringField(STATE_FIELDS.agentType, "ide"),
    varintField(STATE_FIELDS.startedAt, time),
    stringField(STATE_FIELDS.timeZone, Intl.DateTimeFormat().resolvedOptions().timeZone),
    ...appended.recentUserMessages,
  ]);
  const details = {
    composerId: chatId,
    name: session.title || "New session",
    subtitle: "",
    createdAt: time,
    unifiedMode: mode.unifiedMode,
    forceMode: "edit",
    isAgentic: mode.unifiedMode === "agent",
    totalLinesAdded: 0,
    totalLinesRemoved: 0,
    filesChangedCount: 0,
    contextUsagePercent: 0,
    hasUnreadMessages: false,
    isDraft: false,
  };
  const record = {
    ...template.record,
    ...details,
    text: "",
    richText: "",
    status: "completed",
    fullConversationHeadersOnly: appended.headers,
    conversationMap: {},
    conversationState: encodeState(state),
    codeBlockData: {},
    originalFileStates: fileStates,
    newlyCreatedFiles: [],
    newlyCreatedFolders: [],
    generatingBubbleIds: [],
    todos: [],
    queueItems: [],
    modelConfig: desktopModelConfig(session),
  };
  stampUpdated(record, time);
  writeValue(database, recordKey(chatId), JSON.stringify(record));
  const headerValue = {
    ...template.headerValue,
    ...details,
    workspaceIdentifier: workspaceIdentifier(workspaceId, directory),
  };
  stampUpdated(headerValue, time);
  database.prepare(
    `insert into composerHeaders(composerId, workspaceId, createdAt, lastUpdatedAt, isArchived, isSubagent, recency, checkpointAt, value, subagentTypeName)
     values (?, ?, ?, ?, 0, 0, ?, ?, ?, '')`,
  ).run(chatId, workspaceId, time, time, time, time, JSON.stringify(headerValue));
  return { chatId, bubbles: appended.ranges, fileChanges: appended.fileChanges };
}

function buildExchanges(database, { chatId, workspaceId, exchanges, fileChanges, sources, session, time, fileStates }) {
  const built = { rootPrompts: [], turns: [], recentUserMessages: [], headers: [], ranges: {}, fileChanges: {} };
  const modeNumber = desktopMode(session.mode).number;
  const modelName = desktopModelConfig(session).modelName;
  const addFileChanges = (exchangeIndex) => {
    for (const change of fileChanges.filter((candidate) => candidate.exchangeIndex === exchangeIndex)) {
      const written = writeFileChange(database, { chatId, workspaceId, change, source: sources.assistant.bubble, time, fileStates });
      built.headers.push(written.header);
      built.ranges[written.header.bubbleId] = [0, 0];
      built.fileChanges[change.path] = { bubbleId: written.header.bubbleId, diffId: written.diffId };
    }
  };
  for (const [exchangeIndex, exchange] of exchanges.entries()) {
    const userBubbleId = randomUUID();
    const userMessage = Buffer.concat([
      stringField(1, exchange.userText),
      stringField(2, userBubbleId),
      varintField(4, modeNumber),
    ]);
    const turnParts = [bytesField(1, putBlob(database, userMessage))];
    built.rootPrompts.push(rootPrompt(database, "user", exchange.userText));
    const userBubble = cloneBubble(sources.user.bubble, { bubbleId: userBubbleId, text: exchange.userText, time });
    userBubble.richText = richText(exchange.userText);
    userBubble.requestId = randomUUID();
    userBubble.modelInfo = { modelName };
    userBubble.context = emptiedLists(userBubble.context);
    delete userBubble.checkpointId;
    writeBubble(database, chatId, userBubble);
    built.headers.push(cloneHeader(sources.user.header, userBubbleId, time));
    addFileChanges(exchangeIndex);
    if (exchange.assistantText) {
      const step = bytesField(1, stringField(1, exchange.assistantText));
      turnParts.push(bytesField(2, putBlob(database, step)));
      built.rootPrompts.push(rootPrompt(database, "assistant", exchange.assistantText));
      const assistantBubbleId = randomUUID();
      writeBubble(database, chatId, cloneBubble(sources.assistant.bubble, { bubbleId: assistantBubbleId, text: exchange.assistantText, time }));
      built.headers.push(cloneHeader(sources.assistant.header, assistantBubbleId, time));
      built.ranges[userBubbleId] = exchange.userRange;
      built.ranges[assistantBubbleId] = exchange.assistantRange;
    } else {
      built.ranges[userBubbleId] = [exchange.userRange[0], exchange.assistantRange[1]];
    }
    turnParts.push(stringField(10, userBubbleId));
    const turn = bytesField(1, Buffer.concat(turnParts));
    built.turns.push(bytesField(STATE_FIELDS.turn, putBlob(database, turn)));
    built.recentUserMessages.push(stringField(STATE_FIELDS.recentUserMessage, userBubbleId));
  }
  addFileChanges(TRAILING_CHANGE);
  return built;
}

function writeFileChange(database, { chatId, workspaceId, change, source, time, fileStates }) {
  const { path, baseline, content } = change;
  const before = baseline.content ?? "";
  const uri = pathToFileURL(path).href;
  const bubbleId = randomUUID();
  const toolCallId = `toolu_remote_${randomUUID().replaceAll("-", "")}`;
  const deleted = content === null;
  const tool = deleted ? deleteTool({ path, before, toolCallId }) : editTool(database, { path, before, content });
  const bubble = cloneBubble(source, { bubbleId, text: "", time });
  bubble.capabilityType = TOOL_CAPABILITY;
  bubble.toolFormerData = {
    tool: tool.number,
    toolIndex: 0,
    modelCallId: "",
    toolCallId,
    status: "completed",
    name: tool.name,
    ...tool.details,
    additionalData: {},
    toolCallBinary: Buffer.concat([
      tool.binary,
      stringField(57, toolCallId),
      varintField(59, time),
      varintField(60, time),
    ]).toString("base64"),
  };
  writeBubble(database, chatId, bubble);
  if (!fileStates[uri]) {
    const contentKey = `ofsContent:${chatId}:${uri}`;
    writeValue(database, contentKey, before);
    fileStates[uri] = { firstEditBubbleId: bubbleId, isNewlyCreated: !baseline.existed, newlyCreatedFolders: [], contentKey };
  }
  const diffId = deleted
    ? null
    : writePendingRow(database, { workspaceId, chatId, path, uri, before, toolCallId, rowKey: change.rowKey });
  const header = {
    bubbleId,
    type: ASSISTANT_BUBBLE,
    grouping: {
      isRenderable: true,
      capabilityType: TOOL_CAPABILITY,
      toolFormerTool: tool.number,
      toolFormerStatus: "completed",
      toolCallId,
      toolCallCase: tool.toolCallCase,
      toolDisplayPath: path,
      ...tool.grouping,
      toolDisplayComputed: true,
    },
    ...timestamps(time),
  };
  return { header, diffId };
}

function editTool(database, { path, before, content }) {
  const { added, removed } = lineCounts(before, content);
  return {
    number: 38,
    name: "edit_file_v2",
    toolCallCase: "editToolCall",
    details: {
      params: JSON.stringify({ relativeWorkspacePath: path, noCodeblock: true, cloudAgentEdit: false }),
      result: JSON.stringify({ beforeContentId: putContent(database, before), afterContentId: putContent(database, content) }),
    },
    grouping: { editLinesAdded: added, editLinesRemoved: removed },
    binary: bytesField(12, Buffer.concat([
      bytesField(1, stringField(1, path)),
      bytesField(2, bytesField(1, Buffer.concat([
        stringField(1, path),
        varintField(3, added),
        varintField(4, removed),
        stringField(8, `The file ${path} has been updated.`),
      ]))),
    ])),
  };
}

function deleteTool({ path, before, toolCallId }) {
  return {
    number: 11,
    name: "delete_file",
    toolCallCase: "deleteToolCall",
    details: {
      params: JSON.stringify({ relativeWorkspacePath: path }),
      result: "{}",
      userDecision: "accepted",
    },
    grouping: {},
    binary: bytesField(3, Buffer.concat([
      bytesField(1, Buffer.concat([stringField(1, path), stringField(2, toolCallId)])),
      bytesField(2, bytesField(1, Buffer.concat([
        stringField(1, path),
        stringField(2, path),
        varintField(3, Buffer.byteLength(before)),
        stringField(4, before),
      ]))),
    ])),
  };
}

function writePendingRow(database, { workspaceId, chatId, path, uri, before, toolCallId, rowKey }) {
  const originalTextLines = before.split("\n");
  const existing = rowKey && parseJson(readValue(database, rowKey));
  if (existing?.diffId) {
    writeValue(database, rowKey, JSON.stringify({ ...existing, originalTextLines }));
    return existing.diffId;
  }
  const diffId = randomUUID();
  writeValue(database, pendingRowKey(workspaceId, diffId), JSON.stringify({
    diffId,
    uri: { $mid: 1, fsPath: path, external: uri, path, scheme: "file" },
    originalTextLines,
    generationUUID: randomUUID(),
    composerMetadata: { composerId: chatId, codeblockId: toolCallId, toolCallId, composerGenerationID: randomUUID() },
    hideDecorations: false,
  }));
  return diffId;
}

function putContent(database, text) {
  const digest = putBlob(database, Buffer.from(text, "utf8"));
  const key = `composer.content.${digest.toString("hex")}`;
  writeValue(database, key, text);
  return key;
}

function workspaceIdOf(directory) {
  try {
    return desktopWorkspaceId(directory);
  } catch {
    throw new RefusedWrite("The workspace folder no longer exists.");
  }
}

function readableState(record) {
  if (record._v !== RECORD_VERSION) throw new RefusedWrite(`The desktop chat has record version ${record._v}, expected ${RECORD_VERSION}.`);
  if (!Array.isArray(record.fullConversationHeadersOnly)) throw new RefusedWrite("The desktop chat has no message list in the tested format.");
  try {
    return decodeState(record.conversationState);
  } catch (cause) {
    throw new RefusedWrite(`The desktop chat state could not be read: ${cause.message}`);
  }
}

function bubbleSources(database, chatId, record) {
  const headers = [...record.fullConversationHeadersOnly].reverse();
  const user = latestBubble(database, chatId, headers, (header) =>
    header.type === USER_BUBBLE && !header.grouping?.isSimulatedMsg, isTypedUserMessage);
  const assistant = user && latestBubble(database, chatId, headers, (header) =>
    header.type === ASSISTANT_BUBBLE && !header.grouping?.capabilityType, isAssistantText);
  return assistant ? { user, assistant } : null;
}

function latestBubble(database, chatId, headers, headerMatches, bubbleMatches) {
  for (const header of headers) {
    if (!headerMatches(header)) continue;
    const bubble = readBubble(database, chatId, header.bubbleId);
    if (bubbleMatches(bubble)) return { header, bubble };
  }
  return null;
}

function findTemplate(database, directory) {
  const workspaceId = workspaceIdOf(directory);
  const candidates = database.prepare(
    `select composerId, value from composerHeaders where isSubagent = 0
     order by workspaceId = ? desc, lastUpdatedAt desc limit ?`,
  ).all(workspaceId, TEMPLATE_CANDIDATES);
  for (const candidate of candidates) {
    const record = readRecord(database, candidate.composerId);
    if (record?._v !== RECORD_VERSION || !Array.isArray(record.fullConversationHeadersOnly)) continue;
    const systemPrompt = systemPromptOf(database, record);
    const sources = systemPrompt && bubbleSources(database, candidate.composerId, record);
    if (sources) return { record, headerValue: parseJson(candidate.value) ?? {}, systemPrompt, sources };
  }
  throw new RefusedWrite("No desktop chat in the tested format was found to copy from.");
}

function systemPromptOf(database, record) {
  try {
    const [first] = fieldValues(decodeState(record.conversationState).fields, STATE_FIELDS.rootPrompt);
    if (!first) return null;
    return parseJson(readBlob(database, first))?.role === "system" ? first : null;
  } catch {
    return null;
  }
}

function verifyLastExchange(database, chatId, exchange) {
  const record = readRecord(database, chatId);
  const turns = fieldValues(decodeState(record.conversationState).fields, STATE_FIELDS.turn);
  const turn = readBlob(database, turns.at(-1));
  const [agentTurn] = fieldValues(readFields(turn), 1);
  const agentFields = readFields(agentTurn);
  const [userHash] = fieldValues(agentFields, 1);
  const [userText] = fieldValues(readFields(readBlob(database, userHash)), 1);
  if (userText.toString("utf8") !== exchange.userText) throw new Error("The written desktop chat did not read back correctly.");
  if (!exchange.assistantText) return;
  const [stepHash] = fieldValues(agentFields, 2);
  const [assistantMessage] = fieldValues(readFields(readBlob(database, stepHash)), 1);
  const [assistantText] = fieldValues(readFields(assistantMessage), 1);
  if (assistantText.toString("utf8") !== exchange.assistantText) throw new Error("The written desktop chat did not read back correctly.");
}

function rootPrompt(database, role, content) {
  const hash = putBlob(database, Buffer.from(JSON.stringify({ role, content }), "utf8"));
  return bytesField(STATE_FIELDS.rootPrompt, hash);
}

function cloneBubble(source, { bubbleId, text, time }) {
  return { ...structuredClone(source), bubbleId, text, ...timestamps(time), conversationState: "~" };
}

function cloneHeader(source, bubbleId, time) {
  return { ...source, bubbleId, ...timestamps(time) };
}

function timestamps(time) {
  return { createdAt: new Date(time).toISOString(), startedAtMs: time, completedAtMs: time };
}

function emptiedLists(context) {
  if (!context || typeof context !== "object") return context;
  return Object.fromEntries(Object.entries(context).map(([key, value]) => [key, Array.isArray(value) ? [] : value]));
}

function writeBubble(database, chatId, bubble) {
  writeValue(database, bubbleKey(chatId, bubble.bubbleId), JSON.stringify(bubble));
}

function stampUpdated(target, time) {
  target.lastUpdatedAt = time;
  target.conversationCheckpointLastUpdatedAt = time;
}

function desktopMode(mode) {
  return DESKTOP_MODES[mode] ?? DESKTOP_MODES.agent;
}

function desktopModelConfig(session) {
  const option = (session.configOptions || []).find((item) => item.category === "model");
  const match = /^([^[]+)(?:\[(.*)\])?$/.exec(String(option?.currentValue ?? "default[]"));
  const modelId = match?.[1] || "default";
  const parameters = (match?.[2] || "").split(",").filter(Boolean).map((pair) => {
    const [id, ...rest] = pair.split("=");
    return { id, value: rest.join("=") };
  });
  return { modelName: modelId, maxMode: false, selectedModels: [{ modelId, parameters }] };
}

function workspaceIdentifier(id, directory) {
  return {
    id,
    uri: { $mid: 1, fsPath: directory, external: pathToFileURL(directory).href, path: directory, scheme: "file" },
  };
}

function richText(text) {
  const paragraphs = text.split("\n").map((line) => ({
    children: line ? [{ detail: 0, format: 0, mode: "normal", style: "", text: line, type: "text", version: 1 }] : [],
    direction: "ltr",
    format: "",
    indent: 0,
    type: "paragraph",
    version: 1,
  }));
  return JSON.stringify({
    root: { children: paragraphs, direction: "ltr", format: "", indent: 0, type: "root", version: 1 },
  });
}

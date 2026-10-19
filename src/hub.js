import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { homedir } from "node:os";
import { join } from "node:path";
import * as acp from "@agentclientprotocol/sdk";
import { readJson, writeJson } from "./json-file.js";
import { createCatalog } from "./catalog.js";
import { continuationPrompt, createDesktopChats } from "./desktop-chats/index.js";
import { ideProjectDirectories } from "./ide-projects.js";
import { currentText, remember, repairBaseline, restore } from "./changes.js";
import { activityLabel, commandKey, isDeletion, isFileMutation, mutationAction, pathsFromTool, priorFromTool } from "./command-key.js";
import { changeParts } from "./diff.js";
import { displayText, normalizeFiles, promptBlocks } from "./files.js";
import { composePrompt, listSkills, skillBodies } from "./skills.js";

const MODES = ["agent", "plan", "ask"];

export function createHub({ dataDir, agentBin, ideStorage }) {
  const catalog = createCatalog(join(dataDir, "catalog.json"));
  const storageFile = ideStorage ?? join(homedir(), ".config/Cursor/User/globalStorage/storage.json");
  const desktop = createDesktopChats({ storeFile: join(homedir(), ".config/Cursor/User/globalStorage/state.vscdb") });
  const stateFile = join(dataDir, "state.json");
  const state = readJson(stateFile, { activeWorkspace: null, workspaces: {} });
  const listeners = new Set();
  let error = "";
  let connection = null;
  let agentProcess = null;
  let starting = null;
  const runs = new Map();
  const waits = new Map();
  let saveTimer = null;
  let lastPublished = "";
  const liveSessions = new Set();

  save();

  function publish({ onlyIfChanged = false } = {}) {
    if (onlyIfChanged && !listeners.size) return;
    const snapshot = view();
    const serialized = JSON.stringify(snapshot);
    if (onlyIfChanged && serialized === lastPublished) return;
    lastPublished = serialized;
    for (const listener of listeners) listener(snapshot);
  }

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => writeJson(stateFile, state), 150);
  }

  function saveNow() {
    clearTimeout(saveTimer);
    writeJson(stateFile, state);
  }

  function workspaceRecord(directory) {
    state.workspaces[directory] ??= {
      activeSessionId: null,
      preferredMode: "agent",
      sessions: {},
    };
    return state.workspaces[directory];
  }

  function activeWorkspace() {
    return state.activeWorkspace ? workspaceRecord(state.activeWorkspace) : null;
  }

  function activeSession() {
    const workspace = activeWorkspace();
    if (!workspace?.activeSessionId) return null;
    return workspace.sessions[workspace.activeSessionId] ?? null;
  }

  function requireSessionIdle(session) {
    if (session && runs.has(session.id)) throw new Error("A run is in progress.");
  }

  function sessionStatus(id) {
    if (waits.has(id)) return "waiting";
    if (runs.has(id)) return "running";
    return "idle";
  }

  function workspaceStatus(directory) {
    const workspace = state.workspaces[directory];
    if (!workspace) return "idle";
    const statuses = Object.keys(workspace.sessions).map(sessionStatus);
    if (statuses.includes("waiting")) return "waiting";
    if (statuses.includes("running")) return "running";
    return "idle";
  }

  function workspaceBusy(directory) {
    return workspaceStatus(directory) !== "idle";
  }

  function sessionDirectory(session) {
    if (!session) return null;
    for (const [directory, workspace] of Object.entries(state.workspaces)) {
      if (workspace.sessions[session.id]) return directory;
    }
    return null;
  }

  function sessionForRequest(params) {
    const named = params?.sessionId ? findSession(params.sessionId) : null;
    if (named) return named;
    const ids = [...runs.keys()];
    if (ids.length === 1) return findSession(ids[0]);
    const open = activeSession();
    const background = ids.filter((id) => id !== open?.id);
    const target = background.at(-1) || ids.at(-1);
    return target ? findSession(target) : null;
  }

  function guardCatalog() {
    let added = false;
    for (const directory of ideProjectDirectories(storageFile)) {
      if (catalog.has(directory)) continue;
      try {
        catalog.add(directory);
        added = true;
      } catch {
        // The IDE listed a folder that is no longer a directory.
      }
    }
    if (added) publish();
    let restored = false;
    for (const directory of Object.keys(state.workspaces)) {
      if (!workspaceBusy(directory) || catalog.has(directory)) continue;
      catalog.restore(directory);
      restored = true;
      error = "That workspace has a run in progress.";
    }
    if (state.activeWorkspace && !catalog.has(state.activeWorkspace)) {
      state.activeWorkspace = null;
      restored = true;
    }
    if (!restored) return;
    saveNow();
    publish();
  }

  function syncDesktop() {
    let changed = followDesktopAnswers();
    if (!desktop.ideRunning()) changed = writeDesktopChats() || changed;
    if (changed) saveNow();
    publish({ onlyIfChanged: true });
  }

  function followDesktopAnswers() {
    let changed = false;
    for (const [directory, workspace] of Object.entries(state.workspaces)) {
      const rows = desktop.pendingRows(directory);
      if (!rows) continue;
      const pendingDiffIds = new Set(rows.map((row) => row.diffId));
      for (const session of Object.values(workspace.sessions)) {
        for (const [file, baseline] of Object.entries(session.changes)) {
          if (!baseline.desktopDiffId || pendingDiffIds.has(baseline.desktopDiffId)) continue;
          delete session.changes[file];
          changed = true;
        }
      }
    }
    return changed;
  }

  function writeDesktopChats() {
    const rowsToRemove = state.desktopRowsToRemove ?? [];
    let changed = false;
    for (const [directory, workspace] of Object.entries(state.workspaces)) {
      for (const session of Object.values(workspace.sessions)) {
        if (desktop.write(directory, session, { lastIsRunning: runs.has(session.id), rowsToRemove })) changed = true;
      }
    }
    if (rowsToRemove.length && desktop.removeRows(rowsToRemove)) {
      state.desktopRowsToRemove = [];
      changed = true;
    }
    return changed;
  }

  function openConversation() {
    const directory = state.activeWorkspace;
    const workspace = directory ? state.workspaces[directory] : null;
    if (!workspace) return {};
    const open = shown(workspace, directory);
    return { directory, workspace, ...open, chatId: open.session ? open.session.ideChatId : open.chat?.id ?? null };
  }

  function openChanges({ directory, session, chat, chatId }) {
    if (!session && !chat) return [];
    return desktop.changes({ directory, chatId, ownChanges: session?.changes, rowsToRemove: state.desktopRowsToRemove });
  }

  function queueRowKeys(rowKeys) {
    if (!rowKeys.length) return;
    state.desktopRowsToRemove = [...new Set([...(state.desktopRowsToRemove ?? []), ...rowKeys])];
  }

  function answerChange(session, change, action) {
    if (action === "undo") restore(change.path, change.baseline);
    if (session) delete session.changes[change.path];
    queueRowKeys(change.rowKeys);
  }

  guardCatalog();

  return {
    snapshot: view,
    subscribe(listener) {
      listeners.add(listener);
      listener(view());
      return () => listeners.delete(listener);
    },
    guardCatalog,
    syncDesktop,
    selectWorkspace(directory) {
      if (!catalog.has(directory)) throw new Error("That directory is not in the catalog.");
      state.activeWorkspace = directory;
      workspaceRecord(directory);
      error = "";
      saveNow();
      publish();
    },
    async prompt(text, skillNames, files) {
      await send(text, skillNames, true, null, files);
    },
    async followUp(text, skillNames, files) {
      const workspace = activeWorkspace();
      if (!workspace) throw new Error("Choose a workspace first.");
      const open = shown(workspace, state.activeWorkspace);
      if (open.chat) {
        await send(text, skillNames, true, open.chat, files);
        return;
      }
      if (!open.session) throw new Error("Send a message to start a chat.");
      workspace.activeSessionId = open.session.id;
      await send(text, skillNames, false, null, files);
    },
    stop() {
      const session = activeSession();
      if (!session || !runs.has(session.id) || !connection) return;
      connection.cancel({ sessionId: session.id }).catch(() => {});
      finishWait(session.id, { outcome: { outcome: "cancelled" } });
    },
    answerPermission(decision) {
      const session = activeSession();
      const waiter = session ? waits.get(session.id) : null;
      if (!waiter || waiter.kind !== "command") throw new Error("Nothing is waiting.");
      const optionKind = decision === "reject" ? "reject_once" : "allow_once";
      if (decision === "allow-session" && session) {
        session.allowances.push(waiter.key);
        save();
      }
      const optionId = optionFor(waiter.options, optionKind);
      finishWait(session.id, { outcome: { outcome: "selected", optionId } });
    },
    answerQuestion(body) {
      const session = activeSession();
      const waiter = session ? waits.get(session.id) : null;
      if (!waiter || waiter.kind !== "question") throw new Error("Nothing is waiting.");
      if (waiter.source === "elicitation") {
        finishWait(session.id, body.skip ? { action: "cancel" } : { action: "decline" });
        return;
      }
      finishWait(session.id, body.skip
        ? { outcome: { outcome: "skipped" } }
        : { outcome: { outcome: "answered", answers: body.answers } });
    },
    answerPlan(accepted) {
      const session = activeSession();
      const waiter = session ? waits.get(session.id) : null;
      if (!waiter || waiter.kind !== "plan") throw new Error("Nothing is waiting.");
      finishWait(session.id, accepted
        ? { outcome: { outcome: "accepted" } }
        : { outcome: { outcome: "rejected" } });
    },
    setMode(mode) {
      if (!MODES.includes(mode)) throw new Error("Unknown mode.");
      const workspace = activeWorkspace();
      if (!workspace) throw new Error("Choose a workspace first.");
      workspace.preferredMode = mode;
      const session = activeSession();
      if (session && !runs.has(session.id)) {
        session.mode = mode;
        if (connection) applyMode(session).catch(showError);
      }
      saveNow();
      publish();
    },
    async setModel(value) {
      const session = activeSession();
      requireSessionIdle(session);
      if (!session || !connection) throw new Error("Start a session first.");
      const option = modelOption(session.configOptions);
      if (!option) throw new Error("This session has no model choice.");
      const next = await connection.setSessionConfigOption({
        sessionId: session.id,
        configId: option.id,
        value,
      });
      session.configOptions = next.configOptions;
      session.model = currentModelName(session.configOptions);
      saveNow();
      publish();
    },
    pin(name, pinned) {
      const session = activeSession();
      if (!session) throw new Error("Start a session first.");
      session.pinned = pinned
        ? [...new Set([...session.pinned, name])]
        : session.pinned.filter((skill) => skill !== name);
      saveNow();
      publish();
    },
    async openSession(id) {
      const workspace = activeWorkspace();
      if (!workspace) throw new Error("Choose a workspace first.");
      if (id.startsWith("ide:")) {
        const chatId = id.slice(4);
        const chat = desktop.list(state.activeWorkspace).find((item) => item.id === chatId);
        if (!chat) throw new Error("That chat is not in this workspace.");
        const linked = Object.values(workspace.sessions).find((session) => session.ideChatId === chatId);
        if (!linked) {
          workspace.activeIdeChatId = chatId;
          workspace.activeSessionId = null;
          saveNow();
          publish();
          return;
        }
        workspace.activeIdeChatId = null;
        workspace.activeSessionId = linked.id;
      }
      const session = workspace.sessions[id.startsWith("ide:") ? workspace.activeSessionId : id];
      if (!session) throw new Error("That session is not in this workspace.");
      workspace.activeIdeChatId = null;
      workspace.activeSessionId = session.id;
      saveNow();
      publish();
      if (liveSessions.has(session.id)) return;
      await ensureAgent();
      try {
        await openLoaded(session, state.activeWorkspace);
        session.mode = session.modes?.currentModeId || session.mode;
        session.model = currentModelName(session.configOptions) || session.model;
      } finally {
        saveNow();
        publish();
      }
    },
    change(file, action) {
      const open = openConversation();
      requireSessionIdle(open.session);
      const change = openChanges(open).find((candidate) => candidate.path === file);
      if (!change) throw new Error("That change is not open.");
      answerChange(open.session, change, action);
      saveNow();
      publish();
    },
    changeAll(action) {
      const open = openConversation();
      requireSessionIdle(open.session);
      for (const change of openChanges(open)) answerChange(open.session, change, action);
      saveNow();
      publish();
    },
  };

  function view() {
    const open = openConversation();
    const { directory = state.activeWorkspace, workspace = null } = open;
    const session = open.session ?? null;
    if (session) ensureChangeMarks(session);
    const skills = listSkills(directory);
    const transcript = open.chat ? open.chat.messages : session ? desktop.transcript(session) : [];
    const run = session ? runs.get(session.id) : null;
    const waiter = session ? waits.get(session.id) : null;
    return {
      error,
      running: Boolean(run),
      activity: run ? (waiter ? null : run.activity || "Working") : null,
      catalog: catalog.list().map((entry) => ({ ...entry, status: workspaceStatus(entry.path) })),
      activeWorkspace: directory,
      activeSession: open.session
        ? open.session.id
        : open.chat
          ? `ide:${open.chat.id}`
          : null,
      sessions: workspace && directory ? sessionList(workspace, directory) : [],
      transcript,
      desktopStatus: desktop.status({ directory, session, chatId: open.chatId, rowsToRemove: state.desktopRowsToRemove }),
      mode: session?.mode ?? workspace?.preferredMode ?? "agent",
      preferredMode: workspace?.preferredMode ?? "agent",
      modes: MODES,
      model: session?.model ?? "Auto",
      models: modelChoices(session?.configOptions),
      skills: skills.map(({ name, description }) => ({
        name,
        description,
        pinned: session?.pinned?.includes(name) ?? false,
      })),
      pending: waiter?.view ?? null,
      changes: changeViews(open),
    };
  }

  function sessionList(workspace, directory) {
    const linked = new Set(
      Object.values(workspace.sessions).map((session) => session.ideChatId).filter(Boolean),
    );
    const ide = desktop.list(directory)
      .filter((chat) => !linked.has(chat.id))
      .map((chat) => ({ id: `ide:${chat.id}`, title: chat.title, updatedAt: chat.updatedAt }));
    const own = Object.values(workspace.sessions).map((session) => ({
      id: session.id,
      title: session.title || "New session",
      updatedAt: session.updatedAt || 0,
      status: sessionStatus(session.id),
    }));
    return [...ide, ...own]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map(({ id, title, status }) => ({ id, title, status: status || "idle" }));
  }

  function shown(workspace, directory) {
    const session = workspace.activeSessionId ? workspace.sessions[workspace.activeSessionId] : null;
    if (session) return { session };
    if (!workspace.activeIdeChatId) return {};
    const linked = Object.values(workspace.sessions).find((item) => item.ideChatId === workspace.activeIdeChatId);
    if (linked) return { session: linked };
    const chat = desktop.list(directory).some((item) => item.id === workspace.activeIdeChatId)
      ? desktop.read(workspace.activeIdeChatId)
      : null;
    return chat ? { chat } : {};
  }

  function changeViews(open) {
    return openChanges(open).flatMap(({ path, baseline }) => {
      const parts = changeParts(baseline, currentText(path));
      return parts.length ? [{ path, parts }] : [];
    });
  }

  function ensureChangeMarks(session) {
    const marked = new Set(
      session.transcript.filter((message) => message.role === "change").map((message) => message.path),
    );
    let added = false;
    for (const [file, baseline] of Object.entries(session.changes)) {
      if (marked.has(file)) continue;
      if (!changeParts(baseline, currentText(file)).length) continue;
      session.transcript.push({
        role: "change",
        path: file,
        action: baseline.existed ? "edit" : "create",
      });
      added = true;
    }
    if (added) save();
  }

  async function send(text, skillNames, fresh, prior, files) {
    const directory = state.activeWorkspace;
    if (!directory) throw new Error("Choose a workspace first.");
    const attached = normalizeFiles(files);
    const message = String(text ?? "").trim();
    if (!message && attached.length === 0) throw new Error("Write a message or attach a file.");
    const workspace = workspaceRecord(directory);
    await ensureAgent();
    let session = fresh ? null : activeSession();
    if (!fresh) requireSessionIdle(session);
    if (fresh) {
      const created = await connection.newSession({ cwd: directory, mcpServers: [] });
      session = {
        id: created.sessionId,
        title: prior?.title || message.slice(0, 80) || attached[0]?.name || "New session",
        mode: workspace.preferredMode,
        model: "Auto",
        modes: created.modes ?? null,
        configOptions: created.configOptions ?? [],
        pinned: [],
        allowances: [],
        transcript: [],
        changes: {},
        ideChatId: prior?.id ?? null,
        updatedAt: Date.now(),
      };
      workspace.sessions[session.id] = session;
      workspace.activeSessionId = session.id;
      liveSessions.add(session.id);
      workspace.activeIdeChatId = null;
      await applyAutoModel(session);
      await applyMode(session);
    } else if (!liveSessions.has(session.id)) {
      await openLoaded(session, directory);
    }
    const names = [...new Set([...(skillNames ?? []), ...session.pinned])];
    const textPrompt = composePrompt(
      prior ? continuationPrompt(prior.messages, message || "Continue with the attached files.") : message,
      skillBodies(directory, names),
    );
    const blocks = promptBlocks(textPrompt, attached);
    append(session, "user", displayText(message, attached));
    session.updatedAt = Date.now();
    runs.set(session.id, { activity: "Thinking" });
    error = "";
    saveNow();
    publish();
    runPrompt(session, blocks);
  }

  function runPrompt(session, blocks) {
    connection.prompt({
      sessionId: session.id,
      prompt: blocks,
    }).catch(showError).finally(() => {
      runs.delete(session.id);
      finishWait(session.id, { outcome: { outcome: "cancelled" } });
      saveNow();
      publish();
    });
  }

  async function openLoaded(session, directory) {
    const loaded = await connection.loadSession({
      sessionId: session.id,
      cwd: directory,
      mcpServers: [],
    });
    session.modes = loaded.modes ?? session.modes;
    session.configOptions = loaded.configOptions ?? session.configOptions;
    liveSessions.add(session.id);
  }

  async function ensureAgent() {
    if (connection) return;
    if (!starting) starting = startAgent();
    await starting;
  }

  function startAgent() {
    const bin = agentBin || join(homedir(), ".local", "bin", "agent");
    agentProcess = spawn(bin, ["acp"], { stdio: ["pipe", "pipe", "pipe"] });
    agentProcess.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
    });
    const stream = acp.ndJsonStream(
      Writable.toWeb(agentProcess.stdin),
      Readable.toWeb(agentProcess.stdout),
    );
    const client = {
      requestPermission,
      sessionUpdate,
      extMethod,
      async createElicitation(params) {
        return waitFor(sessionForRequest(params), {
          kind: "question",
          source: "elicitation",
          view: {
            kind: "question",
            title: "The agent needs an answer",
            questions: [{
              id: "note",
              prompt: JSON.stringify(params?.message ?? params?.prompt ?? params, null, 2),
              options: [],
            }],
          },
        });
      },
    };
    connection = new acp.ClientSideConnection(() => client, stream);
    agentProcess.on("exit", () => {
      connection = null;
      starting = null;
      runs.clear();
      liveSessions.clear();
      for (const id of [...waits.keys()]) finishWait(id, { outcome: { outcome: "cancelled" } });
      error = "The agent process stopped.";
      publish();
    });
    return connection.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      },
      clientInfo: { name: "cursor-remote", version: "0.1.0" },
    }).then(async (initialized) => {
      const method = initialized.authMethods?.find((item) => item.id === "cursor_login");
      if (method) await connection.authenticate({ methodId: method.id });
    });
  }

  function requestPermission(params) {
    const tool = params.toolCall;
    const session = findSession(params.sessionId) ?? sessionForRequest(params);
    if (session) trackMutations(session, tool);
    const described = commandKey(tool);
    if (!described) return allow(params.options);
    if (session?.allowances?.includes(described.key)) return allow(params.options);
    return waitFor(session, {
      kind: "command",
      key: described.key,
      options: params.options,
      view: { kind: "command", label: described.label, title: tool.title || described.label },
    });
  }

  function sessionUpdate(params) {
    const session = findSession(params.sessionId);
    if (!session) return;
    const update = params.update;
    const run = runs.get(session.id);
    if (update.sessionUpdate === "agent_message_chunk" && run) {
      const text = update.content?.type === "text" ? update.content.text : "";
      if (text) {
        append(session, "assistant", text);
        run.activity = "Writing";
      }
    }
    if (update.sessionUpdate === "agent_thought_chunk" && run) {
      run.activity = "Thinking";
    }
    if (update.sessionUpdate === "user_message_chunk") return;
    if ((update.sessionUpdate === "tool_call" || update.sessionUpdate === "tool_call_update") && run) {
      trackMutations(session, update);
      const done = update.status === "completed" || update.status === "failed" || update.status === "cancelled";
      run.activity = done ? "Thinking" : activityLabel(update);
    }
    if (update.sessionUpdate === "current_mode_update" && update.modeId) {
      session.mode = String(update.modeId);
    }
    if (update.sessionUpdate === "config_option_update" && update.configOptions) {
      session.configOptions = update.configOptions;
      session.model = currentModelName(session.configOptions);
    }
    save();
    publish();
  }

  function trackMutations(session, tool) {
    if (!isFileMutation(tool)) return;
    for (const file of pathsFromTool(tool)) {
      const prior = priorFromTool(tool, file);
      if (isDeletion(tool, file)) {
        noteDeletion(session, file, prior);
        continue;
      }
      if (Object.hasOwn(session.changes, file)) {
        repairBaseline(session.changes, file, prior);
        continue;
      }
      if (!remember(session.changes, file, prior)) continue;
      session.transcript.push({
        role: "change",
        path: file,
        action: mutationAction(tool, session.changes[file]),
      });
    }
  }

  function noteDeletion(session, file, prior) {
    const existing = session.changes[file];
    const latest = [...session.transcript].reverse().find((message) => message.role === "change" && message.path === file);
    const removed = typeof prior === "string" ? prior : existing?.existed ? existing.content : currentText(file);
    if (latest?.action !== "delete") {
      if (existing?.desktopDiffId) queueRemovedRow(session, existing.desktopDiffId);
      session.transcript.push({ role: "change", path: file, action: "delete" });
    }
    const alreadyWritten = latest?.action === "delete" && existing?.desktopBubbleId;
    session.changes[file] = {
      existed: true,
      content: removed ?? "",
      touchedAt: existing?.touchedAt ?? Date.now(),
      ...(alreadyWritten ? { desktopBubbleId: existing.desktopBubbleId, desktopDiffId: existing.desktopDiffId } : {}),
    };
  }

  function queueRemovedRow(session, diffId) {
    const directory = sessionDirectory(session);
    if (!directory) return;
    const row = (desktop.pendingRows(directory) ?? []).find((candidate) => candidate.diffId === diffId);
    if (row) queueRowKeys([row.rowKey]);
  }

  function extMethod(method, params) {
    if (method === "cursor/ask_question") {
      return waitFor(sessionForRequest(params), {
        kind: "question",
        source: "cursor",
        view: {
          kind: "question",
          title: params.title || "Agent question",
          questions: params.questions || [],
        },
      });
    }
    if (method === "cursor/create_plan") {
      return waitFor(sessionForRequest(params), {
        kind: "plan",
        view: {
          kind: "plan",
          title: params.name || "Plan",
          text: params.plan || params.overview || "",
        },
      });
    }
    return {};
  }

  function waitFor(session, pending) {
    if (!session) return Promise.resolve({ outcome: { outcome: "cancelled" } });
    finishWait(session.id, { outcome: { outcome: "cancelled" } });
    return new Promise((resolve) => {
      waits.set(session.id, { ...pending, resolve });
      publish();
    });
  }

  function finishWait(sessionId, value) {
    const current = waits.get(sessionId);
    if (!current) return;
    waits.delete(sessionId);
    current.resolve(value);
    publish();
  }

  function allow(options) {
    return { outcome: { outcome: "selected", optionId: optionFor(options, "allow_once") } };
  }

  async function applyMode(session) {
    const modes = session.modes?.availableModes || [];
    const match = modes.find((mode) => mode.id.toLowerCase() === session.mode || mode.name.toLowerCase() === session.mode);
    if (!match || !connection) return;
    const next = await connection.setSessionMode({ sessionId: session.id, modeId: match.id });
    session.modes = next.modes ?? session.modes;
  }

  async function applyAutoModel(session) {
    const option = modelOption(session.configOptions);
    if (!option || !connection) return;
    const values = flatOptions(option);
    const auto = values.find((item) => item.value === "auto" || item.name.toLowerCase() === "auto");
    if (!auto || option.currentValue === auto.value) {
      session.model = currentModelName(session.configOptions);
      return;
    }
    const next = await connection.setSessionConfigOption({
      sessionId: session.id,
      configId: option.id,
      value: auto.value,
    });
    session.configOptions = next.configOptions;
    session.model = currentModelName(session.configOptions);
  }

  function findSession(id) {
    for (const workspace of Object.values(state.workspaces)) {
      if (workspace.sessions[id]) return workspace.sessions[id];
    }
    return null;
  }

  function append(session, role, text) {
    const last = session.transcript.at(-1);
    if (last?.role === role && role === "assistant") last.text += text;
    else session.transcript.push({ role, text });
  }

  function showError(cause) {
    error = cause instanceof Error ? cause.message : String(cause);
    publish();
  }
}

function optionFor(options, kind) {
  return options.find((option) => option.kind === kind)?.optionId || options[0]?.optionId;
}

function modelOption(configOptions) {
  return (configOptions || []).find((option) => option.category === "model" && option.type === "select") || null;
}

function flatOptions(option) {
  const values = [];
  for (const item of option.options || []) {
    if (item.options) values.push(...item.options);
    else values.push(item);
  }
  return values;
}

function modelChoices(configOptions) {
  const option = modelOption(configOptions);
  if (!option) return [];
  return flatOptions(option).map((item) => ({
    value: item.value,
    name: item.name,
    selected: item.value === option.currentValue,
  }));
}

function currentModelName(configOptions) {
  const option = modelOption(configOptions);
  if (!option) return "Auto";
  return flatOptions(option).find((item) => item.value === option.currentValue)?.name || "Auto";
}

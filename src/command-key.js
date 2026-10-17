import { currentText } from "./changes.js";

// Without full file contents the agent rebuilds oldText from a unified diff: hunks become excerpts and "--- /dev/null" leaks in as "-- /dev/null".
const NEW_FILE_HEADER = /^-- \/dev\/null(\n|$)/;

export function commandKey(tool) {
  const name = String(tool.name || "");
  const title = String(tool.title || "");
  const raw = tool.rawInput && typeof tool.rawInput === "object" ? tool.rawInput : {};
  const command = typeof raw.command === "string" ? raw.command : "";
  if (tool.kind === "execute" || command) {
    const text = command || title || "shell";
    return { kind: "shell", key: `shell:${text}`, label: text };
  }
  if (/^mcp\b/i.test(name) || /^mcp\b/i.test(title)) {
    return { kind: "mcp", key: `mcp:${name}:${stable(raw)}`, label: title || name };
  }
  return null;
}

export function pathsFromTool(tool) {
  const paths = [];
  for (const location of tool.locations || []) {
    if (location?.path) paths.push(location.path);
  }
  const raw = tool.rawInput && typeof tool.rawInput === "object" ? tool.rawInput : {};
  for (const key of ["path", "file_path", "filePath", "target_file"]) {
    if (typeof raw[key] === "string") paths.push(raw[key]);
  }
  for (const item of tool.content || []) {
    if (item?.type !== "diff") continue;
    if (typeof item.path === "string") paths.push(item.path);
    for (const change of item.changes || []) {
      if (typeof change?.path === "string") paths.push(change.path);
      if (typeof change?.oldPath === "string") paths.push(change.oldPath);
    }
  }
  return [...new Set(paths)];
}

/** Pre-edit file text from the tool payload, when disk may already have the write. */
export function priorFromTool(tool, file) {
  const before = findBeforeFullFile(tool, file);
  if (before !== undefined) return before;
  for (const item of tool.content || []) {
    if (item?.type !== "diff" || item.path !== file || !("oldText" in item)) continue;
    if (item.oldText == null || NEW_FILE_HEADER.test(item.oldText)) return null;
    if (item.newText === currentText(file)) return item.oldText;
  }
  const raw = tool.rawInput && typeof tool.rawInput === "object" ? tool.rawInput : {};
  const rawPath = raw.path || raw.file_path || raw.filePath || raw.target_file;
  if (rawPath === file && typeof raw.old_string === "string" && typeof raw.new_string === "string") {
    return reverseStrReplace(file, raw.old_string, raw.new_string);
  }
  return undefined;
}

function findBeforeFullFile(value, file, seen = new Set()) {
  if (!value || typeof value !== "object") return undefined;
  if (seen.has(value)) return undefined;
  seen.add(value);
  if (
    typeof value.beforeFullFileContent === "string"
    && (!value.path || value.path === file)
  ) {
    return value.beforeFullFileContent;
  }
  for (const child of Object.values(value)) {
    if (!child || typeof child !== "object") continue;
    const found = findBeforeFullFile(child, file, seen);
    if (found !== undefined) return found;
  }
  return undefined;
}

function reverseStrReplace(file, oldString, newString) {
  const disk = currentText(file);
  if (disk === null) return null;
  if (!newString) return undefined;
  const at = disk.indexOf(newString);
  if (at >= 0) return disk.slice(0, at) + oldString + disk.slice(at + newString.length);
  return disk;
}

export function isFileMutation(tool) {
  const kind = String(tool?.kind || "");
  if (kind === "edit" || kind === "delete" || kind === "move") return true;
  if (
    kind === "read"
    || kind === "search"
    || kind === "think"
    || kind === "fetch"
    || kind === "execute"
    || kind === "switch_mode"
  ) {
    return false;
  }
  return (tool?.content || []).some((item) => item?.type === "diff");
}

export function mutationAction(tool, baseline) {
  const kind = String(tool?.kind || "");
  if (kind === "delete") return "delete";
  if (kind === "move") return "move";
  if (baseline && baseline.existed === false) return "create";
  return "edit";
}

export function activityLabel(tool) {
  if (!tool || typeof tool !== "object") return "Working";
  const title = String(tool.title || "").trim();
  const name = String(tool.name || "").trim();
  const kind = String(tool.kind || "").trim();
  const paths = pathsFromTool(tool);
  const file = paths.length ? fileLeaf(paths[0]) : "";
  const raw = tool.rawInput && typeof tool.rawInput === "object" ? tool.rawInput : {};
  const command = typeof raw.command === "string" ? raw.command.trim() : "";
  if (kind === "read") return file ? `Reading ${file}` : title || "Reading";
  if (kind === "edit") return file ? `Editing ${file}` : title || "Editing";
  if (kind === "delete") return file ? `Deleting ${file}` : title || "Deleting";
  if (kind === "move") return file ? `Moving ${file}` : title || "Moving";
  if (kind === "search") return title || "Searching";
  if (kind === "execute" || command) return shortCommand(command || title || "command");
  if (kind === "think") return "Thinking";
  if (kind === "fetch") return title || "Fetching";
  if (kind === "switch_mode") return title || "Switching mode";
  if (title) return title;
  if (name) return name;
  return "Working";
}

function fileLeaf(path) {
  const parts = String(path).split(/[/\\]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : String(path);
}

function shortCommand(text) {
  const line = String(text).replace(/\s+/g, " ").trim();
  if (line.length <= 48) return `Running ${line}`;
  return `Running ${line.slice(0, 45)}…`;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

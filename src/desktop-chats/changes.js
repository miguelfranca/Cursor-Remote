import { pathToFileURL } from "node:url";

export function conversationChanges({ ownChanges, rows, chat, rowsToRemove }) {
  const removing = new Set(rowsToRemove);
  const changes = new Map();
  const ownPathByDiff = new Map();
  for (const [path, baseline] of Object.entries(ownChanges)) {
    changes.set(path, {
      path,
      baseline: { existed: baseline.existed, content: baseline.content },
      touchedAt: baseline.touchedAt ?? 0,
      own: true,
      rowKeys: [],
    });
    if (baseline.desktopDiffId) ownPathByDiff.set(baseline.desktopDiffId, path);
  }
  for (const row of rows) {
    if (removing.has(row.rowKey)) continue;
    const desktop = {
      path: row.path,
      baseline: rowBaseline(row, chat),
      touchedAt: chat?.editTimes[row.toolCallId] ?? 0,
      own: false,
      rowKeys: [row.rowKey],
    };
    const ownPath = ownPathByDiff.get(row.diffId);
    if (ownPath) {
      const own = changes.get(ownPath);
      own.rowKeys.push(row.rowKey);
      if (desktop.touchedAt < own.touchedAt) {
        own.baseline = desktop.baseline;
        own.touchedAt = desktop.touchedAt;
      }
      continue;
    }
    const existing = changes.get(row.path);
    if (!existing) {
      changes.set(row.path, desktop);
      continue;
    }
    const earliest = desktop.touchedAt < existing.touchedAt ? desktop : existing;
    changes.set(row.path, {
      ...existing,
      baseline: earliest.baseline,
      touchedAt: earliest.touchedAt,
      rowKeys: [...existing.rowKeys, row.rowKey],
    });
  }
  return [...changes.values()];
}

export function rowBaseline(row, chat) {
  const recorded = chat?.editBaselines?.[row.toolCallId];
  const content = recorded !== undefined ? recorded : row.originalLines.join("\n");
  const created = chat?.createdFiles.has(pathToFileURL(row.path).href) && content === "";
  return created ? { existed: false, content: null } : { existed: true, content };
}

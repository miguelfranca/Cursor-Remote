const CONTEXT = 3;
const LARGE = 3000;

export function unifiedDiff(before, after, file) {
  const parts = diffParts(before, after);
  if (!parts.length) return "";
  const label = file || "file";
  const lines = [`--- ${label}`, `+++ ${label}`];
  for (const part of parts) {
    if (part.type === "gap") continue;
    lines.push(...part.lines);
  }
  return lines.join("\n");
}

export function diffParts(before, after) {
  const left = before ?? "";
  const right = after ?? "";
  if (left === right) return [];
  const a = left.split("\n");
  const b = right.split("\n");
  if (a.length > LARGE || b.length > LARGE) return oversizedParts(a, b);
  return formatParts(diffOps(a, b), CONTEXT);
}

export function lineCounts(before, after) {
  const counts = { added: 0, removed: 0 };
  for (const part of diffParts(before, after)) {
    if (part.type !== "hunk") continue;
    for (const line of part.lines.slice(1)) {
      if (line.startsWith("+")) counts.added += 1;
      else if (line.startsWith("-")) counts.removed += 1;
    }
  }
  return counts;
}

function diffOps(a, b) {
  const table = lcs(a, b);
  const ops = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.push({ type: "equal", line: a[i - 1] });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || table[i][j - 1] >= table[i - 1][j])) {
      ops.push({ type: "add", line: b[j - 1] });
      j -= 1;
    } else {
      ops.push({ type: "del", line: a[i - 1] });
      i -= 1;
    }
  }
  ops.reverse();
  return ops;
}

function changeRanges(ops, context) {
  const changed = [];
  for (let index = 0; index < ops.length; index += 1) {
    if (ops[index].type !== "equal") changed.push(index);
  }
  if (!changed.length) return [];
  const ranges = [];
  let start = Math.max(0, changed[0] - context);
  let end = Math.min(ops.length, changed[0] + context + 1);
  for (let n = 1; n < changed.length; n += 1) {
    const nextStart = Math.max(0, changed[n] - context);
    if (nextStart <= end + 1) {
      end = Math.min(ops.length, changed[n] + context + 1);
    } else {
      ranges.push([start, end]);
      start = nextStart;
      end = Math.min(ops.length, changed[n] + context + 1);
    }
  }
  ranges.push([start, end]);
  return ranges;
}

function formatParts(ops, context) {
  const ranges = changeRanges(ops, context);
  if (!ranges.length) return [];
  const parts = [];
  let oldLine = 1;
  let newLine = 1;
  let cursor = 0;
  for (const [from, to] of ranges) {
    if (cursor < from) {
      const gap = [];
      while (cursor < from) {
        gap.push(` ${ops[cursor].line}`);
        oldLine += 1;
        newLine += 1;
        cursor += 1;
      }
      parts.push({ type: "gap", lines: gap });
    }
    let oldCount = 0;
    let newCount = 0;
    const body = [];
    for (let index = from; index < to; index += 1) {
      const op = ops[index];
      if (op.type === "equal") {
        body.push(` ${op.line}`);
        oldCount += 1;
        newCount += 1;
      } else if (op.type === "del") {
        body.push(`-${op.line}`);
        oldCount += 1;
      } else {
        body.push(`+${op.line}`);
        newCount += 1;
      }
    }
    parts.push({
      type: "hunk",
      lines: [`@@ -${oldLine},${oldCount} +${newLine},${newCount} @@`, ...body],
    });
    oldLine += oldCount;
    newLine += newCount;
    cursor = to;
  }
  if (cursor < ops.length) {
    const gap = [];
    while (cursor < ops.length) {
      gap.push(` ${ops[cursor].line}`);
      cursor += 1;
    }
    parts.push({ type: "gap", lines: gap });
  }
  return parts;
}

function oversizedParts(a, b) {
  let startA = 0;
  let startB = 0;
  while (startA < a.length && startB < b.length && a[startA] === b[startB]) {
    startA += 1;
    startB += 1;
  }
  let endA = a.length;
  let endB = b.length;
  while (endA > startA && endB > startB && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }
  const removed = endA - startA;
  const added = endB - startB;
  const preview = 40;
  const lines = [`@@ -${startA + 1},${removed} +${startB + 1},${added} @@`];
  for (let index = startA; index < Math.min(endA, startA + preview); index += 1) {
    lines.push(`-${a[index]}`);
  }
  if (removed > preview) lines.push(`-… ${removed - preview} more lines`);
  for (let index = startB; index < Math.min(endB, startB + preview); index += 1) {
    lines.push(`+${b[index]}`);
  }
  if (added > preview) lines.push(`+… ${added - preview} more lines`);
  return [{ type: "hunk", lines }];
}

function lcs(a, b) {
  const rows = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      rows[i][j] = a[i - 1] === b[j - 1]
        ? rows[i - 1][j - 1] + 1
        : Math.max(rows[i - 1][j], rows[i][j - 1]);
    }
  }
  return rows;
}

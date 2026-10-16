export const MAX_FILES = 8;
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

const textNames = /\.(txt|md|markdown|csv|tsv|json|jsonl|ya?ml|xml|html?|css|js|jsx|ts|tsx|mjs|cjs|py|go|rs|java|kt|kts|swift|rb|php|sh|bash|zsh|toml|ini|env|log|diff|patch|svg)$/i;

export function normalizeFiles(input) {
  if (input == null) return [];
  if (!Array.isArray(input)) throw new Error("Files must be a list.");
  if (input.length > MAX_FILES) throw new Error(`Attach at most ${MAX_FILES} files.`);
  const files = [];
  let total = 0;
  for (const item of input) {
    const name = String(item?.name ?? "").trim() || "file";
    const mimeType = String(item?.mimeType ?? "").trim() || guessMime(name);
    const data = String(item?.data ?? "").replace(/\s+/g, "");
    if (!data) throw new Error(`${name} has no data.`);
    if (!/^[A-Za-z0-9+/]+=*$/.test(data)) throw new Error(`${name} is not valid file data.`);
    const bytes = Buffer.byteLength(data, "base64");
    if (bytes > MAX_FILE_BYTES) throw new Error(`${name} is larger than 8 MB.`);
    total += bytes;
    if (total > MAX_TOTAL_BYTES) throw new Error("Attached files are larger than 20 MB together.");
    files.push({ name: name.slice(0, 180), mimeType, data });
  }
  return files;
}

export function promptBlocks(text, files) {
  const blocks = [];
  if (text) blocks.push({ type: "text", text });
  for (const file of files) {
    const uri = `attachment://${encodeURIComponent(file.name)}`;
    if (file.mimeType.startsWith("image/")) {
      blocks.push({ type: "image", mimeType: file.mimeType, data: file.data, uri });
      continue;
    }
    if (isTextFile(file)) {
      blocks.push({
        type: "resource",
        resource: {
          uri,
          mimeType: file.mimeType,
          text: Buffer.from(file.data, "base64").toString("utf8"),
        },
      });
      continue;
    }
    blocks.push({
      type: "resource",
      resource: {
        uri,
        mimeType: file.mimeType,
        blob: file.data,
      },
    });
  }
  return blocks;
}

export function displayText(text, files) {
  const note = files.length ? `Attached: ${files.map((file) => file.name).join(", ")}` : "";
  if (text && note) return `${text}\n\n${note}`;
  return text || note;
}

function isTextFile(file) {
  if (file.mimeType.startsWith("text/")) return true;
  if (file.mimeType === "application/json" || file.mimeType === "application/xml") return true;
  if (file.mimeType.includes("javascript") || file.mimeType.includes("typescript")) return true;
  return textNames.test(file.name);
}

function guessMime(name) {
  const lower = name.toLowerCase();
  if (/\.png$/.test(lower)) return "image/png";
  if (/\.jpe?g$/.test(lower)) return "image/jpeg";
  if (/\.gif$/.test(lower)) return "image/gif";
  if (/\.webp$/.test(lower)) return "image/webp";
  if (/\.pdf$/.test(lower)) return "application/pdf";
  if (/\.json$/.test(lower)) return "application/json";
  if (textNames.test(name)) return "text/plain";
  return "application/octet-stream";
}

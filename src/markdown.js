export function renderMarkdown(text) {
  const source = String(text ?? "").replace(/\r\n?/g, "\n");
  if (!source.trim()) return "";
  const lines = source.split("\n");
  const html = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (/^```/.test(line)) {
      const language = esc(line.slice(3).trim());
      const chunk = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) {
        chunk.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      html.push(`<pre class="md-code"${language ? ` data-lang="${language}"` : ""}><code>${esc(chunk.join("\n"))}</code></pre>`);
      continue;
    }
    if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line)) {
      html.push("<hr>");
      index += 1;
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quoted = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoted.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      html.push(`<blockquote>${renderMarkdown(quoted.join("\n"))}</blockquote>`);
      continue;
    }
    if (/^([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\d+\.\s+/.test(line);
      const tag = ordered ? "ol" : "ul";
      const items = [];
      while (index < lines.length && /^([-*+]|\d+\.)\s+/.test(lines[index])) {
        items.push(`<li>${inline(lines[index].replace(/^([-*+]|\d+\.)\s+/, ""))}</li>`);
        index += 1;
      }
      html.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }
    const paragraph = [line];
    index += 1;
    while (
      index < lines.length
      && lines[index].trim()
      && !/^```/.test(lines[index])
      && !/^(#{1,6})\s+/.test(lines[index])
      && !/^>\s?/.test(lines[index])
      && !/^([-*+]|\d+\.)\s+/.test(lines[index])
      && !/^(\*{3,}|-{3,}|_{3,})\s*$/.test(lines[index])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    html.push(`<p>${inline(paragraph.join("\n")).replaceAll("\n", "<br>")}</p>`);
  }

  return html.join("");
}

function inline(text) {
  const placeholders = [];
  const keep = (html) => {
    placeholders.push(html);
    return `\u0000${placeholders.length - 1}\u0000`;
  };
  let value = esc(text);
  value = value.replace(/`([^`]+)`/g, (_, code) => keep(`<code>${code}</code>`));
  value = value.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, label, href) => {
    if (!safeUrl(href)) return label;
    return keep(`<img src="${href}" alt="${label}">`);
  });
  value = value.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, label, href) => {
    if (!safeUrl(href)) return label;
    return keep(`<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`);
  });
  value = value.replace(/\*\*\s*([^*]+?)\s*\*\*/g, (_, body) => keep(`<strong>${body}</strong>`));
  value = value.replace(/__\s*([^_]+?)\s*__/g, (_, body) => keep(`<strong>${body}</strong>`));
  value = value.replace(/(^|[\s(])\*\s*([^*\n]+?)\s*\*(?=[\s).,!?:;]|$)/g, (_, lead, body) => `${lead}${keep(`<em>${body}</em>`)}`);
  value = value.replace(/(^|[\s(])_\s*([^_\n]+?)\s*_(?=[\s).,!?:;]|$)/g, (_, lead, body) => `${lead}${keep(`<em>${body}</em>`)}`);
  return value.replace(/\u0000(\d+)\u0000/g, (_, index) => placeholders[Number(index)]);
}

function safeUrl(value) {
  return /^(https?:|mailto:|\/|#)/i.test(String(value).trim());
}

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

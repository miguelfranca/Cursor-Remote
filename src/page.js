import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const markdownBrowser = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "markdown.js"),
  "utf8",
).replace(/^export /gm, "");

export function page(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>${escapeHtml(title)}</title>
  <style>
    :focus-visible { outline: 3px solid #fff; outline-offset: 3px; }
    body {
      margin: 0;
      min-height: 100dvh;
      background: #000;
      color: #f4f4f4;
      font-family: system-ui, sans-serif;
      line-height: 1.5;
    }
    main { max-width: 32rem; padding: max(2.5rem, env(safe-area-inset-top)) 1.5rem 2rem; }
    h1 { margin: 0 0 0.5rem; font-size: 1.75rem; font-weight: 600; letter-spacing: -0.02em; }
    p { margin: 0; max-width: 28rem; color: #dedede; }
  </style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>`;
}

export function clientPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
  <meta name="color-scheme" content="dark">
  <meta name="theme-color" content="#000000">
  <link rel="manifest" href="/manifest.webmanifest?v=2">
  <title>Cursor Remote</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #000;
      --surface: #121212;
      --surface-2: #1c1c1c;
      --bubble: #2a2a2a;
      --line: #2a2a2a;
      --text: #f2f2f2;
      --muted: #9a9a9a;
      --accent: #3b5bdb;
      --accent-press: #2f4ac0;
      --danger: #fff;
      --radius-pill: 999px;
      --tap: 44px;
    }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    html { height: 100dvh; max-height: 100dvh; -webkit-text-size-adjust: 100%; }
    :focus { outline: none; }
    :focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
    body {
      margin: 0;
      height: 100dvh;
      max-height: 100dvh;
      overflow: hidden;
      background: var(--bg);
      color: var(--text);
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      line-height: 1.45;
    }
    button, select, textarea, summary { font: inherit; color: inherit; }
    button, summary { touch-action: manipulation; }
    button {
      min-height: var(--tap);
      padding: 0.65rem 0.9rem;
      border: 1px solid #555;
      border-radius: 12px;
      background: transparent;
      color: var(--text);
      text-align: center;
    }
    button.primary { background: var(--text); color: #111; border-color: var(--text); font-weight: 650; }
    button.reject { border-width: 2px; border-color: var(--danger); font-weight: 650; }
    button.quiet { border-color: #3a3a3a; color: #d2d2d2; font-weight: 500; }
    button:disabled { opacity: 0.42; }
    select {
      min-height: var(--tap);
      width: 100%;
      padding: 0 0.75rem;
      border: 1px solid #444;
      border-radius: 12px;
      background: var(--surface-2);
      color: var(--text);
      font-size: 1rem;
    }
    select:disabled, textarea:disabled { opacity: 0.55; }
    h1, h2, h3, p { margin: 0; }
    .icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: var(--tap);
      min-width: var(--tap);
      height: var(--tap);
      min-height: var(--tap);
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--text);
    }
    .icon-btn svg { width: 1.35rem; height: 1.35rem; display: block; }
    #more-open { position: relative; }
    .changes-dot {
      position: absolute;
      top: 0.55rem;
      right: 0.55rem;
      width: 0.55rem;
      height: 0.55rem;
      border-radius: 50%;
      background: #e03131;
      box-shadow: 0 0 0 2px var(--bg);
    }
    .app {
      position: relative;
      width: min(100%, 48rem);
      height: 100%;
      max-height: 100%;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      min-height: 0;
      min-width: 0;
      background: var(--bg);
      overflow: hidden;
    }
    .top {
      position: relative;
      z-index: 6;
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      gap: 0.35rem;
      padding: max(0.45rem, env(safe-area-inset-top)) 0.55rem 0.45rem;
      background: var(--bg);
    }
    .top-spacer { flex: 1 1 auto; min-width: 0; }
    .model-trigger {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      max-width: min(52vw, 14rem);
      min-height: var(--tap);
      padding: 0 0.65rem;
      border: 0;
      border-radius: 12px;
      background: transparent;
      font-weight: 600;
      font-size: 1rem;
      overflow: hidden;
    }
    .model-trigger span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .model-trigger svg { width: 0.7rem; height: 0.7rem; flex: 0 0 auto; opacity: 0.85; }
    .error {
      margin: 0 0.75rem 0.5rem;
      padding: 0.75rem 0.85rem;
      border: 1px solid #fff;
      border-radius: 12px;
      background: #241616;
      color: var(--text);
    }
    .error::before { content: "Error. "; font-weight: 700; }
    .scrim {
      position: absolute;
      inset: 0;
      z-index: 8;
      border: 0;
      padding: 0;
      margin: 0;
      background: rgba(0, 0, 0, 0.55);
      min-height: 0;
      border-radius: 0;
      width: 100%;
      height: 100%;
      cursor: pointer;
    }
    .drawer, .sheet {
      position: absolute;
      z-index: 9;
      background: var(--surface);
      color: var(--text);
      overflow: auto;
      -webkit-overflow-scrolling: touch;
    }
    .drawer {
      top: 0;
      left: 0;
      bottom: 0;
      width: min(20rem, 86vw);
      padding: max(0.85rem, env(safe-area-inset-top)) 1rem max(1rem, env(safe-area-inset-bottom));
      border-right: 1px solid var(--line);
      box-shadow: 12px 0 40px rgba(0, 0, 0, 0.45);
    }
    .sheet {
      left: 0;
      right: 0;
      bottom: 0;
      max-height: min(70dvh, 32rem);
      padding: 0.75rem 1rem max(1rem, env(safe-area-inset-bottom));
      border-radius: 1.25rem 1.25rem 0 0;
      border-top: 1px solid var(--line);
      box-shadow: 0 -16px 40px rgba(0, 0, 0, 0.45);
    }
    .sheet-changes {
      max-height: min(92dvh, 52rem);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
    }
    .sheet-changes .sheet-handle,
    .sheet-changes .sheet-head,
    .sheet-changes .note,
    .sheet-changes .change-actions { flex: 0 0 auto; }
    .change-files {
      flex: 0 0 auto;
      display: flex;
      gap: 0.4rem;
      overflow-x: auto;
      padding: 0.15rem 0 0.65rem;
      margin: 0 0 0.35rem;
      border-bottom: 1px solid #2e2e2e;
      -webkit-overflow-scrolling: touch;
    }
    .change-files button {
      flex: 0 0 auto;
      min-height: 2.35rem;
      padding: 0.4rem 0.75rem;
      border-radius: var(--radius-pill);
      border-color: #3a3a3a;
      background: var(--surface-2);
      font-size: 0.88rem;
      font-weight: 600;
      white-space: nowrap;
      max-width: 16rem;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .change-files button[aria-current="true"] {
      background: var(--text);
      color: #111;
      border-color: var(--text);
    }
    .change-detail {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 0.55rem;
    }
    .change-detail h3 {
      flex: 0 0 auto;
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.35rem 0.6rem;
      font-size: 1rem;
      font-weight: 650;
    }
    .change-detail .change-actions { flex: 0 0 auto; }
    .sheet-handle {
      width: 2.5rem;
      height: 0.28rem;
      margin: 0.15rem auto 0.85rem;
      border-radius: var(--radius-pill);
      background: #444;
    }
    .sheet-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      margin: 0 0 0.65rem;
    }
    .sheet-head .panel-title { margin: 0; }
    .sheet-close {
      flex: 0 0 auto;
      width: 2.5rem;
      min-width: 2.5rem;
      height: 2.5rem;
      min-height: 2.5rem;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: var(--surface-2);
      color: var(--text);
      font-size: 1.35rem;
      line-height: 1;
    }
    .panel-title {
      margin: 0 0 0.65rem;
      font-size: 1.05rem;
      font-weight: 650;
    }
    .section-label {
      margin: 1rem 0 0.45rem;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .section-label:first-child { margin-top: 0.25rem; }
    #new-chat {
      width: 100%;
      margin: 0 0 0.85rem;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      font-weight: 650;
      background: var(--surface-2);
      border-color: #333;
    }
    #new-chat svg { width: 1.1rem; height: 1.1rem; flex: 0 0 auto; }
    #catalog, #sessions, .decision, .change-actions, .skill-list, .menu-list, #model-list {
      display: grid;
      gap: 0.45rem;
    }
    #catalog button, #sessions button, #model-list button, .menu-list button {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      text-align: left;
      background: var(--surface-2);
      border-color: #333;
    }
    .choice-label { overflow-wrap: anywhere; }
    .current {
      flex: 0 0 auto;
      padding: 0.12rem 0.45rem;
      border: 1px solid #f4f4f4;
      border-radius: var(--radius-pill);
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    button[aria-current="true"], button[aria-current="page"] {
      border-width: 2px;
      border-color: #f4f4f4;
    }
    .empty, .hint { color: var(--muted); }
    .desktop-note { margin: 0.25rem 0 0; font-size: 0.85rem; }
    .workspace-chip {
      margin: 0 0 0.35rem;
      color: var(--muted);
      font-size: 0.85rem;
      overflow-wrap: anywhere;
    }
    .transcript {
      flex: 1 1 auto;
      min-height: 4.5rem;
      min-width: 0;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding: 0.5rem 1rem 1.25rem;
    }
    .message { max-width: min(100%, 36rem); }
    .body { overflow-wrap: anywhere; }
    .message-user .body { white-space: pre-wrap; }
    .message-user {
      align-self: end;
      padding: 0.75rem 0.95rem;
      background: var(--bubble);
      border-radius: 1.35rem 1.35rem 0.35rem 1.35rem;
    }
    .message-assistant {
      align-self: start;
      padding: 0.1rem 0.15rem;
      max-width: 100%;
    }
    .change-mark {
      align-self: start;
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      min-height: 2.25rem;
      padding: 0.35rem 0.75rem;
      border: 1px solid #3a3a3a;
      border-radius: var(--radius-pill);
      background: var(--surface-2);
      color: #e4e4e4;
      font-size: 0.88rem;
      font-weight: 600;
      text-align: left;
      max-width: 100%;
    }
    .change-mark span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .change-mark:disabled {
      opacity: 1;
      color: #e4e4e4;
    }
    .md {
      display: grid;
      gap: 0.7rem;
      line-height: 1.5;
    }
    .md > :first-child { margin-top: 0; }
    .md > :last-child { margin-bottom: 0; }
    .md h1, .md h2, .md h3, .md h4, .md h5, .md h6 {
      margin: 0.35rem 0 0;
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.25;
      overflow-wrap: anywhere;
    }
    .md h1 { font-size: 1.35rem; }
    .md h2 { font-size: 1.2rem; }
    .md h3 { font-size: 1.08rem; }
    .md h4, .md h5, .md h6 { font-size: 1rem; }
    .md p { margin: 0; overflow-wrap: anywhere; }
    .md ul, .md ol {
      margin: 0;
      padding-left: 1.35rem;
      display: grid;
      gap: 0.25rem;
    }
    .md li { overflow-wrap: anywhere; }
    .md li + li { margin-top: 0.1rem; }
    .md blockquote {
      margin: 0;
      padding: 0.15rem 0 0.15rem 0.85rem;
      border-left: 3px solid #444;
      color: #d4d4d4;
      display: grid;
      gap: 0.55rem;
    }
    .md hr {
      border: 0;
      border-top: 1px solid #333;
      margin: 0.35rem 0;
    }
    .md a { color: #9db7ff; }
    .md strong { font-weight: 700; }
    .md em { font-style: italic; }
    .md img {
      max-width: 100%;
      height: auto;
      border-radius: 10px;
    }
    .md code {
      font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
      font-size: 0.88em;
      padding: 0.08rem 0.28rem;
      border-radius: 5px;
      background: #1a1a1a;
      border: 1px solid #2e2e2e;
    }
    .md pre.md-code {
      margin: 0;
      max-height: 18rem;
      overflow: auto;
      padding: 0.75rem;
      border: 1px solid #333;
      border-radius: 10px;
      background: #0c0c0c;
      white-space: pre;
    }
    .md pre.md-code code {
      padding: 0;
      border: 0;
      background: transparent;
      font-size: 0.8125rem;
      line-height: 1.4;
      color: #e8e8e8;
    }
    .dock {
      position: relative;
      z-index: 3;
      flex: 0 0 auto;
      display: flex;
      flex-direction: column;
      max-height: calc(100dvh - 4.5rem);
      overflow: hidden;
      background: linear-gradient(to top, #000 70%, rgba(0,0,0,0));
      padding-top: 0.35rem;
    }
    #pending:not(:empty) {
      display: grid;
      gap: 0.7rem;
      margin: 0 1rem 0.55rem;
      padding: 0.9rem;
      border: 1px solid #555;
      border-radius: 1rem;
      background: var(--surface);
    }
    #pending h2 { font-size: 1.1rem; font-weight: 650; }
    #pending pre { max-height: 7rem; }
    #pending .eyebrow {
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: -0.25rem;
    }
    #pending fieldset {
      margin: 0;
      padding: 0.35rem 0.75rem 0.7rem;
      border: 1px solid #444;
      border-radius: 12px;
    }
    #pending legend { padding: 0 0.25rem; font-weight: 650; overflow-wrap: anywhere; }
    .decision button { width: 100%; }
    .note { color: #dedede; margin-bottom: 0.55rem; }
    .file-place { color: #c8c8c8; font-size: 0.8rem; font-weight: 550; }
    pre {
      margin: 0;
      min-width: 0;
      max-width: 100%;
      max-height: 14rem;
      overflow: auto;
      white-space: pre;
      padding: 0.75rem;
      border: 1px solid #333;
      border-radius: 10px;
      background: #0c0c0c;
      font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
      font-size: 0.8125rem;
      line-height: 1.4;
    }
    .diff {
      margin: 0;
      flex: 1 1 auto;
      min-height: 10rem;
      min-width: 0;
      max-width: 100%;
      overflow: auto;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
      padding: 0.35rem 0;
      border: 1px solid #333;
      border-radius: 10px;
      background: #0c0c0c;
      font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
      font-size: 0.8125rem;
      line-height: 1.45;
    }
    .diff-line {
      display: block;
      white-space: pre;
      padding: 0.05rem 0.75rem;
      overflow-wrap: normal;
    }
    .diff-meta {
      color: #8b9cb3;
      background: #121820;
    }
    .diff-hunk {
      color: #7aa2ff;
      background: #101827;
    }
    .diff-add {
      color: #b8f0c6;
      background: rgba(46, 160, 67, 0.22);
    }
    .diff-del {
      color: #ffc1c1;
      background: rgba(248, 81, 73, 0.22);
    }
    .diff-ctx { color: #c8c8c8; }
    .diff-gap {
      display: flex;
      justify-content: center;
      padding: 0.2rem 0.5rem;
    }
    .diff-gap button {
      min-height: 2rem;
      width: 100%;
      padding: 0.3rem 0.75rem;
      border-style: dashed;
      border-color: #3a4558;
      border-radius: 8px;
      background: #101827;
      color: #9eb6e0;
      font-size: 0.78rem;
      font-weight: 600;
      font-family: inherit;
    }
    pre.wrap { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 16rem; }
    .skill { display: grid; gap: 0.1rem; padding-bottom: 0.7rem; border-bottom: 1px solid #2c2c2c; }
    .skill:last-child { padding-bottom: 0; border-bottom: 0; }
    .check {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      min-height: var(--tap);
      padding: 0.4rem 0;
    }
    .check input { width: 1.15rem; height: 1.15rem; margin-top: 0.15rem; accent-color: #f4f4f4; }
    .skill-name, .skill-desc { display: block; }
    .skill-name { font-weight: 650; }
    .skill-desc { color: #cfcfcf; font-size: 0.92rem; }
    .composer {
      flex: 0 0 auto;
      display: grid;
      gap: 0.45rem;
      padding: 0.35rem 0.85rem max(0.85rem, env(safe-area-inset-bottom));
      background: transparent;
    }
    .attachments {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
      padding: 0 0.15rem;
    }
    .attachments:empty { display: none; }
    .attachment {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      max-width: 100%;
      padding: 0.35rem 0.45rem 0.35rem 0.7rem;
      border: 1px solid #444;
      border-radius: var(--radius-pill);
      background: var(--surface-2);
      font-size: 0.88rem;
    }
    .attachment span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .attachment button {
      min-height: 32px;
      min-width: 32px;
      padding: 0;
      border-radius: var(--radius-pill);
      border-color: #4a4a4a;
      color: #e8e8e8;
    }
    .composer-row {
      display: flex;
      align-items: flex-end;
      gap: 0.55rem;
    }
    .pill {
      flex: 1 1 auto;
      display: flex;
      align-items: flex-end;
      gap: 0.15rem;
      min-height: 3.25rem;
      padding: 0.35rem 0.45rem 0.35rem 0.35rem;
      border-radius: 1.75rem;
      background: var(--surface-2);
      border: 1px solid #2f2f2f;
    }
    .pill #attach {
      flex: 0 0 auto;
      width: var(--tap);
      min-width: var(--tap);
      height: var(--tap);
      min-height: var(--tap);
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--text);
      font-size: 1.55rem;
      font-weight: 400;
      line-height: 1;
    }
    .pill textarea {
      flex: 1 1 auto;
      width: auto;
      min-height: 2.4rem;
      max-height: 28vh;
      resize: none;
      padding: 0.7rem 0.35rem 0.7rem 0.15rem;
      border: 0;
      border-radius: 0;
      background: transparent;
      color: var(--text);
      font-size: 1rem;
      line-height: 1.4;
    }
    .pill textarea::placeholder { color: var(--muted); }
    .send-circle {
      flex: 0 0 auto;
      width: 3.25rem;
      min-width: 3.25rem;
      height: 3.25rem;
      min-height: 3.25rem;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: var(--accent);
      color: #fff;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .send-circle:disabled { opacity: 0.45; }
    .send-circle.is-stop {
      background: #e8e8e8;
      color: #111;
      animation: pulse-stop 1.6s ease-in-out infinite;
    }
    .send-circle svg { width: 1.25rem; height: 1.25rem; display: block; }
    .run-status {
      display: flex;
      align-items: center;
      gap: 0.55rem;
      padding: 0 0.35rem;
      font-size: 0.85rem;
      font-weight: 650;
      color: #d6d6d6;
      min-height: 1.4rem;
    }
    .run-status[hidden] { display: none !important; }
    .activity {
      align-self: start;
      display: flex;
      align-items: center;
      gap: 0.65rem;
      max-width: min(100%, 36rem);
      padding: 0.55rem 0.15rem;
      color: #d8d8d8;
      font-size: 0.95rem;
      font-weight: 550;
    }
    .spinner {
      flex: 0 0 auto;
      width: 0.95rem;
      height: 0.95rem;
      border: 2px solid #3a3a3a;
      border-top-color: #f2f2f2;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }
    .activity-dots::after {
      content: "...";
      display: inline-block;
      width: 0;
      overflow: hidden;
      vertical-align: bottom;
      animation: dots 1.2s steps(4, end) infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes dots {
      to { width: 1.15em; }
    }
    @keyframes pulse-stop {
      0%, 100% { box-shadow: 0 0 0 0 rgba(232, 232, 232, 0.35); }
      50% { box-shadow: 0 0 0 8px rgba(232, 232, 232, 0); }
    }
    .count:empty { display: none; }
    .count { font-size: 0.85rem; font-weight: 600; color: #e8e8e8; }
    .mode-row { display: grid; gap: 0.35rem; margin-bottom: 0.75rem; }
    .mode-row label { color: var(--muted); font-size: 0.8rem; font-weight: 650; }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    @media (min-width: 800px) {
      .app { box-shadow: 0 0 0 1px #1a1a1a; }
    }
    @media (max-height: 520px) {
      .transcript { min-height: 3rem; }
      .dock { max-height: calc(100% - 3rem); }
    }
  </style>
</head>
<body>
<div class="app">
  <header class="top">
    <button id="menu-open" class="icon-btn" type="button" aria-label="Workspaces and chats" aria-expanded="false" aria-controls="drawer">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 8h16v1.8H4zm0 6.2h16V16H4z"/></svg>
    </button>
    <div class="top-spacer">
      <button id="model-open" class="model-trigger" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="model-sheet">
        <span id="model-label">Auto</span>
        <svg viewBox="0 0 12 8" aria-hidden="true"><path fill="currentColor" d="M1.1 1.2 6 6.1l4.9-4.9L12 2.3 6 8.3 0 2.3z"/></svg>
      </button>
    </div>
    <button id="more-open" class="icon-btn" type="button" aria-label="More options" aria-expanded="false" aria-controls="more-sheet">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"/></svg>
      <span id="changes-dot" class="changes-dot" hidden></span>
    </button>
  </header>
  <p id="error" class="error" role="alert" hidden></p>

  <button id="drawer-scrim" class="scrim" type="button" hidden aria-label="Dismiss"></button>
  <aside id="drawer" class="drawer" hidden role="dialog" aria-label="Workspaces and chats">
    <button id="new-chat" type="button" hidden>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>
      <span id="new-chat-label">New chat</span>
    </button>
    <p id="workspace-title" class="workspace-chip" hidden></p>
    <p class="section-label">Workspace</p>
    <div id="catalog"><p class="empty">Open a folder in Cursor on this PC.</p></div>
    <div id="session-block">
      <p class="section-label">Chats</p>
      <div id="sessions"></div>
    </div>
  </aside>

  <button id="model-scrim" class="scrim" type="button" hidden aria-label="Dismiss"></button>
  <div id="model-sheet" class="sheet" hidden role="dialog" aria-label="Model">
    <div class="sheet-handle" aria-hidden="true"></div>
    <div class="sheet-head">
      <h2 class="panel-title">Model</h2>
      <button class="sheet-close" type="button" data-close-overlay aria-label="Close">×</button>
    </div>
    <div id="model-list"></div>
    <select id="model" class="sr-only" tabindex="-1" aria-hidden="true"></select>
  </div>

  <button id="more-scrim" class="scrim" type="button" hidden aria-label="Dismiss"></button>
  <div id="more-sheet" class="sheet" hidden role="dialog" aria-label="More options">
    <div class="sheet-handle" aria-hidden="true"></div>
    <div class="sheet-head">
      <h2 class="panel-title">Options</h2>
      <button class="sheet-close" type="button" data-close-overlay aria-label="Close">×</button>
    </div>
    <div class="mode-row">
      <label for="mode">Mode</label>
      <select id="mode"></select>
    </div>
    <div class="menu-list">
      <button id="open-skills" type="button">Skills <span id="skill-count" class="count"></span></button>
      <button id="open-changes" type="button">Changes <span id="change-count" class="count"></span></button>
    </div>
  </div>

  <button id="skills-scrim" class="scrim" type="button" hidden aria-label="Dismiss"></button>
  <div id="skills-sheet" class="sheet" hidden role="dialog" aria-label="Skills">
    <div class="sheet-handle" aria-hidden="true"></div>
    <div class="sheet-head">
      <h2 class="panel-title">Skills</h2>
      <button class="sheet-close" type="button" data-close-overlay aria-label="Close">×</button>
    </div>
    <div id="skills" class="skill-list"></div>
  </div>

  <button id="changes-scrim" class="scrim" type="button" hidden aria-label="Dismiss"></button>
  <div id="changes-sheet" class="sheet sheet-changes" hidden role="dialog" aria-label="Changes">
    <div class="sheet-handle" aria-hidden="true"></div>
    <div class="sheet-head">
      <h2 class="panel-title">Changes <span id="change-count-sheet" class="count"></span></h2>
      <button class="sheet-close" type="button" data-close-overlay aria-label="Close">×</button>
    </div>
    <p id="changes-note" class="note" hidden>Accept and Undo wait until the run ends.</p>
    <div id="bulk-change-actions" class="change-actions" hidden>
      <button id="accept-all" type="button">Accept all</button>
      <button id="undo-all" type="button">Undo all</button>
    </div>
    <div id="change-files" class="change-files" hidden></div>
    <div id="change-detail" class="change-detail"></div>
  </div>

  <div id="transcript" class="transcript" aria-label="Transcript"></div>
  <div class="dock">
    <section id="pending" aria-live="polite"></section>
    <div class="composer">
      <p id="run-status" class="run-status" role="status" hidden>
        <span class="spinner" aria-hidden="true"></span>
        <span id="run-status-label" class="activity-dots">Working</span>
      </p>
      <div id="attachments" class="attachments" aria-live="polite"></div>
      <div class="composer-row">
        <div class="pill">
          <input id="file" class="sr-only" type="file" multiple accept="image/*,application/pdf,text/*,.md,.markdown,.csv,.tsv,.json,.jsonl,.txt,.log,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.go,.rs,.java,.kt,.swift,.yml,.yaml,.svg">
          <button id="attach" type="button" aria-label="Attach">+</button>
          <label class="sr-only" for="text">Message</label>
          <textarea id="text" rows="1" placeholder="Message"></textarea>
        </div>
        <button id="send" class="send-circle" type="button" aria-label="Send">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3.4 20.6 21 12 3.4 3.4 3.3 10l11 2-11 2z"/></svg>
        </button>
        <button id="stop" class="send-circle is-stop" type="button" aria-label="Stop" hidden>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 7h10v10H7z"/></svg>
        </button>
      </div>
    </div>
  </div>
</div>
<script>
${markdownBrowser}
${browserSource(browserClient)}
</script>
</body>
</html>`;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// Markers keep the browser script as real source, so its template literals
// are written normally and sent to the page without a second layer of escaping.
function browserSource(fn) {
  const text = fn.toString();
  const marker = "/*__client__*/";
  const start = text.indexOf(marker);
  const end = text.lastIndexOf(marker);
  if (start < 0 || end <= start) throw new Error("Client script is missing.");
  return text.slice(start + marker.length, end).trim();
}

function browserClient() {
  /*__client__*/
  const $ = (id) => document.getElementById(id);
  let state = null;
  let composingNew = false;
  let pendingFiles = [];
  let openOverlay = null;
  let selectedChangePath = null;
  let expandedGaps = new Set();
  let changeDiffScroll = 0;

  const overlays = {
    drawer: { panel: "drawer", scrim: "drawer-scrim", trigger: "menu-open" },
    model: { panel: "model-sheet", scrim: "model-scrim", trigger: "model-open" },
    more: { panel: "more-sheet", scrim: "more-scrim", trigger: "more-open" },
    skills: { panel: "skills-sheet", scrim: "skills-scrim", trigger: null },
    changes: { panel: "changes-sheet", scrim: "changes-scrim", trigger: null },
  };

  function setOverlay(name) {
    openOverlay = name;
    for (const [key, parts] of Object.entries(overlays)) {
      const show = key === name;
      $(parts.panel).hidden = !show;
      $(parts.scrim).hidden = !show;
      if (parts.trigger) $(parts.trigger).setAttribute("aria-expanded", show ? "true" : "false");
    }
  }

  function closeOverlay() {
    setOverlay(null);
  }

  function esc(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  }

  function fileParts(path) {
    return String(path).split(/[/\\]/).filter(Boolean);
  }

  function fileName(path) {
    const parts = fileParts(path);
    return parts.length ? parts[parts.length - 1] : String(path);
  }

  function filePlace(path) {
    const parts = fileParts(path);
    return parts.length > 1 ? parts[parts.length - 2] : "";
  }

  function diffLineHtml(line) {
    let kind = "ctx";
    if (line.startsWith("+++ ") || line.startsWith("--- ")) kind = "meta";
    else if (line.startsWith("@@")) kind = "hunk";
    else if (line.startsWith("+")) kind = "add";
    else if (line.startsWith("-")) kind = "del";
    return `<span class="diff-line diff-${kind}">${esc(line) || " "}</span>`;
  }

  function gapKey(path, index) {
    return `${path}\0${index}`;
  }

  function partsHtml(path, parts) {
    return (parts || []).map((part, index) => {
      if (part.type === "gap") {
        const key = gapKey(path, index);
        if (expandedGaps.has(key)) return part.lines.map(diffLineHtml).join("");
        const count = part.lines.length;
        const label = count === 1 ? "Show 1 surrounding line" : `Show ${count} surrounding lines`;
        return `<div class="diff-gap"><button type="button" data-expand-gap="${index}" data-path="${esc(path)}">${esc(label)}</button></div>`;
      }
      return (part.lines || []).map(diffLineHtml).join("");
    }).join("");
  }

  async function post(path, body) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Request failed.");
    render(payload);
  }

  function selectedSkills() {
    return [...document.querySelectorAll("[data-skill]:checked")].map((box) => box.value);
  }

  function modelName(next) {
    const selected = (next.models || []).find((model) => model.selected);
    return selected?.name || next.model || "Auto";
  }

  function growText() {
    const box = $("text");
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, window.innerHeight * 0.28)}px`;
  }

  function render(next) {
    state = next;
    const running = Boolean(next.running);
    $("error").hidden = !next.error;
    $("error").textContent = next.error || "";
    $("send").hidden = running;
    $("stop").hidden = !running;
    const status = $("run-status");
    const statusLabel = $("run-status-label");
    status.hidden = !running || Boolean(next.pending);
    statusLabel.textContent = next.activity || "Working";
    $("attach").disabled = running;
    $("file").disabled = running;
    $("text").disabled = running;
    renderAttachments();
    const newChatLabel = composingNew ? "Back to chat" : "New chat";
    $("new-chat").hidden = !next.activeWorkspace || (next.sessions.length === 0 && !composingNew);
    $("new-chat").disabled = running;
    $("new-chat-label").textContent = newChatLabel;
    $("new-chat").setAttribute("aria-label", newChatLabel);
    $("new-chat").querySelector("svg").hidden = composingNew;
    $("accept-all").disabled = next.running;
    $("undo-all").disabled = next.running;
    $("bulk-change-actions").hidden = next.changes.length === 0;
    $("changes-note").hidden = !running || next.changes.length === 0;

    const active = next.catalog.find((entry) => entry.path === next.activeWorkspace);
    const title = $("workspace-title");
    title.textContent = active ? active.name : "";
    title.hidden = !active;

    $("model-label").textContent = modelName(next);
    $("model-open").disabled = running || (next.models || []).length === 0;

    $("catalog").innerHTML = next.catalog.map((entry) => {
      const current = entry.path === next.activeWorkspace;
      return `<button type="button" data-workspace="${esc(entry.path)}"${current ? ' aria-current="page"' : ""}>
        <span class="choice-label">${esc(entry.name)}</span>
        ${current ? '<span class="current">Current</span>' : ""}
      </button>`;
    }).join("") || '<p class="empty">Open a folder in Cursor on this PC.</p>';

    $("sessions").innerHTML = next.sessions.map((session) => {
      const current = session.id === next.activeSession;
      return `<button type="button" data-session="${esc(session.id)}"${current ? ' aria-current="page"' : ""}>
        <span class="choice-label">${esc(session.title)}</span>
        ${current ? '<span class="current">Current</span>' : ""}
      </button>`;
    }).join("") || (active ? '<p class="empty">No chats yet.</p>' : "");

    const transcript = composingNew
      ? '<p class="hint">New chat. Send a message to start it.</p>'
      : next.transcript.map((message) => {
        if (message.role === "change") {
          const verb = message.action === "delete"
            ? "Deleted"
            : message.action === "create"
              ? "Created"
              : message.action === "move"
                ? "Moved"
                : "Edited";
          const place = filePlace(message.path);
          return `<button type="button" class="change-mark" data-open-changes data-change-path="${esc(message.path)}" title="${esc(message.path)}">
            <span>${esc(verb)} ${esc(fileName(message.path))}${place ? ` · ${esc(place)}` : ""}</span>
          </button>`;
        }
        const user = message.role === "user";
        const who = user ? "You" : message.role === "assistant" ? "Assistant" : message.role;
        const body = user
          ? `<p class="body">${esc(message.text)}</p>`
          : `<div class="body md">${renderMarkdown(message.text)}</div>`;
        return `<article class="message message-${user ? "user" : "assistant"}">
          <p class="sr-only">${esc(who)}</p>
          ${body}
        </article>`;
      }).join("") || (active ? '<p class="hint">Send a message.</p>' : '<p class="hint">Choose a workspace to begin.</p>');
    const activity = running && !next.pending && next.activity
      ? `<div class="activity" role="status" aria-live="polite">
          <span class="spinner" aria-hidden="true"></span>
          <span class="activity-dots">${esc(next.activity)}</span>
        </div>`
      : "";
    const desktopNote = !composingNew && next.desktopStatus
      ? `<p class="hint desktop-note">${esc(next.desktopStatus.state === "refused"
        ? `Not added to the desktop chat: ${next.desktopStatus.reason}`
        : next.desktopStatus.pending === "accepted"
          ? "Waiting for Cursor on the PC to close before clearing accepted changes there."
          : "Waiting for Cursor on the PC to close before adding this to the desktop chat.")}</p>`
      : "";
    $("transcript").innerHTML = transcript + activity + desktopNote;

    $("mode").innerHTML = next.modes.map((mode) =>
      `<option ${mode === next.mode ? "selected" : ""}>${esc(mode)}</option>`
    ).join("");
    $("mode").disabled = next.running;
    $("model").innerHTML = next.models.map((model) =>
      `<option value="${esc(model.value)}" ${model.selected ? "selected" : ""}>${esc(model.name)}</option>`
    ).join("") || `<option>${esc(next.model)}</option>`;
    $("model").disabled = next.running || next.models.length === 0;
    $("model-list").innerHTML = (next.models.length ? next.models : [{ value: next.model, name: next.model || "Auto", selected: true }]).map((model) =>
      `<button type="button" data-model="${esc(model.value)}"${model.selected ? ' aria-current="true"' : ""} ${next.running ? "disabled" : ""}>
        <span class="choice-label">${esc(model.name)}</span>
        ${model.selected ? '<span class="current">Current</span>' : ""}
      </button>`
    ).join("");

    const pinned = next.skills.filter((skill) => skill.pinned).length;
    $("skill-count").textContent = pinned === 1 ? "1 pinned" : pinned > 1 ? `${pinned} pinned` : "";
    $("skills").innerHTML = next.skills.map((skill) =>
      `<article class="skill">
        <label class="check">
          <input data-skill type="checkbox" value="${esc(skill.name)}">
          <span>
            <span class="sr-only">Attach </span>
            <span class="skill-name">${esc(skill.name)}</span>
            ${skill.description ? `<span class="skill-desc">${esc(skill.description)}</span>` : ""}
          </span>
        </label>
        <label class="check pin">
          <input data-pin type="checkbox" value="${esc(skill.name)}" ${skill.pinned ? "checked" : ""}>
          <span>Pin <span class="sr-only">${esc(skill.name)}</span></span>
        </label>
      </article>`
    ).join("") || '<p class="empty">No skills available.</p>';

    $("pending").innerHTML = pendingMarkup(next);

    const count = next.changes.length;
    const countLabel = count === 1 ? "1 open" : count > 1 ? `${count} open` : "";
    $("change-count").textContent = countLabel;
    $("change-count-sheet").textContent = countLabel;
    $("changes-dot").hidden = count === 0;
    $("more-open").setAttribute("aria-label", count ? `More options, ${countLabel} changes` : "More options");
    const paths = new Set(next.changes.map((change) => change.path));
    expandedGaps.forEach((key) => {
      if (!paths.has(key.split("\0")[0])) expandedGaps.delete(key);
    });
    if (!paths.has(selectedChangePath)) selectedChangePath = next.changes[0]?.path || null;
    const selected = next.changes.find((change) => change.path === selectedChangePath) || null;
    const files = $("change-files");
    files.hidden = count < 2;
    files.innerHTML = next.changes.map((change) => {
      const current = change.path === selectedChangePath;
      return `<button type="button" data-select-change="${esc(change.path)}" title="${esc(change.path)}"${current ? ' aria-current="true"' : ""}>${esc(fileName(change.path))}</button>`;
    }).join("");
    const diffBox = $("change-diff");
    if (diffBox) changeDiffScroll = diffBox.scrollTop;
    if (!selected) {
      $("change-detail").innerHTML = '<p class="empty">No open changes.</p>';
    } else {
      const place = filePlace(selected.path);
      $("change-detail").innerHTML = `
        <h3 title="${esc(selected.path)}"><span class="file-name">${esc(fileName(selected.path))}</span>${place ? ` <span class="file-place">${esc(place)}</span>` : ""}</h3>
        <div id="change-diff" class="diff" role="region" aria-label="Diff for ${esc(fileName(selected.path))}">${partsHtml(selected.path, selected.parts)}</div>
        <div class="change-actions">
          <button type="button" data-change="accept" data-path="${esc(selected.path)}" ${next.running ? "disabled" : ""}>Accept</button>
          <button type="button" data-change="undo" data-path="${esc(selected.path)}" ${next.running ? "disabled" : ""}>Undo</button>
        </div>`;
      const nextDiff = $("change-diff");
      if (nextDiff) nextDiff.scrollTop = changeDiffScroll;
    }

    const box = $("transcript");
    box.scrollTop = box.scrollHeight;
    growText();
  }

  function pendingHeading(kicker, title) {
    const name = title || kicker;
    if (name === kicker) return `<h2>${esc(kicker)}</h2>`;
    return `<p class="eyebrow">${esc(kicker)}</p><h2>${esc(name)}</h2>`;
  }

  function pendingMarkup(next) {
    const pending = next.pending;
    if (!pending) return "";
    if (pending.kind === "command") {
      return `<h2>Pending command</h2>
        <pre class="wrap">${esc(pending.label)}</pre>
        <div class="decision">
          <button type="button" class="primary" data-decision="allow-once">Allow once</button>
          <button type="button" class="reject" data-decision="reject">Reject</button>
          <button type="button" class="quiet" data-decision="allow-session">Allow for the session</button>
        </div>`;
    }
    if (pending.kind === "plan") {
      return `${pendingHeading("Plan", pending.title)}
        ${pending.text ? `<pre class="wrap">${esc(pending.text)}</pre>` : ""}
        <div class="decision">
          <button type="button" class="primary" data-plan="1">Accept</button>
          <button type="button" class="reject" data-plan="0">Reject</button>
        </div>`;
    }
    const questions = (pending.questions || []).map((question) => {
      const options = (question.options || []).map((option) =>
        `<label class="check"><input name="${esc(question.id)}" value="${esc(option.id)}" type="${question.allowMultiple ? "checkbox" : "radio"}"> <span>${esc(option.label || option.id)}</span></label>`
      ).join("");
      return `<fieldset><legend>${esc(question.prompt)}</legend>${options}</fieldset>`;
    }).join("");
    return `${pendingHeading("Agent question", pending.title)}
      ${questions}
      <div class="decision">
        <button type="button" class="primary" id="answer">Answer</button>
        <button type="button" class="quiet" id="skip">Skip</button>
      </div>`;
  }

  document.body.addEventListener("click", async (event) => {
    if (event.target.closest(".scrim") || event.target.closest("[data-close-overlay]")) {
      closeOverlay();
      return;
    }
    const target = event.target.closest("button");
    if (!target) return;
    try {
      if (target.id === "menu-open") setOverlay(openOverlay === "drawer" ? null : "drawer");
      else if (target.id === "model-open") setOverlay(openOverlay === "model" ? null : "model");
      else if (target.id === "more-open") setOverlay(openOverlay === "more" ? null : "more");
      else if (target.id === "open-skills") setOverlay("skills");
      else if (target.id === "open-changes" || target.hasAttribute("data-open-changes")) {
        const path = target.getAttribute("data-change-path");
        if (path && state?.changes?.some((change) => change.path === path)) selectedChangePath = path;
        setOverlay("changes");
        if (state) render(state);
      } else if (target.hasAttribute("data-select-change")) {
        selectedChangePath = target.getAttribute("data-select-change");
        changeDiffScroll = 0;
        render(state);
      } else if (target.hasAttribute("data-expand-gap")) {
        expandedGaps.add(gapKey(target.getAttribute("data-path"), target.getAttribute("data-expand-gap")));
        const diffBox = $("change-diff");
        if (diffBox) changeDiffScroll = diffBox.scrollTop;
        render(state);
      } else if (target.dataset.workspace) {
        composingNew = false;
        closeOverlay();
        await post("/workspace", { path: target.dataset.workspace });
      } else if (target.dataset.session) {
        composingNew = false;
        closeOverlay();
        await post("/session", { id: target.dataset.session });
      } else if (target.dataset.model) {
        closeOverlay();
        await post("/model", { value: target.dataset.model });
      } else if (target.id === "new-chat") {
        composingNew = !composingNew;
        closeOverlay();
        render(state);
      } else if (target.id === "attach") $("file").click();
      else if (target.hasAttribute("data-remove-file")) {
        pendingFiles.splice(Number(target.getAttribute("data-remove-file")), 1);
        renderAttachments();
      } else if (target.id === "send") await sendMessage();
      else if (target.id === "stop") await post("/stop");
      else if (target.dataset.decision) await post("/permission", { decision: target.dataset.decision });
      else if (target.dataset.plan) await post("/plan", { accept: target.dataset.plan === "1" });
      else if (target.dataset.change) await post("/change", { path: target.dataset.path, action: target.dataset.change });
      else if (target.id === "accept-all") await post("/changes", { action: "accept" });
      else if (target.id === "undo-all") await post("/changes", { action: "undo" });
      else if (target.id === "answer") await post("/question", { answers: answers() });
      else if (target.id === "skip") await post("/question", { skip: true });
    } catch (error) {
      $("error").hidden = false;
      $("error").textContent = error.message;
    }
  });

  document.body.addEventListener("change", async (event) => {
    const target = event.target;
    try {
      if (target.id === "mode") await post("/mode", { mode: target.value });
      else if (target.id === "model") await post("/model", { value: target.value });
      else if (target.hasAttribute && target.hasAttribute("data-pin")) {
        await post("/pin", { name: target.value, pinned: target.checked });
      }
    } catch (error) {
      $("error").hidden = false;
      $("error").textContent = error.message;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && openOverlay) {
      closeOverlay();
      event.preventDefault();
    }
  });

  function renderAttachments() {
    $("attachments").innerHTML = pendingFiles.map((file, index) =>
      `<div class="attachment">
        <span title="${esc(file.name)}">${esc(file.name)}</span>
        <button type="button" data-remove-file="${index}" aria-label="Remove ${esc(file.name)}">×</button>
      </div>`
    ).join("");
  }

  async function readFile(file) {
    const buffer = await file.arrayBuffer();
    if (buffer.byteLength > 8 * 1024 * 1024) throw new Error(`${file.name} is larger than 8 MB.`);
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return {
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      data: btoa(binary),
    };
  }

  $("file").addEventListener("change", async (event) => {
    const picked = [...(event.target.files || [])];
    event.target.value = "";
    if (!picked.length) return;
    try {
      if (pendingFiles.length + picked.length > 8) throw new Error("Attach at most 8 files.");
      for (const file of picked) pendingFiles.push(await readFile(file));
      renderAttachments();
    } catch (error) {
      $("error").hidden = false;
      $("error").textContent = error.message;
    }
  });

  async function sendMessage() {
    const text = $("text").value;
    if (!text.trim() && pendingFiles.length === 0) return;
    if (!state || state.running) return;
    const fresh = composingNew || !state.activeSession;
    const files = pendingFiles;
    const skills = selectedSkills();
    const display = optimisticUserText(text, files);
    const previous = state;

    $("text").value = "";
    pendingFiles = [];
    composingNew = false;
    growText();
    render({
      ...previous,
      error: "",
      running: true,
      activity: "Working",
      pending: null,
      transcript: fresh
        ? [{ role: "user", text: display }]
        : [...previous.transcript, { role: "user", text: display }],
    });

    try {
      await post(fresh ? "/prompt" : "/follow-up", { text, skills, files });
    } catch (error) {
      $("text").value = text;
      pendingFiles = files;
      growText();
      render({
        ...previous,
        running: false,
        activity: null,
        error: error.message || "Request failed.",
      });
    }
  }

  function optimisticUserText(text, files) {
    const note = files.length ? `Attached: ${files.map((file) => file.name).join(", ")}` : "";
    const body = text.trim();
    if (body && note) return `${body}\n\n${note}`;
    return body || note;
  }

  $("text").addEventListener("input", growText);
  $("text").addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;
    if ($("send").hidden) return;
    event.preventDefault();
    $("send").click();
  });

  function answers() {
    return (state?.pending?.questions || []).map((question) => ({
      questionId: question.id,
      selectedOptionIds: [...document.querySelectorAll(`[name="${CSS.escape(question.id)}"]:checked`)].map((input) => input.value),
    }));
  }

  const shell = document.querySelector(".app");
  function fitViewport() {
    const viewport = window.visualViewport;
    if (!viewport || !shell) return;
    const keyboard = window.innerHeight - viewport.height > 80;
    shell.style.height = keyboard ? `${viewport.height}px` : "";
    shell.style.transform = keyboard ? `translateY(${viewport.offsetTop}px)` : "";
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", fitViewport);
    window.visualViewport.addEventListener("scroll", fitViewport);
  }

  new EventSource("/events").onmessage = (event) => render(JSON.parse(event.data));
  /*__client__*/
}

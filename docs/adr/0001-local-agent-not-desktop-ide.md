# Drive a local agent, not the desktop IDE

The remote client drives a Cursor agent on this PC through the Agent Client Protocol (`agent acp`). The desktop IDE window can stay open, and it is not the session being controlled. ACP already covers prompts, follow-ups, a streaming transcript, and permission decisions (`allow-once`, `allow-always`, `reject-once`). Scraping the open IDE through a debugging port tracks the on-screen Keep/Undo buttons, and it breaks when that UI changes. The CLI has no checkpoint undo, so accept and undo of file changes will be our own snapshots.

## Considered options

- A debugging-port relay that clicks the open IDE (the CursorRemote approach).
- A local Cursor SDK agent. It auto-approves tool calls, so pending-command approval is a worse fit than ACP, which blocks until the client answers.

## Consequences

- An approval card already visible in the desktop IDE is not something the phone can press.
- Accept and undo are not the IDE's Keep and Undo buttons.

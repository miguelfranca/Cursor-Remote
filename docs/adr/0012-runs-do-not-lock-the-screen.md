# A run does not lock the screen

A run belongs to one session. The operator can open another session, start a new one, or switch workspace while that run continues. Stop, mode, model, accept, and undo apply to the session on screen. A follow-up is refused only when that session already has a run. A command, question, or plan stays on its session and shows when that session is on screen. The chat list and the workspace list show when a session is thinking or waiting.

One `agent acp` process carries every session. Each prompt is addressed by session id. If a question arrives with no session id while several runs are in progress, it stays on a run that is not the one on screen, so it does not cancel the other wait.

## Considered options

- Keep one run for the whole app. That blocks starting another chat, and blocks switching workspace, until the reply finishes.
- One agent process per running chat. The protocol already separates sessions on one connection, so a second process waits until a second prompt fails to run alongside the first.

## Consequences

- Two chats in one workspace share that folder. Each file change stays on the session that made it.
- A workspace with a run in progress still cannot be removed from the catalog.
- Phone and laptop still share one screen. Both follow the workspace and session on screen, and both see the same thinking and waiting marks.

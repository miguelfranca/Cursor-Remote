# Sync changes between the client and the desktop IDE

Changes go both ways. Edits the desktop IDE has left pending in a desktop chat show on the client as normal changes, with the same diff, accept, and undo, whether or not a session continues that chat. Keep or undo in the desktop IDE closes the change on the client, as if it had been answered there. The client reads this from the store all the time, also while the desktop IDE is running. Changes made on the client, and answers given on the client to desktop changes, reach the desktop IDE only while it is not running, in the same write as the session's messages (`0010`).

A change belongs to one conversation: a session or a desktop chat. A session that continues a desktop chat shares one list of changes with it. A file has at most one open change in a conversation, and its baseline is the earliest one from either side. Cursor keeps the content from before the first edit within a chat, and the client already keeps the baseline from the first touch. The two agree when the client reads the desktop change before its own agent touches the file. When the client's agent touches the file first, because the desktop IDE has not saved yet, the earlier desktop baseline replaces the client's once it appears.

A change written into a desktop chat stays open on the client. Either side can answer it. An answer on the client while the desktop IDE is running applies to the file at once and reaches the desktop IDE at the next write. Until then the desktop IDE still shows an accepted change as pending, and an undo there wins, because it writes the baseline back. After an undo on the client, the desktop IDE stops showing the change, because the file matches its baseline again.

A change written from the client into a desktop chat gets two things: an edit message after the exchange where the agent first touched the file, and a pending review row linked to that message.

"Earliest" compares the time the client's agent first touched the file with the time of the desktop edit message that the row points at. If the chat already has a row for the file, the client's write reuses that row and gives it the earlier baseline, so the file still has one change. A change whose exchange is still running waits until that exchange is written, so its edit message never lands before the message that caused it. An answer on the client queues the removal of every row behind that change. The queue is emptied at the next write, and the rows it holds are already left out of the client's list.

On 17 October 2026 this was tried in the second profile, the way `0010` was. Two edit messages were written into a test chat while that IDE was closed, each with its before and after content, a pending review row, and an entry in the chat's `originalFileStates`. The edit was not added to the conversation state the model reads. After opening the IDE, both edits rendered with their diff and were listed as pending. Keep left one file as edited, undo put the other back, both rows were removed, and a follow-up still answered from the earlier text.

## How the desktop IDE stores pending review

Found on 17 October 2026 in the live store, read only, with edits made in this repository's own desktop chat.

- Each pending file is one row in the global store, `inlineDiff:<workspace id>:<diff id>`. It holds the file URI, the file's lines before the edit (`originalTextLines`), and `composerMetadata` with the chat id and the id of the edit tool call. The workspace id is the same one the client uses to find a workspace's desktop chats.
- Keep deletes the row and leaves the file. Undo deletes the row and writes the baseline back, removing a created file. Each answer is also logged as "accepted" or "rejected" under `codeBlockPartialInlineDiffFates:`, which the pending list does not depend on.
- A chat's `originalFileStates`, with its `ofsContent:` rows, holds each file's content from before the chat first edited it. It is not the pending list: it kept both files after keep and undo, and listed 15 files while the IDE showed none pending. It backs checkpoints.
- The running IDE saved new rows, and removed answered ones, 8 to 28 seconds after the edit or answer.
- Writing the baseline back to disk, as an undo on the client does, made the IDE stop showing the change, with no answer logged. Its row stayed in the store. A row alone is not enough to call a desktop change open. The file also has to differ from the row's baseline.
- Edits made with a shell command, not with the agent's edit tool, get no row. The client also only tracks files changed by the agent's edit tools.
- A deletion gets no row either. On 17 October 2026 the agent in the second profile deleted a file with its delete tool. The IDE offered no keep or undo, and saved only a delete message, with the path and the deleted content, plus the file's entry in `originalFileStates`. A deletion in the desktop IDE is final unless a checkpoint is restored, so the client never shows one as an open change. A deletion made on the client is written the same way, a delete message and the `originalFileStates` entry. The client keeps it open with its undo until it is answered on the client.

## Considered options

- Hand a change over to the desktop IDE when it is written. Writes happen whenever the IDE is closed, a few seconds after each exchange, so working on the phone with the IDE closed would move every change off the phone at once.
- Keep changes on the client only, with read-only edit messages in the desktop chat. Changes made on the phone could not be kept or undone on the laptop.
- Only sessions own changes, and opening a desktop chat with pending changes on the client starts a session for it. That adds sessions the operator never started, each with an agent session behind it.
- Use the latest baseline when both sides touched a file. Undo would leave the earlier edit in place without it ever being reviewed.
- Write only the review row, without an edit message. Real rows point at an edit message, and the IDE may not show one that points at nothing.
- Have the client keep the agent's version after an undo, so a later keep in the desktop IDE could put it back. After an undo on the client, the desktop IDE no longer offers that keep.

# Write a session into a desktop chat only while the IDE is closed

A session's messages can be written into the desktop IDE's chat store, and the IDE will continue from that text. The write sticks only while the desktop IDE is not running. Every session is written, including the ones that existed before this was added. One that continued a desktop chat adds its lines at the end of that chat, after whatever the IDE saved, including lines typed there before the quit. One that started on the client becomes a new desktop chat, with the session's title, mode, and model, placed in the list by the time of its last message. The client waits until the operator has closed the IDE, then writes on its own. The client does not quit the IDE, write, and open it again. A button is the same write started by hand, and it still has to refuse while the IDE is open.

On 16 October 2026 this was tried in a second Cursor profile, on a copy of the chat database. The live database was not changed.

- **linden.** A new chat was written while that IDE was closed. After it was opened, the transcript showed the planted lines, and a follow-up repeated the code word.
- **maple.** A turn was appended to that same chat while the IDE was closed, after the IDE had already continued it. A follow-up repeated the new code word.
- **cedar.** The same append was done while that chat was open. The panel did not show the new lines. The open IDE then saved its own copy of the chat, and after it was closed and opened again the cedar lines were gone.

"No agent is running" is not a safe check. Cedar was wiped with no reply in progress. The open IDE holds the chat and writes that copy back over the file.

The client reads desktop chats, both the list and the messages, from the IDE's chat store, not from the transcript copies under `~/.cursor/projects`. Reading the store is safe while the IDE is running; only writing has to wait. The store keeps the order Desktop shows, including written session lines. The copies do not: in the test, the IDE re-emitted the written user lines there only on its next turn, under that turn's timestamp, and dropped the written assistant line. The copies also hold chats started with the `agent` command, which are not desktop chats. A session shows its desktop chat from the store, followed by its lines that are not written yet. The store decides the order. Where a message in the store is one the client wrote, the client shows the session's own line instead, so change markers stay visible.

Only the user line and the assistant reply are written, as the client shows them, with file attachments by name. Change markers, pending commands, agent questions, and plans are not written yet. Desktop stores a file edit as a tool message, and Keep and Undo come from separate review state on the chat. Writing those is a later step, with its own test in the second profile, so that changes made from the phone can be reviewed on the laptop. Text alone was enough for Desktop to continue in the tests.

The client writes only when the stored chat is in the format that was tested: chat record version 18, and a conversation state it can read back field by field. Anything else refuses the write for that session. Its lines stay waiting, and the client shows that the write was refused and why. A Cursor update that changes the format shows up as a refused write, not as a damaged desktop chat. A session with lines not yet written shows that it is waiting for the IDE to close. A fully written session shows nothing extra.

Only finished exchanges are written. One whose run is still going waits until that run ends, or is stopped, and is written then if the IDE is still closed. A desktop chat never holds half a reply.

The client writes into the operator's real Cursor profile from the first version, not into a test profile. "Not running" means that profile's IDE. A second Cursor started with another profile, such as the test one, does not block the write.

During the first live writes, on 17 October 2026, the client saved the rows it was about to replace for each chat into a dated folder under `data`. Those writes looked right in the desktop IDE, so this was removed. The full dated backup of the chat database from 16 October 2026 stays the fallback.

## Considered options

- A button that closes the IDE when it looks idle, writes, and reopens it. Closing the IDE is the operator's action. An open window overwrites the file even when it is idle.
- Write the lines into the transcript files under `~/.cursor/projects`. The IDE does not open a chat from those files. See `0009`.
- Keep reading the transcript copies and also write session lines into them. The IDE re-emits written lines there on its next turn, so they would appear twice.
- Interleave desktop and session lines by time. Session lines have no time, and the transcript copies only have the time of each IDE turn.

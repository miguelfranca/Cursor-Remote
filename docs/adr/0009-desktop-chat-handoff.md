# Continue a desktop chat on the client by copying it

The desktop IDE and the local agent keep separate conversation stores. There is no shared session id, so the phone cannot resume an IDE chat as the same chat. The client therefore lists each desktop chat for the active workspace. Opening one from that list shows its transcript. On the first message from the client, a new agent session starts whose prompt includes the recent desktop conversation. From then on the phone session is the one that continues. Messages on the phone are not written back into the IDE chat. A new or updated desktop chat does not open on the client by itself; the operator picks it from the chat list when they want it.

## Considered options

- Drive the open IDE through a debugging port so the phone presses the same composer. That tracks Keep/Undo in the IDE UI and breaks when that UI changes.
- Write phone replies into the IDE transcript files. Cursor does not support that, and forcing a resume with an IDE chat id can wipe the transcript.
- Auto-open the desktop chat the IDE just wrote to. That steals the client's active session whenever a new chat starts on the PC.

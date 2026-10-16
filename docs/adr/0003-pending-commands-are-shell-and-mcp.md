# Pending commands are shell and MCP calls

Shell commands and MCP calls block until the user allows them once, rejects them, or allows that kind of command for the rest of the session. Reject is the only revoke, and only while the command is still pending. File reads and file edits proceed, and edits show up as changes that can be accepted or undone.

Asking for every file read would turn the phone into an approval queue. Gating shell and MCP covers the actions that leave the workspace or call an external tool. A command that has already run cannot be undone as a command; its file effects are changes.

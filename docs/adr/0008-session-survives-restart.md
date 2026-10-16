# A session survives restart; an in-progress run is stopped

The transcript, past sessions, and open changes are still there after the process on this PC restarts. The client reconnects to the same tailnet address and shows the same session. A run that was in progress is stopped: work already written stays an open change, and a command that had not run is dropped. Resuming a run mid-tool could repeat a shell command or continue from a half-applied edit. Treating it as Stop matches the IDE, and the operator continues with a follow-up.

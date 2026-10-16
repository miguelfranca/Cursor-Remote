# Undo restores a per-file baseline, not git HEAD

A change is one file the local agent wrote during a session, compared with that file's contents from just before the agent first touched it in that session. Accept keeps the agent's version. Undo writes the baseline back. A new session starts with no open changes; leftovers stay on the session that made them.

Git checkout of the last commit would also undo the user's own uncommitted work in that file. Per-file baselines keep that work. The CLI has no checkpoint undo, so the bridge stores the baselines itself.

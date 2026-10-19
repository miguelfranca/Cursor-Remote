# Plan

Build in this order. Each task is usable on the phone before the next one starts. Words match `CONTEXT.md`. Decisions match `docs/adr/`.

The signed-in page, Tailscale, and the Cursor CLI are already done. See `docs/setup.md`. The tasks below are implemented in the client.

## 1. Catalog

The page lists the directories the agent is allowed to run in. The list starts empty. You add and remove directories on this PC, not from the phone. Removing one hides it and keeps its sessions and open changes. You cannot remove a workspace while one of its runs is in progress.

Done when the phone shows only the directories you added, and a directory you have not added cannot be selected.

## 2. Session and transcript

Choosing a workspace opens its active session. A prompt starts a new session and leaves the previous one in the list. A follow-up stays in the active session. The transcript appears on the phone as it is written. The phone and a laptop show the same session.

One stream carries the transcript. Sending a prompt or a follow-up is a request. The PC applies it once.

Done when you send a prompt from the phone, watch the reply arrive, send a follow-up, and see that same transcript on a second browser.

## 3. Stop, and a restart

Stop ends the run. A command, question, or plan that was still waiting is dropped. The transcript stays. After the process on this PC restarts, the session and transcript are still there. A run that was in progress is stopped.

Done when Stop on the phone halts a running reply, and a restart of `npm start` still shows that session.

## 4. Pending commands

Shell commands and MCP calls wait. File reads and file edits do not. Allow once runs one command and asks again next time. Reject drops it before it runs. Allow for the session remembers that exact command line, or that exact MCP tool call, until the session ends. A different command asks. The first answer from the phone or the laptop is the one that counts.

Done when `npm test` waits on the phone, a second different command still waits, and the same `npm test` later in that session does not.

## 5. Agent questions and plans

An agent question waits until you pick an option or skip it. A plan waits until you accept or reject it. Rejecting a plan does not stop the run.

Done when a question and a plan from the agent both block on the phone, and rejecting the plan lets the run continue.

## 6. Changes

A change is one file the agent wrote in that session, compared with that file just before the agent first touched it. You can read the difference while the run is going. Accept and undo wait until the run is idle. Undo puts the path back, including removing a created file or restoring a deleted one. Accept keeps the agent's version. Accept all and undo all cover every open change in the session. A new session starts with no open changes. Leftovers stay on the session that made them.

Done when you can read a diff during a run, then accept one file and undo another after the run is idle, including a file the agent created and a file it deleted.

## 7. Mode and model

A session is agent, plan, or ask. Plan and ask do not create changes and do not raise pending commands. A new session starts on Auto. You change mode or model only while the session is idle. A follow-up keeps both.

Done when an ask-mode prompt does not edit files, and a follow-up keeps the model you picked.

## 8. Skills

You can attach a skill to one prompt or follow-up, or pin it for the rest of the session. With neither, the agent may still apply a skill it judges relevant. The list is the skills already on this PC, from your user skills and from the workspace.

Done when a skill attached to a prompt is absent from the next follow-up, and a pinned skill is still on that follow-up.

## 9. Past sessions

Each workspace keeps its past sessions. You can open one while another run is in progress. Opening it shows its transcript and its open changes.

Done when a new prompt leaves the old session readable, and reopening the old one still offers its open changes.

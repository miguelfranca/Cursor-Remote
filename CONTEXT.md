# Remote control

Driving a Cursor agent that runs on this PC, from another device on the home network or over Tailscale.

## Language

**Local agent**:
The Cursor agent running on this PC against a project directory, separate from any chat open in the desktop IDE.
_Avoid_: IDE chat, cloud agent, window

**Desktop IDE**:
The Cursor application left open on this PC. It does not own the session the remote client drives.
_Avoid_: Cursor, the agent

**Session**:
One conversation with a local agent on the client.
_Avoid_: chat tab, thread, desktop chat

**Desktop chat**:
A conversation in the desktop IDE's chat list for a workspace. A chat started with the `agent` command is not a desktop chat.
_Avoid_: IDE transcript, composer, session

**Workspace**:
A project directory on this PC that a local agent runs against.
_Avoid_: repo, project, folder

**Prompt**:
The user message that starts a session.
_Avoid_: new chat, task

**Follow-up**:
A user message sent into a session that already exists, or into a desktop chat the client is continuing.
_Avoid_: reply, another prompt

**Run**:
The work a session does after a prompt or follow-up, until it finishes or is cancelled.
_Avoid_: turn, job, task

**Change**:
One file an agent wrote during a session or a desktop chat, compared with that file's contents from just before an agent first touched it in that conversation. It stays open until it is accepted or undone. The transcript shows when that first touch happened.
_Avoid_: diff, hunk, edit, pending command

**Accept**:
Keeping the agent's version of a change, so that change is no longer open.
_Avoid_: keep, approve

**Undo**:
Putting a change's path back to how it was before an agent first touched it in that conversation, removing a created file or writing a deleted file back, so the change is no longer open.
_Avoid_: reject, revert, discard

**Pending command**:
A shell command or MCP call the agent will not perform until the user answers.
_Avoid_: approval card, tool call, change

**Allow once**:
Running this pending command, and asking again the next time the same kind of command comes up.
_Avoid_: approve, yes

**Reject**:
Refusing a pending command. This is the only revoke, and it applies only while the command is still pending.
_Avoid_: revoke, deny, undo

**Allow for the session**:
Letting that exact shell command line, or that exact MCP tool call, run again for the rest of this session without asking. A different command asks. A new session forgets it.
_Avoid_: allow always, allowlist, yolo

**Skill**:
An instruction pack on this PC, from the user or from the workspace, that the agent can follow.
_Avoid_: slash command, mode, rule

**Attachment**:
A skill applied to one prompt or one follow-up.
_Avoid_: invocation, slash, file attachment

**File attachment**:
A document or image included on one prompt or one follow-up.
_Avoid_: upload, resource, attachment

**Pinned skill**:
A skill that stays applied for the rest of the session.
_Avoid_: custom mode, sticky mode

**Transcript**:
The message list of a session.
_Avoid_: chat history, log

**Client**:
The single interface a person uses to drive the local agent from a phone or another computer.
_Avoid_: app, Android app, remote mode

**Tailnet**:
The private network of this person's devices joined with Tailscale.
_Avoid_: VPN, home network, LAN

**Operator**:
The person whose Tailscale login may use the client.
_Avoid_: user, admin, anyone on the tailnet

**Agent question**:
A multiple-choice question the agent asks during a run. The run waits until the operator picks an option or skips it.
_Avoid_: prompt, pending command

**Plan**:
A proposal the agent asks the operator to accept or reject before continuing the run. Rejecting it does not stop the run.
_Avoid_: todo, spec

**Catalog**:
The directories on this PC that a local agent may run in. Every folder the desktop IDE has opened is listed, and a directory can also be added on this PC.
_Avoid_: file browser, any folder

**Stop**:
Ending a run before it finishes. The transcript stays, and files the agent already wrote stay open changes.
_Avoid_: cancel, abort, revoke

**Mode**:
A session's agent, plan, or ask setting. Plan and ask are read-only.
_Avoid_: custom mode, pinned skill

**Model**:
The Cursor model a session runs on. A new session starts on Auto.
_Avoid_: engine, LLM

## Relationships

- A **Desktop IDE** may be open while a **Local agent** is running. They do not share a **Session**.
- A **Desktop chat** belongs to one **Workspace**. The **Client** lists it with that workspace's **Sessions**. It does not become the active conversation until the operator opens it from that list.
- Continuing a **Desktop chat** on the **Client** starts a **Session** that already knows that conversation. A **Desktop chat** receives that **Session**'s messages only while the **Desktop IDE** is not running. The **Client** does this on its own. The **Client** does not close the **Desktop IDE**.
- Every **Session** is written into a **Desktop chat**. One that continued a **Desktop chat** adds its messages at the end of that chat, after whatever the **Desktop IDE** saved. One that started on the **Client** becomes a new **Desktop chat**.
- What a **Desktop chat** receives is the text of each **Prompt** or **Follow-up** and its reply, with **File attachments** shown by name, and the **Session**'s open **Changes**, each shown where the agent first touched the file. **Pending commands**, **Agent questions**, and **Plans** are not written.
- A **Desktop chat**'s open **Changes** show on the **Client** like any other **Change**, whether or not a **Session** continues that chat. **Accept** and **Undo** work on them there.
- An **Accept** or **Undo** in the **Desktop IDE** counts as the same answer on the **Client**, even while the **Desktop IDE** is running. The **Desktop IDE**'s Keep is an **Accept**.
- An **Accept** or **Undo** on the **Client** reaches the **Desktop IDE** only while it is not running. Until then the **Desktop IDE** may still show that **Change** as open. After an **Undo** on the **Client** it no longer does, because the file matches its baseline again.
- A **Change** written into a **Desktop chat** stays open on the **Client** too. Either side can answer it. **Undo** in the **Desktop IDE** of a file the phone created leaves that file empty. **Undo** on the phone still removes it. **Undo** in the **Desktop IDE** of a file the desktop agent created removes it.
- A **Change** from the **Desktop IDE** is open only while the file still differs from its baseline.
- Only a finished exchange is written. A **Run** in progress is written after it ends or is stopped, if the **Desktop IDE** is still not running.
- If a **Desktop chat** is not in a form the **Client** recognises, the write is refused. The **Session**'s messages stay waiting, and the **Client** shows why.
- A **Session** with messages not yet written shows that it is waiting for the **Desktop IDE** to close. A refused write shows the reason. A fully written **Session** shows nothing extra.
- A conversation with a **Change** accepted on the **Client** that the **Desktop IDE** still shows as pending also shows that it is waiting for the **Desktop IDE** to close. An **Undo** on the **Client** shows nothing extra, because the **Desktop IDE** stops showing that **Change** once the file is back to its baseline.
- A **Session** linked to a **Desktop chat** shows that chat, then the **Session**'s messages that are not written into it yet. Its own messages always show as they are in its **Transcript**, including where **Changes** happened, even after they are written.
- Exactly one **Workspace** is active at a time.
- A **Workspace** is a directory in the **Catalog**. The client cannot activate a directory outside the catalog.
- The **Catalog** lists every folder the **Desktop IDE** has opened, and any directory added on this PC. The client cannot activate a directory outside the catalog. A folder opened in the **Desktop IDE** is listed again if it was removed.
- Removing a **Workspace** from the **Catalog** hides it from the **Client**. Its **Sessions**, **Transcripts**, and open **Changes** remain, and adding it back shows them again.
- A **Workspace** with a **Run** in progress cannot be removed from the **Catalog**.
- A **Workspace** keeps its past **Sessions**. Exactly one of them is on screen.
- A **Prompt** starts a **Session** and makes it the one on screen. The previous **Session** stays readable, including while a **Run** is in progress.
- A **Follow-up** belongs to the **Session** on screen. It is refused while that **Session**'s **Run** is in progress.
- A **Run** belongs to one **Session**. Opening another **Session**, or another **Workspace**, does not stop it. The **Client** shows that a **Session** or **Workspace** is thinking, or waiting for an answer.
- A **Session** has one **Mode**. It can be changed only while that **Session**'s **Run** is not in progress, and a **Follow-up** keeps it.
- A **Session** has one **Model**. A new **Session** starts on Auto. The model can be changed only while that **Session**'s **Run** is not in progress, and a **Follow-up** keeps it.
- In plan or ask **Mode**, a **Run** does not create **Changes** and does not raise **Pending commands**.
- **Stop** ends the **Run** of the **Session** on screen. A **Pending command**, **Agent question**, or **Plan** that was still waiting on that **Run** is dropped. Open **Changes** already made stay open. That **Session** is then idle. Another **Run** keeps going.
- A **Workspace**'s **Sessions**, their **Transcripts**, and their open **Changes** survive a restart of the process on this PC. A **Run** that was in progress at the restart is stopped.
- A **Change** belongs to exactly one **Session** or **Desktop chat**. A **Session** that continues a **Desktop chat** shares its **Changes** with that chat. A new **Session** that continues nothing starts with no open changes.
- A file has at most one open **Change** in a conversation. When both sides touched it, its baseline is the earliest one.
- Open **Changes** stay on the **Session** that made them when another **Session** becomes active.
- **Accept** and **Undo** apply to one **Change**, or to every open **Change** of a **Session** or **Desktop chat**.
- An open **Change** can be read during a **Run**, including its difference from the baseline. **Accept** and **Undo** apply only while that **Session**'s **Run** is not in progress.
- The **Transcript** marks when the agent first touches a file that becomes a **Change**, so the history shows where edits happened in the conversation.
- **Undo** of a created file removes it. **Undo** of a deleted file writes the previous contents back. **Accept** keeps the creation or the deletion.
- A **Pending command** belongs to a **Run**. File reads and file edits are not pending commands. A file edit is a **Change**.
- **Allow once**, **Reject**, and **Allow for the session** are the answers to a **Pending command**.
- **Allow for the session** matches one shell command line, or one MCP tool call with the same tool and the same arguments. It lasts until that **Session** ends.
- A command that has already run cannot be rejected. File effects of a run are **Changes**.
- A **Session** has one **Transcript**.
- A **Prompt** or **Follow-up** may have **Attachments**. An attachment applies to that message only.
- A **Prompt** or **Follow-up** may have **File attachments**. A file attachment applies to that message only.
- A **Pinned skill** applies to later messages in that **Session** until it is unpinned.
- With no attachment and no pinned skill, the agent may still apply a **Skill** it judges relevant.
- There is one **Client**. It may be open on a phone and a laptop at the same time, and both show the same **Session**.
- The first answer to a **Pending command**, an **Agent question**, or a **Plan** is the one that counts. The other open client shows that answer.
- Every open **Client** shows the **Session** as it changes, including **Transcript** text as it is written. An action is applied once, and every open client then shows the result.
- The **Client** has one address on the **Tailnet**. That address works at home and away.
- A device that is not on the **Tailnet** cannot open the **Client**.
- The **Client** accepts the **Operator** only. A different tailnet login cannot use it.
- An **Agent question** belongs to a **Run**. The run waits until it is answered or skipped.
- A **Plan** belongs to a **Run**. The run waits until it is accepted or rejected. Rejecting a **Plan** does not stop the run.

## Example dialogue

> **Dev:** "The approval card is sitting in the desktop IDE. Can the phone press it?"
> **Domain expert:** "No. The phone talks to the **Local agent**'s **Session**. The **Desktop IDE** is a separate conversation."
>
> **Dev:** "Can two workspaces run at once?"
> **Domain expert:** "Yes. One **Workspace** is on screen. A **Run** in another **Workspace** keeps going. Switch there, send a message, and switch back. The list shows which one is thinking, or waiting for an answer."
>
> **Dev:** "The refactor is done. I want an unrelated change in the same workspace."
> **Domain expert:** "Send a **Prompt**. That starts a new **Session**. The refactor **Session** stays in the list, and you can open it while the new **Run** is in progress. A **Follow-up** would have continued the refactor instead, and waits until that **Session**'s **Run** is idle."
>
> **Dev:** "`api.ts` already had my edits. The agent changed `api.ts` and `readme.md`. I undo only `api.ts`, then start a new session."
> **Domain expert:** "`api.ts` goes back to your edits. `readme.md` stays an open **Change** on the old **Session**. The new **Session** starts with no open changes. Reopen the old one to **Accept** or **Undo** `readme.md`."
>
> **Dev:** "The agent wants to read twenty files, edit three, and run `npm test`. Then it wants `curl | sh`."
> **Domain expert:** "The test is a **Pending command**. **Allow once** runs it and the next test asks again. The three edits are **Changes**. **Reject** the `curl | sh` before it runs. The test that already ran stays run."
>
> **Dev:** "I attach grill-with-docs to this prompt and I don't pin it. The follow-up is 'also cover the API'."
> **Domain expert:** "That **Attachment** is only on the **Prompt**. The **Follow-up** does not include it. A **Pinned skill** would have stayed on. A **Skill** the agent judges relevant can still apply when you attached nothing."
>
> **Dev:** "I'm on the couch, then I leave the house. Do I change address?"
> **Domain expert:** "No. The **Client** has one address on the **Tailnet**. A device off the tailnet cannot open it."
>
> **Dev:** "My partner's phone is on the tailnet. Can they open the client?"
> **Domain expert:** "No. Only the **Operator**'s Tailscale login can. Theirs is refused."
>
> **Dev:** "The agent asks which test runner, then shows a plan I don't want."
> **Domain expert:** "The **Agent question** waits until you pick or skip. The **Plan** waits until you accept or reject it. Rejecting the plan lets the **Run** continue without that plan."
>
> **Dev:** "I started a prompt on the phone. The laptop is open too, and both show a pending command."
> **Domain expert:** "Allow it on the laptop. That answer counts. The phone shows the command as allowed."
>
> **Dev:** "Can I point the agent at `~/.ssh` from the phone? I never opened it in the IDE."
> **Domain expert:** "No. The **Catalog** lists folders the **Desktop IDE** has opened, and directories added on this PC. A path that is neither is not listed."
>
> **Dev:** "I was chatting in the **Desktop IDE**. I open the phone."
> **Domain expert:** "That **Desktop chat** is in the list. Open it from **Chats**, then send a **Follow-up**. A **Session** continues it on the phone. The **Desktop chat** on the PC gets those new messages once the **Desktop IDE** is closed."
>
> **Dev:** "The agent in the **Desktop IDE** edited `notes.txt` and I left it pending. Later the phone's agent edits `notes.txt` again in the same conversation."
> **Domain expert:** "It is one open **Change**. Its baseline is `notes.txt` from before the desktop edit, so **Undo** removes both edits. Keep it in the **Desktop IDE** and the phone stops showing it."
>
> **Dev:** "The **Desktop IDE** is open. I accept `api.ts` on the phone."
> **Domain expert:** "The phone stops showing it. The **Desktop IDE** still shows it as open until you close it. If you undo it there first, that **Undo** counts, and the phone treats it as undone."
>
> **Dev:** "The agent is editing the wrong files and `npm test` is waiting. I hit Stop, like in the IDE."
> **Domain expert:** "**Stop** ends the **Run**. The test never runs. The edits already written stay open **Changes**, and the **Transcript** stays. You can **Undo** those changes, then send a **Follow-up**."
>
> **Dev:** "The phone and the laptop are both open while the agent is writing."
> **Domain expert:** "Both show the **Transcript** as it is written. **Stop** on the phone is applied once. The laptop shows the **Run** has stopped."
>
> **Dev:** "The process restarted while a run was half done, with two files edited and `npm test` waiting."
> **Domain expert:** "The **Session** and the **Transcript** are still there. Those files are still open **Changes**. The **Run** is stopped, so the test did not run. Send a **Follow-up**."
>
> **Dev:** "I allowed `npm test` for the session. It wants `npm test` again, then `git push`."
> **Domain expert:** "The same `npm test` runs without asking. `git push` is a new **Pending command**. A new **Prompt** starts a session that has forgotten `npm test`."
>
> **Dev:** "I want to understand auth before anything edits files."
> **Domain expert:** "Set the **Mode** to ask and send a **Prompt**. It does not create **Changes** or **Pending commands**. Switch to agent while idle, then send a **Follow-up** to implement the fix."
>
> **Dev:** "This refactor should use a specific model. The next new chat should not stay on it."
> **Domain expert:** "Switch the **Model** while the **Session** is idle. The **Follow-up** keeps it. A new **Prompt** starts on Auto."
>
> **Dev:** "The agent added `auth.test.ts` and deleted `legacy.ts`. I undo only the test file."
> **Domain expert:** "`auth.test.ts` is removed. `legacy.ts` stays deleted until you **Undo** that **Change** too. **Accept** would have kept the new file, or kept `legacy.ts` deleted."
>
> **Dev:** "The agent has already edited `a.ts` and the run is still going. Can I undo it?"
> **Domain expert:** "You can read the **Change**. **Undo** waits until the **Run** is idle, so the agent is not about to write `a.ts` again."
>
> **Dev:** "Notes has an open change. I remove it from the catalog, then add it back tomorrow."
> **Domain expert:** "The phone hides it. The **Session** and the open **Change** stay. Adding it back shows them again. You cannot remove it while a **Run** is in progress."

## Flagged ambiguities

- "current" means the active **Workspace** and its active **Session**. Its **Transcript** is what you read, on that **Session**'s **Model** and **Mode**.

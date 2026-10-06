# Collaboration Protocol — FRC Scouting Platform

**Purpose:** hand this file to Claude at the start of every session, alongside `frc-scouting-app-spec.md`. It tells Claude how to behave, tells you how to answer efficiently, and defines the rules for the build phase. It exists to stop us re-negotiating process every time and to keep token usage low across what will be a long project.

**Version:** 1.3 · **Created:** 2026-08-12 · **Updated:** 2026-08-31 (section 11 rewritten for the `develop`/`main` branch model; CI rule added to section 8)

---

## 1. Files and source of truth

| File | Role |
|---|---|
| `frc-scouting-app-spec.md` | The living specification. The single source of truth for all requirements and decisions. |
| `COLLABORATION.md` | This file. Process rules. Rarely changes. |
| `IMPLEMENTATION-PLAN.md` | Generated at the end of the spec phase. Task-by-task build plan for Claude Code. |
| `SPEC-FINAL.md` | Generated at the end of the spec phase. The distilled spec — decisions only, no questions, no rejected alternatives. This is what Claude Code reads. |
| `CLAUDE.md` | Auto-loaded by Claude Code every session. Deliberately short — it points at the other files. See section 10. |

**Which surface am I on?** The rules below are written for the web/desktop **Chat** tab, where files are uploaded and downloaded. If you're working in **Claude Code** (desktop Code tab or CLI), read **section 10** — several of these rules change, mostly for the better.

**The uploaded spec file is always the source of truth.** Claude's sandbox filesystem is wiped between sessions, so it has no memory of the file except what you upload. This creates one real risk:

> **Version drift.** If you upload an older copy of the spec, Claude will silently work from stale decisions and you will lose closed topics.

Rule: after every session, download the updated spec and **overwrite** your local copy immediately. Keep exactly one canonical copy. If you use git (recommended — see section 6), commit it.

---

## 2. Standing instructions for Claude

Claude: follow these for the entire project unless I override them in the moment.

**Communication**

1. Be terse. No preamble, no recap of what I just said, no restating the document back to me.
2. Give **one recommendation**, not a trade-off table. Only expand into alternatives if I write `?` or `why?`, or if the decision is genuinely irreversible.
3. Never reprint sections of the spec in chat. Patch the file and show a **change summary of five lines or fewer**.
4. Don't ask permission to make an edit I've already asked for. Make it, then summarise.
5. If I ask a question that's already decided in the spec, say "decided in Topic N" in one line — don't re-argue it.

**Spec discipline**

6. Every requirement I give you gets processed the same way: analysed, restated precisely, added to the correct topic, with any follow-up questions numbered.
7. **Raise omissions proactively.** If I'm forgetting something that will hurt later, say so even if I didn't ask. Mark it `[RAISED BY ME]` in the file. This is the main thing I want from you — I will forget things.
8. Distinguish clearly between *my confirmed requirements*, *your proposals*, and *open questions*. Never quietly promote a proposal into a requirement.
9. When a topic closes: set its status to CLOSED, move proposals into confirmed requirements, add a row to the Decision Log **with the rationale**, and add a row to the Change History.
10. Flag contradictions immediately. If a new answer conflicts with a closed decision, stop and tell me before editing.

**Build discipline**

11. Write no application code until `SPEC-FINAL.md` and `IMPLEMENTATION-PLAN.md` exist and I've approved both.
12. Never claim something works without having run it and seen the output.
13. Prefer boring, well-documented technology over clever solutions. Students will maintain this after me.

---

## 3. How I answer questions

Questions in the spec are numbered `Q<topic>.<n>`. I answer in shorthand — no sentences needed. Claude: treat these as complete, unambiguous answers.

| I write | It means |
|---|---|
| `Q3.1 A` | Pick option A |
| `Q3.2 y` / `Q3.2 n` | Yes / no |
| `Q3.3 all except photo, timer` | Accept the list minus those items |
| `Q9.2 you pick` | Use your recommendation. Log it in the Decision Log as decided-by-Claude with the rationale. |
| `Q7.4 ?` | Explain more before I decide. Give me the short version. |
| `Q12.1 later` | Park it. Move to a "parked" list, don't ask again. |
| `Q16.2 skip` | Out of scope permanently. Remove from the live questions. |
| `Q14.1 nice` | Confirmed wanted but out of current scope — move to the **Nice-to-have** list (spec §24). Distinct from `later` (timing undecided) and `skip` (never). |
| `Q5.3 y but only for leads` | Yes with a modifier — apply it and restate the modified requirement in one line. |

I'll batch answers. One message with eight answers, not eight messages.

---

## 4. Session discipline

**Why:** every message re-transmits the whole conversation, so a long thread gets expensive fast — message 60 costs many times message 5. The spec file carries the context instead, so starting fresh is nearly free.

**Rule: a new chat every 2–3 topics, or whenever the thread starts feeling long.** In Claude Code the equivalent is `/clear` — see section 10.4.

**Session opener — paste this into a new chat with both files attached:**

```
Attached: frc-scouting-app-spec.md (source of truth) and COLLABORATION.md
(process rules — follow them for this whole session).

Today we are closing Topic __ [and Topic __].

Read those topics and COLLABORATION.md section 2. Then ask me your open
questions for them, batched in one message, most-blocking first.
Don't summarise the spec back to me.
```

**Session closer — paste this before you leave:**

```
Wrap up: apply all decisions from this session to the spec, update the
status table, Decision Log and Change History, then give me the file.
List in five lines or fewer: topics closed, decisions logged, and what's
still open in the topics we touched.
```

---

## 5. Token budget rules

**Do**

- Reference by number: "Topic 9.2, layer 1" — never paste the paragraph.
- Upload the spec once per session, at the start. Not again.
- Batch answers and batch questions.
- Turn extended thinking **off** for confirmations and simple yes/no's; **on** for architecture forks (data model, sync strategy, anything irreversible).
- Say `you pick` freely on low-stakes questions. Deciding costs tokens; delegating doesn't.

**Don't**

- Don't ask Claude to print the spec, or any section of it.
- Don't paste long logs, code, or documents unless the answer actually depends on them. Paste the relevant 20 lines.
- Don't let Claude write long explanatory replies — if it's over-explaining, say `terser`.
- Don't re-litigate closed decisions. If you change your mind, say `reopen Topic N` so it's handled deliberately and logged.
- Don't use web search, image search or other tools during spec work. They add context for no benefit here.

**Also put section 2's communication rules into Settings → User Preferences** so they apply automatically to every chat and you don't spend tokens restating them.

---

## 6. Reviewing Claude's edits (how to check its work)

You should be able to audit every change without paying for it in chat.

**Mechanism 1 — Change History section in the spec.** Every edit is logged there with version, date, and which sections changed. Read it first; it tells you where to look.

**Mechanism 2 — git on your machine (recommended, and mandatory once you're in Claude Code).** Keep the spec in a local repo:

```bash
mkdir frc-scouting && cd frc-scouting && git init
# drop the spec in, then after every session:
git add -A && git commit -m "spec: close topic 7 (offline sync)"
git diff HEAD~1            # exactly what changed, line by line
git log --oneline           # the whole history
```

This gives you a real, free, precise diff — the thing you're actually asking for — costs zero tokens, and doubles as the repo the app will be built in later.

**Mechanism 3 — ask for a diff file.** In-session you can say: `give me a diff file of this session's changes`. Claude writes the diff to a separate small file you open yourself. Costs almost nothing because it isn't printed in the conversation.

**Mechanism 4 — Claude Code's visual diff review.** In the desktop Code tab every edit is presented as a reviewable diff before or after it's applied. This is the best option available; if you're using Claude Code, this replaces mechanisms 1–3 for day-to-day review (keep the Change History anyway, as the human-readable record of *why*).

**Do not** ask Claude to print changes in chat as a review mechanism. That's the expensive way to get the same information.

---

## 7. Handoff to Claude Code

When all topics are CLOSED:

1. Ask for `SPEC-FINAL.md` — decisions only. No questions, no rejected alternatives, no "[RAISED BY ME]" notes, no trade-off discussion. Claude Code should read conclusions, not the negotiation. Expect roughly a third the length.
2. Ask for `IMPLEMENTATION-PLAN.md` — phase 1 only, broken into small tasks, each with exact file paths, the actual code, the test, the command to run, expected output, and a commit. No placeholders, no "add error handling as appropriate".
3. Keep `frc-scouting-app-spec.md` as the archive. It's where the *why* lives, and future-you will want it.
4. In Claude Code: use **plan mode** (`Shift+Tab` twice) before each task, execute **one task at a time**, review the diff, run the tests, commit. Don't let it run five tasks unattended — reviewing 400 lines of unfamiliar code is harder than reviewing five lots of 80.

---

## 8. Development process rules

For the build phase. These are non-negotiable defaults; override deliberately, not by accident.

1. **Git from the first commit.** Small commits, one per task, message describing behaviour not files.
2. **A separate development Supabase project.** Never test destructive features against real competition data. Especially "delete form".
3. **Migrations live in the repo** and are applied by CLI. Never hand-edit the production schema in the Supabase dashboard — the schema must be reproducible from the repo alone.
4. **Tests where it hurts most:** the metric engine (wrong numbers are worse than no numbers) and the offline sync protocol (impossible to debug at a venue). Everything else is negotiable.
5. **The offline path gets tested with the network actually off**, on a real phone, before any event. Not assumed.
6. **Nothing ships to an event untested by a real scouter.** Give a student 10 matches of practice data to enter and watch them do it without helping.
7. **Export before every event.** One-click backup of the season's data, saved somewhere off-platform. A weekend of scouting must never be recoverable only from one Supabase project.
8. **Secrets discipline.** Service-role keys and external API keys exist only in the server's environment variables. Never in the client, never in the repo.
9. **Verify before claiming done.** Run the command, read the output, then say it works.
10. **CI is the gate on `main`.** Every push to `develop` runs lint, typecheck, the unit tests and a build of both apps; a pull request into `main` does not merge unless that run is green. The two test suites that are not optional are the **metric engine** and the **offline sync/conflict protocol** — see spec §18.1.

---

## 9. Known project-specific gotchas

Carry these forward; they're easy to forget and expensive to discover late.

- **Venue connectivity is effectively zero.** Offline is the normal operating mode at a competition, not an edge case. Design and test accordingly.
- **Form versions are immutable.** Editing a form with existing data creates a new version; old entries stay bound to the old one.
- **Field keys are permanent.** Labels can change freely, keys never.
- **Semantic field metadata cannot be backfilled.** Nobody will go back and describe 80 fields across past seasons. It has to be captured at field-creation time.
- **Dead robots must not record zeros.** A no-show or breakdown needs an explicit status, or it silently destroys that team's averages.
- **Duplicate scouting of the same (team, match)** needs a defined resolution rule before any average is computed.
- **RTL/Hebrew, if needed, must be designed in from the start.** Retrofitting touches every component, table and chart axis.
- **The keep-alive does not prevent every Supabase pause.** Production was paused on 2026-10-05, four days after a green run. When the keep-alive fails with `"database":"error"` and the project's `<ref>.supabase.co` does not resolve, the project is paused (or deleted): restore it in the Supabase dashboard, then re-run `gh workflow run keepalive.yml`.
- **Handover.** Accounts (Vercel, Supabase, TBA key) should belong to the team, not to a student who graduates.


---

## 10. Working in Claude Code

Claude Code is the same model with direct access to your project folder. It is the better environment for this project once the repo exists, because the file is on disk rather than being passed back and forth. **The version-drift risk in section 1 disappears entirely.**

### 10.1 Which surface

| Surface | What it is | Use it for |
|---|---|---|
| **Desktop app → Code tab** | Claude Code with a GUI: project file tree, visual diff review, integrated terminal, parallel sessions, live preview. No terminal skills required. | **Default choice.** Especially for reviewing changes, which is exactly what you asked for. |
| **CLI (`claude` in a terminal)** | The same agent, terminal-native. | Scripting, SSH to a remote machine, or if you simply prefer the terminal. |
| **Desktop app → Chat tab** | Ordinary claude.ai chat. No file access. | Pure discussion with no repo involved. |

The desktop Code tab and the CLI are the same underlying tool and interoperate — a CLI session can be moved into the desktop app with `/desktop`. Pick on preference, not capability. Claude Code requires a Pro, Max, Team or Enterprise plan.

### 10.2 Setup, once

```bash
mkdir frc-scouting && cd frc-scouting && git init
mkdir -p docs/spec
# place frc-scouting-app-spec.md and COLLABORATION.md in docs/spec/
# place CLAUDE.md at the repo root
git add -A && git commit -m "docs: spec and process files"
```

Then open that folder in the desktop app's Code tab (or run `claude` inside it).

### 10.3 CLAUDE.md is how instructions get loaded

Claude Code automatically reads `CLAUDE.md` from the project root at the start of every session. That means **you never paste process rules again** — put a short pointer file at the root and it's applied for free, forever.

Keep `CLAUDE.md` short. It is re-sent on every single session, so a bloated one is a permanent tax. It should point at this file rather than duplicate it.

### 10.4 Context discipline in Claude Code

The habits are different from chat, but the principle is the same — context is the budget.

- **`/clear` between topics.** This is the direct equivalent of "start a new chat". Use it liberally: after closing a topic, after finishing a task, any time you change subject. It's the highest-impact habit in Claude Code.
- **`/compact` when a session must continue** but is getting long. Prefer `/clear` where possible; compaction loses detail.
- **Watch the context indicator** and clear before it gets tight rather than after.
- **Name file paths explicitly.** "Update section 7 of docs/spec/frc-scouting-app-spec.md" costs far less than "update the spec", which may make Claude search the repo to find it.
- **Don't let it explore.** Broad `grep`/`find` across a large repo burns context fast. If you know where something is, say so.
- **One task per session** during the build phase. Task, review, commit, `/clear`.

### 10.5 Plan mode

Before any non-trivial edit, use plan mode: press `Shift+Tab` twice, or type `/plan`. Claude can then read and analyse but not modify anything until you approve the plan. Start a session in plan mode with `claude --permission-mode plan`.

Rule for this project: **plan mode before every build task.** Read the plan, correct it, then let it execute. Correcting a plan is cheap; correcting 300 lines of written code is not.

### 10.6 The review loop

For each task in `IMPLEMENTATION-PLAN.md`:

1. `/clear`
2. Plan mode. State the single task and the files it should touch.
3. Read the plan. Push back if it's touching files it shouldn't, or inventing scope.
4. Approve. Let it execute one task only.
5. Review the diff — visually in the desktop app, or `git diff`.
6. Run the tests yourself. Don't take "it should work" for an answer.
7. Commit.

Do not batch five tasks unattended. Reviewing 400 lines of unfamiliar code at once is much harder than reviewing five lots of eighty, and you are the one who has to maintain this.

### 10.7 Permissions

Don't blanket-approve everything on day one. Let it ask, and approve patterns as they come up so you learn what it actually wants to do. Specifically never auto-approve anything that touches production Supabase or deletes files.

### 10.8 What changes from the chat workflow

| Rule in this file | In Claude Code |
|---|---|
| Upload the spec each session | Not needed — it's on disk. Reference the path. |
| Download and overwrite your copy after each session | Not needed. Commit instead. |
| Version-drift warning (section 1) | No longer applies. |
| "New chat every 2–3 topics" (section 4) | `/clear` between topics. |
| Paste standing instructions (section 2) | Lives in `CLAUDE.md`, loaded automatically. |
| Session opener prompt (section 4) | Shorter: "Read docs/spec/frc-scouting-app-spec.md topics 7 and 8. Ask me your open questions, batched, most-blocking first." |
| Ask for a diff file (section 6) | Use the visual diff review or `git diff`. |
| Everything in sections 2, 3, 5, 7, 8, 9 | Unchanged. |

---

## 11. Session workflow (branch per chat)

How we run each working session in this repo. It supersedes the worktree setup — **there is one working copy; every change is made in the repo itself on a branch, never on a copy.**

**Branch model** *(set 2026-08-31, topic 15 close)*

| Branch | Role |
|---|---|
| `main` | Deployable / production. Only ever receives reviewed, CI-green merges. |
| `develop` | Integration. Every push here runs CI (lint, typecheck, tests, build). |
| `spec/<topic>`, `feat/<thing>` | One per working session. Cut from `develop`, merged back into `develop`. |

1. **Start.** I open a session by giving you the requirements or topics for this chat. Before you edit anything, ask me to open a new branch for the work, cut from `develop` (e.g. `spec/offline-sync` or `feat/form-builder`). All of this chat's commits go on that branch.
2. **During.** When we discuss a new feature, decision, or gotcha that isn't captured in the spec, finish your answer by asking whether to add it to `frc-scouting-app-spec.md`. Don't silently add it, and don't silently drop it.
3. **End.** When I say we're finished, push the branch and open a merge request **into `develop`**. Don't merge it yourself unless I tell you to; I review the MR, then it merges. Promotion from `develop` to `main` is a separate, deliberate step and requires CI green.
4. **One copy.** Never create a second checkout/worktree of the spec. If you ever find edits landing in a duplicate path, stop and consolidate.

*During the spec phase there is no code and therefore nothing for CI to run; `develop` becomes the working integration branch once the repo is scaffolded in phase 0 (spec §19.1). Until then, spec branches may merge straight into `main`.*

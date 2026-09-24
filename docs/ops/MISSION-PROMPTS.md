# Mission prompts — how to write the prompt that starts a build chat

A build chat starts empty. It knows nothing from earlier chats: not what was decided
aloud, not which URL is the right one, not what was already tried. **The prompt and the
repository are all it has.** This file is how to write that prompt so a fresh chat can
run a mission end to end without coming back with questions.

**How to ask for one.** Name a **part** of the plan, not a task: *"give me the prompts
for part C"* means the plan's group **Phase 1 C** (see the task index at the top of
`IMPLEMENTATION-PLAN.md`). A single task or a free-form mission works too. Claude
decides how many chats the part needs (next section), then replies with one fenced
block per chat, which you copy into a fresh chat in order. Prompts are not committed:
each describes one moment, and a committed copy goes stale the day after.

---

## The one question that decides every line

> **Could a fresh chat learn this by reading the repository?**
>
> **If yes — point at it. If no — state it.**

Everything below is that rule applied. A prompt that restates `BUILD-CONTEXT.md` is
not thorough, it is a second copy that will disagree with the first the day a rule
changes, and nothing will catch it. A prompt that leaves out what only you know sends
the chat to rediscover it at your expense.

**What only the prompt can carry**, because it is nowhere in the repository:

- **What you saw.** The exact text on screen, the URL, what you clicked, on which
  device. An observation, not a theory.
- **What the moment is.** Which SHAs, which branch, what is already green, what the
  last chat left behind.
- **What was decided aloud** and has not been written down yet — including the options
  you already rejected, so they are not re-proposed.
- **How far this chat goes** — commit, push, pull request — and where it must stop.
- **What you will do yourself**, so the chat does not attempt it.

Everything else has a home in the repo and should be pointed at, not copied.

---

## Asked for a part: one chat or several?

**First, find where the part really starts.** A task is done when its plan commit
message is in `git log develop`. Every plan task ends with an exact
`git commit -m "…"` line. List the part's tasks that are not done yet. Also list any
**earlier** task still open that the part depends on: for example, 1.17b must run
before 1.18. Put those first, and say so. Respect the plan's "run this first" notes.
Numeric order is not always execution order.

**Default: the whole part is one chat.** The chat is an orchestrator (BUILD-CONTEXT
§9): one subagent per task, in order, one commit per task, on one branch. Phase 1 B ran
this way. Tasks in a group are a dependency chain, and one chat keeps the interfaces
each task produces in view for the next.

**Split at a boundary only when one of these holds.** Name the reason in the reply.

1. **You are needed in the middle.** A task needs you to do or check something before
   the next can start: a production action, a real-device rehearsal (airplane mode, a
   phone), a visual review, a decision. End the chat there. The next chat starts
   after you have done it.
2. **A gate or a rehearsal task.** The phase's rehearsal or gate task (e.g. 1.9,
   1.64) gets its own chat. Its job is to judge the work, not to add to it.
3. **Size.** More than about **six tasks**, or tasks the plan marks as heavy (a large
   test matrix, a new subsystem). Split into chains of **three to five** at a seam
   where one task has finished producing an interface the rest consume.
4. **Independent areas.** Two runs of tasks that share no files and no interfaces (a
   server use case and an unrelated client screen) can be separate chats, so a
   failure in one does not stall the other. They still run **one after the other**,
   never at once: there is one working copy (`CLAUDE.md`).

**Never split** between a task and the task that consumes the interface it just
produced, or anywhere the suite is not green.

**What the reply looks like:**

- A short table: chat number, tasks in execution order, the branch, and **why the
  boundary is there**. For a single chat, one line saying why it is not split.
- One fenced prompt per chat, using the template below. A split part shares **one
  branch** (e.g. `feat/phase-1c-events`), carried from chat to chat.
- **Starting state for chat 2 and later:** the SHAs do not exist yet when the prompt
  is written. Give the branch name and **the commit message the previous chat must
  have left as its last commit**. Tell the chat to stop if that commit is missing,
  because a missing commit means the previous chat did not finish.
- Only the **last** chat of a part pushes and opens the pull request into `develop`.
  Earlier chats commit and push the branch, and stop.

---

## The ten parts, in this order

1. **The goal, in one sentence.** What exists at the end that does not exist now.
2. **Autonomy and hard stops.** Either *"do not stop to ask; make the call, log it in
   `DEVIATIONS.md`, keep going"*, or *"stop and ask before X"*. Always name the hard
   stops: anything touching `main`, anything touching the **production** Supabase
   project, and anything irreversible not already authorised.

   **A checkpoint costs a chat its momentum, so it has to earn its place.** Only two
   things reliably do: a **contract freeze** — the moment an interface both sides will
   compile against becomes expensive to change (1.2's form model, 1.10's permission
   matrix) — and a **security boundary**, where a wrong call is not merely rework
   (1.12 replacing the walking skeleton's caller). Progress reporting is not a reason;
   ask for it in the final report instead.

   **When you will not be there, set zero checkpoints and say so.** A chat told to
   stop and ask will stop and ask at 2am and do nothing until morning. Instead write:
   *"Make the call, log what you chose and what you rejected, keep going"*, and fold
   what the checkpoint would have asked into the final report. Add the standing
   instruction that a logged wrong call is worth more than a halted run, because it is
   reversible and the halt is not.
3. **Read first.** Always `docs/ops/BUILD-CONTEXT.md` (binding). Then the exact plan
   task (`IMPLEMENTATION-PLAN.md`, "Task 1.17b") and the spec sections it cites.
   **Point at them; never restate them.** A restated rule goes stale the first time the
   rule moves.
4. **Starting state.** The branch to create and what it is cut from, the SHAs of
   `develop` and `main`, and the test count as a floor ("689 tests across 68 files —
   the floor"). A chat that knows the starting state can tell its own breakage from
   what was already there.
5. **The problem.** What is wrong or missing, as **observed facts**: the exact message
   on screen, the URL it was on, what was clicked. Say what you saw, not your theory of
   why. If a cause is only suspected, say "suspected" and tell the chat to confirm it
   first.
6. **What to build.** The requirements as bullets. If the shape is decided, say so and
   say which alternatives are **ruled out, and why**. The next reader's instinct is
   the option already rejected. If the shape is open, say it is open and ask for a
   recommendation.
7. **Who runs what.** Anything that must never go through an agent is named as yours:
   production migrations, anything against production, typing a real password. The
   chat proves things on **dev** and tells you exactly what to type for production.
8. **Docs to update.** Which of the spec, `SETUP.md`, `RUNBOOK.md`, `BUILD-CONTEXT.md`
   and `DEVIATIONS.md` change, and what each gains. For the spec, the rule in
   `CLAUDE.md` applies: status, decision-log row **with rationale**, change-history row.
9. **Verification.** "BUILD-CONTEXT §10 in full", plus the specific negatives to prove:
   the refusal that must fire, the message that must *not* appear. Give the exact
   commands and the floor:
   `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check`, and `pnpm docs:check`
   if docs changed.

   **Say that a subagent's claim is not evidence.** An orchestrator must read the diff
   and re-run the suite itself. In this project a subagent reported a green suite for a
   fix that a mutation test then showed was never exercised — the guard was removed and
   the tests still passed. Where the work is security-shaped, demand the negative
   explicitly: a check that never rejects passes every happy-path test ever written.
10. **Finish and report.** Say how far it goes: commit only, push the branch, or open a
    pull request into `develop`. **Never merge unless the prompt says so.** List what the
    report must contain: the commits, the verbatim suite output, what you must type
    yourself, and whether anything else blocks the next step.

    **The report is the next chat's prompt.** Whatever chat N+1 will need and cannot
    read from the repository, chat N has to be told to write down — and the repository
    will not yet contain what has not been built. Phase 1B's server chat was asked for
    the exact token shape, the login response body and every error code a client must
    handle; without that list the client chat could not have been written at all. Ask
    for it by name, as a numbered list, not as "anything useful".

## Rules that save a round trip

- **Exact identifiers, always.** Full URLs, branch names, task numbers and file paths.
  "The dev site" is ambiguous. `https://frc-scouting-client-git-develop-roboactive.vercel.app`
  is not. A per-deployment URL (random code in the host name) is refused by the
  server's CORS and looks exactly like "no internet" (BUILD-CONTEXT §2, §5).
- **Say what "done" looks like from outside.** "The Users screen opens on an install
  with no event", not "fix the gate".
- **One mission per chat.** Name the task, and add "exactly this task, not the next".
- **Never put a secret in a prompt.** Name the environment file and the variable
  *names*. Never the values. Non-secret identifiers are listed in BUILD-CONTEXT §2.
- **Say whether to delegate.** BUILD-CONTEXT §9 makes a build chat an orchestrator of
  subagents. For a small single task, say "write it directly" so the chat does not
  spend more on handoffs than on the work.
- **Name the traps you already know** in one line each: "the dev seed never runs on
  production", "`/change-password` is outside `AppShell`". One line here saves an hour
  of rediscovery.
- **Ambiguous one-liners cost a turn.** "Put it in a script file" was read as "save
  the prompt", not "build the script". Say the verb: *build*, *save*, *explain*, *plan*.
- **Check the repository before writing the prompt.** Branches move between chats, and
  a prompt written against a remembered state sends a chat to build something that
  already exists. A first-admin bootstrap prompt was drafted here in full before a
  `git log` showed the script, its tests and its documentation had already landed, and
  `main` had moved two merges beyond what the conversation believed. Read `git log`,
  `git ls-remote --heads` and the relevant files first, every time.
- **Give the plan's line ranges, not just task numbers.** `IMPLEMENTATION-PLAN.md` is
  over ten thousand lines; `1.15 = 10225–10474` saves a chat from searching and from
  reading the wrong task.
- **State what is deliberately out of scope**, especially a placeholder the chat will
  be tempted to clean up. Phase 1B's server chat was told explicitly not to touch the
  client's hardcoded author id, because removing it before a login screen existed
  would have broken the walking skeleton mid-phase.

## Template

```
<Goal in one sentence.>

**DO NOT STOP TO ASK ME ANYTHING.** Make the call, log it in `DEVIATIONS.md`, keep
going. Hard stops: anything touching `main`, anything touching the production Supabase
project, anything irreversible I have not authorised.

**Read `docs/ops/BUILD-CONTEXT.md` first. It is binding.** Then
`docs/plans/IMPLEMENTATION-PLAN.md` "Task <N>", and spec <sections>.

Create branch **`<type>/<name>`** from `develop` (`<sha>`). `main` is at `<sha>`.
<count> tests across <files> files are green — the floor. `DEVIATIONS.md` is
append-only. <"Write it directly, no subagents." if small>

## The problem
<Observed facts: URL, what was done, exact text on screen. Suspected causes marked as such.>

## What to build
<Bullets. Decided shape + ruled-out alternatives with reasons, or "open — recommend one".>

## Mine, not yours
<What only I run or type. What you prove on dev instead.>

## Document it
<Which files, what each gains.>

## Verification
BUILD-CONTEXT §10 in full, including prove the negative: <the specific negatives>.
`pnpm test && pnpm typecheck && pnpm lint && pnpm format:check` green, <count> as the
floor. <`pnpm docs:check` if docs changed.>

## When you finish
<Commit / push / PR into develop — do not merge.> Report: the commits, the full suite
output, <what I must type and what I should see>, and whether anything blocks <next step>.

<For a chat another chat follows:>
The next chat builds <what>. It cannot read from the repository what you have not
built yet, so list explicitly: <the interface, the wire shape, the error codes, the
exact names it must call>.
```

## Worked example

The whole of the above, at the size it usually lands — a single task, no subagents:

```
Make `pnpm db:clean` remove stray users as well as stray rows.

**DO NOT STOP TO ASK ME ANYTHING.** Make the call, log it in `DEVIATIONS.md`, keep
going. Hard stops: anything touching `main`, anything touching the production Supabase
project, anything irreversible I have not authorised.

**Read `docs/ops/BUILD-CONTEXT.md` first. It is binding.** Then
`packages/db/src/seed/clean.ts`.

Create branch **`fix/clean-users`** from `develop` (`b30dcb1`). `main` is at `bebcad6`.
689 tests across 68 files are green — the floor. `DEVIATIONS.md` is append-only.
Write it directly, no subagents.

## The problem
A role probe left a disabled `probe_a41f` user in the dev project. `pnpm db:clean`
removed its entries and matches but left the user, because `purge()` only covers
`scouting_entries` and `matches`.

## What to build
- `purge('users')` alongside the existing two, scoped to the same seed id space.
- Delete in foreign-key order — entries reference users, so users go last.
- If a stray user is still referenced from a table this script does not purge, report
  which table blocked it rather than failing silently or widening its remit.

## Mine, not yours
Nothing. This never runs against production; the guard in the file already refuses.

## Document it
`BUILD-CONTEXT.md` §8, one line. `DEVIATIONS.md` if anything departed from the plan.

## Verification
BUILD-CONTEXT §10 in full, including prove the negative: a seeded user is never
deleted. Run it against dev and re-seed. `pnpm test && pnpm typecheck && pnpm lint &&
pnpm format:check` green, 689 as the floor, plus `pnpm docs:check`.

## When you finish
Commit and push the branch; do not open a pull request. Report the commits, the full
suite output, and how many rows of each kind it removed.
```

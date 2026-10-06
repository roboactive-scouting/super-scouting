# FRC Scouting Platform

Year-agnostic scouting app for an FRC team. Currently in the **specification phase** — no application code exists yet.

## Read these before doing anything

- `docs/spec/frc-scouting-app-spec.md` — the living specification. Single source of truth for all requirements and decisions.
- `docs/ops/BUILD-CONTEXT.md` — **binding for every build chat.** The machine, the
  identifiers, the secrets rule, the Vercel and deployment carve-outs, the bundled
  server function, how a build chat runs, the verification standard and the
  `DEVIATIONS.md` format. Every fact in it was learned the expensive way; none is
  guessable from the code. **A build prompt points at this file rather than restating
  it** — a restated rule goes stale the first time the rule moves.
- `docs/ops/MISSION-PROMPTS.md` — how to write the prompt that starts a build chat.
  Read it whenever I ask for a mission prompt.
- `docs/spec/COLLABORATION.md` — process rules. **Sections 2, 3, 10 and 11 are binding.** Read them.

## Non-negotiables

1. **No application code until `SPEC-FINAL.md` and `IMPLEMENTATION-PLAN.md` exist and are approved.** Right now the only job is closing spec topics.
2. **Use plan mode before every non-trivial edit.** Plan, get approval, then execute one task.
3. **One task at a time.** Stop after each so I can review the diff and commit.
4. **Verify before claiming done.** Run the command, read the output, then report. Never say something works without having seen it work.
5. **Offer a subagent verification pass — don't run one automatically.** When a deliverable is long or intricate enough that a fresh reader would likely catch something the drafting pass dropped, say so and ask. Only run it if I say yes, then report what it found and what changed.
6. **Never touch the production Supabase project.** Development work uses the dev project only.
7. **Migrations live in the repo** and are applied by CLI. Never hand-edit a schema in the Supabase dashboard.
8. **Secrets stay in server environment variables.** Never in the client, never committed.

## Session workflow

Single working copy — no worktree copies. Every change is made in the repo itself on a branch. `main` = production, `develop` = integration (CI runs on every push), topic branches cut from `develop`. Full detail in `COLLABORATION.md` section 11.

1. **Start of a session.** When I give you this chat's requirements, ask me to open a new branch before editing anything (e.g. `spec/<topic>` or `feat/<thing>`).
2. **During the chat.** If we discuss a new feature, decision, or gotcha that isn't written down yet, end your answer by asking whether to add it to `docs/spec/frc-scouting-app-spec.md`.
3. **End of the session.** When I say we're finished, push the branch and open a merge request into `develop` — don't merge it yourself unless I say so. Promotion to `main` is a separate step and needs CI green. (During the spec phase there is no code yet, so spec branches may still target `main`.)

## Communication

- Be terse. No preamble, no recaps, no restating documents back to me.
- One recommendation, not a trade-off table — unless I write `?` or `why?`, or the decision is irreversible.
- Never reprint spec sections. Patch the file and give a change summary of five lines or fewer.
- **Raise omissions proactively.** If I'm forgetting something that will hurt later, say so unasked. Mark it `[RAISED BY ME]` in the spec. This is the most valuable thing you do here.
- Flag contradictions with closed decisions before editing, not after.

## How I answer spec questions

Shorthand, defined in `COLLABORATION.md` section 3. Summary: `Q3.1 A` = pick option A · `y`/`n` = yes/no · `?` = explain first · `you pick` = use your recommendation and log it · `later` = park it · `skip` = out of scope · `nice` = add to the nice-to-have list (spec §24).

## `tell-next`

When I say **`tell-next`**: commit the current changes, then tell me the next task to start in a fresh chat — i.e. which spec topic to close next, which instructions/design document to prepare, or what to develop. Give the recommendation and the reason, briefly.

## When a spec topic closes

Set its status to CLOSED in the status table, move proposals into confirmed requirements, add a Decision Log row **with rationale**, add a Change History row.

## Project gotchas

Full list in `COLLABORATION.md` section 9. The ones that bite hardest:

- Venue connectivity is effectively zero — offline is the normal operating mode, not an edge case.
- Form versions are immutable; field keys are permanent, labels are not.
- Semantic field metadata cannot be backfilled — capture it at field-creation time.
- A dead or no-show robot must not record zeros.

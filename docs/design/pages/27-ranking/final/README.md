# 27 · Ranking — final

- desktop: `ranking-desktop.png` (Scoring, sorted by Total, BumbleB in the study panel) and `ranking-desktop-availability.png` (Availability, sorted by Availability then Breakdowns, the sort builder open)
- phone: `ranking-phone.png`: Scoring by default · offline, Availability then Breakdowns · BumbleB's summary sheet

The `.html` files are the source, and `bash docs/design/pages/render.sh 27-ranking final` re-renders them. Their shared CSS and JS are `../src/n/n.css`, `../src/n/n.js` and `../src/final.js`. Spec: SPEC-FINAL v1.46 §13.5, §17.9 and D18; living spec v0.98. Task 1.58 (with the rest of 1.59's shading).

Chosen: **variant N, "Score beside presence"**. It is variant L (Points anatomy, the third draw) with the user's four changes, from the fourth draw (2026-10-28). The briefs of all four draws are kept beside `src/` (`BRIEF.md` … `BRIEF-4.md`).

## Behaviour

- **Route and navigation**
  - The route is `/ranking`, scoped to the active event, and the event is named in the header.
  - On a computer the sidebar's Competition group is Home · Scout · Search · Ranking · Entries.
  - On a phone the bottom bar is **Home · Scout · Search · Ranking**, with the current page raised. Entries moves to the drawer (plan 1.58).
- **Two categories**, switched by the Category switch. Each category keeps its own sort.
  - **Scoring:** By phase · **Total** · Auto · Teleop · Endgame · Consistency, then Availability (the Status marks) and Matches.
  - **Availability:** the Status spread bar · **Availability** · Breakdowns · No-shows · Disabled · Matches.
- **Phases:** Auto, Teleop and Endgame are each phase's average points. There is one per phase that carries points in the season's form, so a form that scores a fourth phase gets a fourth segment and figure. Together they add up to Total.
- **Total** is the average scouted points per match. A no-show or disabled match is left out, never counted as zero (§11.5).
- **Consistency** is the standard deviation of Total, shown as "±n". It has no sort mark and never sorts.
- **Availability** is available ÷ (available + missed). A breakdown counts as available; a no-show or a disabled match counts as missed.
- **Rank** is the canonical basic rank (the place by Total), with medals on the top 3. It never changes when the list is re-sorted.
- **Availability in the Scoring view:** every row shows its %, bold when under 100 %. Before the % comes one status shape per problem match: ◆ broke down, □ disabled, – no show. A clean team shows the % alone.
- **Status spread** (the Availability view and the team summary): one bar of the team's **scouted** matches.
  - Played and Broke down sit left of the "On the field" line; Disabled and No show sit right of it, under "Missed".
  - Every block prints its shape and its count.
  - A match nobody scouted is in none of the four, so it is never drawn as missed.
- **Sort:** one figure or several, in order.
  - **Header click:** clicking a sortable header makes that figure the whole sort, and a second click reverses it.
  - **Sort control:** shows the whole sort as a sentence. Clicking it opens the Sort builder (a popover on a computer, a sheet on a phone), where the user can:
    - drag the figures into order;
    - set each figure's direction: best or worst first, or for a count fewest or most first;
    - remove a figure;
    - add a tie-breaker, chosen from the open category's figures only.
  - **How rows are ordered:** each later figure settles ties in the one before it. Teams still tied after every figure keep rank order, and a team with no data sorts last whatever the sort.
  - **Defaults:** Scoring starts at Total, best first; Availability at Availability, best first.
- **Value shading** (SPEC-FINAL §12.6):
  - **Which figures are shaded:** the figures in the current sort are shaded and the rest print plain, so the eye goes to what orders the list. A phone row shows the first figure of the sort, shaded.
  - **Scale:** Total and the phases run over the observed min–max, Availability over a fixed 0–100 %, and the counts over a reversed min–max. Consistency is never shaded.
  - **Readable values:** the number is always printed, and "—" is muted.
- **Team study:**
  - A row click on a computer selects the row (`--accent-tint` with an `--accent` edge) and fills the panel beside the list.
  - A tap on a phone opens the summary sheet with the same content.
  - The content: rank and matches counted; Open team page; points by phase with Avg, Share and Place; Consistency with the "Typical match" range (Total ± SD); availability with the Status spread and the tally of the four statuses. It ends with "A breakdown counts as available: the robot was on the field. Only scouted matches count."
- **Online:** "From the server · as of 11:40".
- **Offline:** the phone computes the same ranking from the entries on the device and says so: "Computed from the data on this device · Last synced 11:08 · n entries waiting to send".
- **No data:** a team with no counted matches shows "—" in every figure and "No counted matches yet" in place of the bars, and it sorts last.
- **No weighting:** there are no sliders, presets or weight buttons in phase 1 (D18).

## Feature decisions

| Feature | Decision |
|---|---|
| Two categories, Scoring and Availability, in place of column visibility (user) | Now |
| Auto, Teleop and Endgame averages beside Total (user) | Now |
| Availability on every Scoring row, with a mark per problem match (user) | Now |
| The status spread on every Availability row (user) | Now |
| The team summary on a phone, like the computer's study panel (user) | Now |
| Sort by several figures, each category with its own sort (user) | Now |
| By-phase bar on every row (L) | Now |
| Team study panel and Open team page (L) | Now |
| Share and Place in the study panel (L) | Now |
| Typical match range under Consistency (L) | Now |
| Availability as a plain % only (M, O) | No |
| The sort and the category switch docked above the bottom bar (O) | No |
| Previous and next team buttons in the summary sheet (O) | No |
| A points half on every Availability row (P) | No |
| Draws 1–3 (A–K: shaded grids, thumb dock, one big number, need-then-trust) | No |

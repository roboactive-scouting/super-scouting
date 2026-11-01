# Variant brief — what each design subagent receives

A page round (`README.md`, "The page round", step 1) starts **four subagents at once**, A to D. Each gets the **same brief**, filled in from the template below, and nothing else. A subagent sees no other variant, no earlier final and no conversation. So the brief must be complete on its own and must not contain a design.

**Put in the brief:**
- what the page is for, who uses it and where (a phone at a loud venue, a laptop in the pits)
- every requirement, from SPEC-FINAL and the plan task, as plain bullets
- the states to draw and the mock data, written out
- the theme rules
- the fixed shell
- how to render

**Leave out:** any layout or component choice, the locked-components table, other pages' finals, the previous rounds' variants, and any opinion about what would work. If a rule is decided in the spec (for example, robot status is never shown by colour alone), it goes in as a requirement, not as a drawing.

---

## Template

```
You are designing one page of a scouting app for an FRC robotics team (team 2096). Design it the way you think works best. Other designers are working on the same brief separately; you will not see their work, and yours should stand on its own.

## The page
<Name, route, one paragraph: what it is for, who opens it, on which device, in what situation.>

## It must show and do
<Bullets: every requirement, from SPEC-FINAL §… and plan task ….>

## Draw these states
<Bullets: which screens appear in the image, e.g. "the default list", "offline", "the empty state".>

## Mock data
<The teams, matches, names and numbers to use, written out.>

## Theme and shell (fixed)
- Colours, type and shape: link `docs/design/theme.css` and use only its tokens (read the "Palette", "Type", "Shape and space" and "Rules" sections of `docs/design/THEME.md`; skip "Locked components"). No colour of your own.
- Red and blue mean the two alliances only. Colour is never the only signal: every status also has a word or a shape.
- Desktop shell: `docs/design/pages/shell.css` + `shell.js` (`<div data-desk-shell="<nav id>" data-crumb="…">` wraps the content). Phone shell: the dark top bar and bottom bar, as `docs/design/pages/11-phone-shell/final/README.md` describes (<the bottom bar for this page>).
- Touch targets ≥ 48 px on a phone.

## Make the image
- Your files are the page `docs/design/pages/<nn>-<page>/src/<letter>.html` and anything it loads, kept in `docs/design/pages/<nn>-<page>/src/<letter>/`. Do not read or change any other page's folder or another letter's files, except the shared files named above.
- The page draws a 2000 × 900 canvas: a title line "<Page> — <letter> · <your name for the design>", then the desktop view (a 1440 × 900 frame at `zoom: 0.8`) and one or two phone views (375 × 812 frames at `zoom: 0.8`) side by side.
- Render it with `bash docs/design/pages/render.sh <nn>-<page> <letter>`. The PNG lands in `docs/design/pages/<nn>-<page>/out/<letter>.png`. Open it and check it: nothing cut off, nothing overlapping, text readable.
- Tag every feature that is not in "It must show and do" with a black NEW tag (`<span class="new">NEW</span>` from shell.css).
- On Windows, write files with LF line endings.

## Reply with
1. The image path.
2. One line naming the design idea.
3. Each NEW feature, one line each.
4. Nothing else.
```

// Form builder: the remaining screens, drawn over the closed builder (FINALS.view).
// Loads after builder.js, complex.js, phones.js and final.js. Colours come only from theme.css.
window.ST = (() => {
  const { svg } = FB;
  const NEW = window.FINAL ? '' : '<span class="new">NEW</span>';
  const x = `<span class="x">${svg('x')}</span>`;
  const head = (title, sub) => `<div class="fs-h"><span class="t"><b>${title}</b><small>${sub}</small></span>${x}</div>`;
  const dlg = (w, inner) => `<div class="fs-wrap"><div class="fs-dlg" style="width:${w}px">${inner}</div></div>`;
  const chev = svg('chev');

  /* ---------- Match timer (task 1.32) ---------- */
  const PH = { Auto: 'fs-p1', Teleop: 'fs-p2', Endgame: 'fs-p3', 'After match': 'fs-p4' };
  const row = (i, ph, sec, focus) => `<div class="fs-pr"><span class="g">${svg('grip')}</span><span class="n">${i}</span>
      <span class="fs-sel"><i class="${PH[ph]}" style="border:1px solid var(--line)"></i>${ph}${chev}</span>
      <span class="fs-num ${focus ? 'focus' : ''}">${sec}<span>s · ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}</span></span>
      <span class="ibtn">${svg('trash')}</span></div>`;
  const timer = () => dlg(660, head('Match timer', 'The phases run in this order. The timer pinned at the top of the scouter\'s screen counts them down, and event-log taps are timed from <b>Start match</b>.') +
    `<div class="fs-b">
      <div class="fs-ph"><div class="fs-pr hd"><span></span><span>#</span><span>Phase</span><span>Length</span><span></span></div>
        ${row(1, 'Auto', 15)}${row(2, 'Teleop', 135, true)}${row(3, 'Endgame', 30)}</div>
      <span class="fs-add">${svg('plus')}Add a phase</span>
      <div class="fs-bar"><span class="fs-p1" style="width:8.3%">A</span><span class="fs-p2" style="width:75%">Teleop<code>2:15</code></span><span class="fs-p3" style="width:16.7%">Endgame<code>0:30</code></span></div>
      <div class="fs-total">Match ends at <b>180 s</b> (3:00)</div>
      <div class="fb-note">${svg('info')}<span><b>Changing these is an in-place edit.</b> It never creates a new form version, and entries already scouted keep their times.</span></div>
    </div>
    <div class="fs-f"><span class="btn ghost">Remove the timer</span><span class="sp"></span><span class="btn">Cancel</span><span class="btn primary">Save</span></div>`);
  const timerEmpty = () => dlg(660, head('Match timer', 'The phases run in this order. The timer pinned at the top of the scouter\'s screen counts them down, and event-log taps are timed from <b>Start match</b>.') +
    `<div class="fs-b">
      <div class="fs-empty"><b>This form has no match timer.</b>The sticky timer is not shown, and each event log times its taps from its own first tap.</div>
      <div style="display:flex;gap:8px"><span class="fs-add" style="flex:1">${svg('plus')}Add a phase</span><span class="fs-add" style="flex:1.4">${svg('clock')}Start from Auto 0:15 · Teleop 2:15 · Endgame 0:30${NEW}</span></div>
      <div class="fb-note">${svg('info')}<span><b>Changing these is an in-place edit.</b> It never creates a new form version.</span></div>
    </div>
    <div class="fs-f"><span class="sp"></span><span class="btn">Cancel</span><span class="btn primary" disabled>Save</span></div>`);

  /* ---------- Edit as JSON (task 1.31) ---------- */
  const code = [
    ['38', '    {'],
    ['39', '      <span class="k">"key"</span>: "tele_shots",'],
    ['40', '      <span class="k">"label"</span>: "Shots",'],
    ['41', '      <span class="k">"type"</span>: "event_log",'],
    ['42', '      <span class="k">"phase"</span>: "teleop",'],
    ['43', '      <span class="k">"config"</span>: {'],
    ['44', '        <span class="k">"event_types"</span>: ['],
    ['45', '          { "value": "high", "label": "High goal" }'],
    ['46', '          { "value": "low", "label": "Low goal" },', 1],
    ['47', '          { "value": "miss", "label": "Missed" }'],
    ['48', '        ],'],
    ['49', '        <span class="k">"ask_position"</span>: true,'],
    ['50', '        <span class="k">"mirror_axis"</span>: "horizontal"'],
    ['51', '      },'],
    ['52', '      <span class="k">"description"</span>: "Each shot at a goal, with where it was taken",'],
    ['53', '      <span class="k">"unit"</span>: "count",'],
    ['54', '      <span class="k">"direction"</span>: "higher_is_better"'],
    ['55', '    },'],
    ['56', '    {'],
    ['57', '      <span class="k">"key"</span>: "tele_cycle_routes",'],
  ];
  const json = () => dlg(1000, head('Edit as JSON', 'The whole form as text, for bulk edits. Nothing changes until you apply, and text that isn\'t a valid form is refused.') +
    `<div class="fs-b">
      <div class="fs-tabs"><b>Draft v4</b><span>17 fields · 312 lines</span><span style="margin-left:auto">Keys can't change here either: a renamed key is refused.</span></div>
      <div class="fs-code"><div class="ln">${code.map(([n, , bad]) => (bad ? `<b>${n}</b>` : n)).join('\n')}</div>
        <pre>${code.map(([, t, bad]) => (bad ? `<span class="bad">${t.replace('{ "value": "low"', '<span class="caret">{</span> "value": "low"')}</span>` : t)).join('\n')}</pre></div>
      <div class="fs-err" role="alert">${svg('warn')}<span><b>Line 46, column 11: a comma is missing at the end of line 45.</b> Nothing was changed. Fix it, then apply again.</span></div>
    </div>
    <div class="fs-f"><span class="btn">${svg('copy')}Copy all</span><span class="sp"></span><span class="btn">Cancel</span><span class="btn primary" disabled>Apply</span></div>`);

  /* ---------- Import (task 1.31) ---------- */
  const dr = (m, label, key, right) => `<div class="fs-dr"><span class="m ${m}">${m === 'add' ? '+' : m === 'chg' ? '~' : '='}</span><b>${label}</b><code>${key}</code><span class="r">${right}</span></div>`;
  const imp = () => dlg(720, head('Import a form', 'Check what the file would change before anything is applied.') +
    `<div class="fs-b">
      <div class="fs-file">${svg('file')}<span><b>Match form 2026 · v3</b> <span style="color:var(--muted)">· from Exports · 18 fields</span></span><span class="r">Choose another export</span></div>
      <div class="fs-sum"><div><small>Adds</small><b>3</b></div><div><small>Changes type</small><b>1</b></div><div class="z"><small>Removes</small><b>0</b></div><div><small>Unchanged</small><b>14</b></div></div>
      <div class="fs-diff">
        ${dr('add', 'Trap scores', 'tele_traps', 'Counter · new')}
        ${dr('add', 'Harmony', 'end_harmony', 'Toggle · new')}
        ${dr('add', 'Fouls drawn', 'post_fouls', 'Counter · new')}
        ${dr('chg', 'Climb time', 'end_climb_time', 'Timer → <b>Number</b>')}
        ${dr('same', '14 fields unchanged', '', 'Show')}
      </div>
      <div class="fb-note">${svg('info')}<span><b>An import is a structural change.</b> It replaces draft v4 with the file's form; publish it to make it active. Published versions and their entries are untouched.</span></div>
    </div>
    <div class="fs-f"><span class="sp"></span><span class="btn">Cancel</span><span class="btn primary">Import as draft v4</span></div>`);

  /* ---------- Delete form (task 1.29; the locked destructive confirmation) ---------- */
  const del = () => dlg(580, head('Delete the match form?', '<b style="color:var(--ink)">Match form 2026</b> and everything scouted with it:') +
    `<div class="fs-b" style="padding-top:4px">
      <ul class="fs-list"><li><b>4</b> versions (3 published, 1 draft)</li><li><b>264</b> entries from the 2026 events</li><li>the scoring of its fields</li></ul>
      <div class="fs-err" style="border-left-color:var(--ink)">${svg('info')}<span>It is removed from every device at the next sync and <b>can't be undone</b>. <a style="color:var(--accent-ink);font-weight:650">Export it first</a> if you might need it.</span></div>
      <div class="fs-type"><label>Type <code>delete match form</code> to confirm${NEW}</label><div class="in">delete match form</div></div>
    </div>
    <div class="fs-f"><span class="sp"></span><span class="btn" style="box-shadow:0 0 0 3px var(--accent-tint);border-color:var(--accent)">Cancel</span><span class="btn ink">${svg('trash')}Delete Match form 2026</span></div>`);

  /* ---------- Export (task 1.31) ---------- */
  const choice = (on, title, sub) => `<div class="fs-ch ${on ? 'on' : ''}"><span class="rd"></span><span><b>${title}</b><small>${sub}</small></span></div>`;
  const exp = () => dlg(640, head('Export the match form', 'Saves the form in Exports for 24 hours, so it can be imported into another form — for example to start next season’s form from it.') +
    `<div class="fs-b">
      <div class="fs-lab">Which version${NEW}</div>
      <div class="fs-chs">${choice(true, 'Draft v4', '17 fields · not published yet')}${choice(false, 'v3 · active', '15 fields · what scouts use now')}</div>
      <div class="fs-two">
        <div><div class="fs-lab">In the file</div><ul class="fs-list"><li>every field, its options and its meaning</li><li>the scoring of each field</li><li>the match timer</li></ul></div>
        <div><div class="fs-lab">Not in the file</div><ul class="fs-list"><li>entries (the scouted data)</li><li>other versions</li><li>users and events</li></ul></div>
      </div>
      <div class="fs-file">${svg('clock')}<span>Saved to <b>Exports</b> as <code>Match form 2026 · draft v4</code> · <b>deleted after 24 hours</b></span></div>
    </div>
    <div class="fs-f"><span class="btn ghost">${svg('down')}Also download a copy</span><span class="sp"></span><span class="btn">Cancel</span><span class="btn primary">Save export</span></div>`);

  /* ---------- Import into an empty form (the other half of the round trip) ---------- */
  const impNew = () => dlg(700, head('Import the 2027 match form', 'Check what the file would create before anything is applied.') +
    `<div class="fs-b">
      <div class="fs-lab">Saved exports · each is deleted 24 hours after it was saved</div>
      <div class="fs-picks">
        <div class="fs-pick on"><span class="rd"></span><span><b>Match form 2026 · draft v4</b><small>17 fields · saved by Noa Levi, 2 hours ago</small></span><span class="ex">deleted in 22 h</span></div>
        <div class="fs-pick"><span class="rd"></span><span><b>Match form 2026 · v3</b><small>15 fields · saved by Tamar M., yesterday 21:10</small></span><span class="ex">deleted in 3 h</span></div>
        <div class="fs-pick"><span class="rd"></span><span><b>Super form 2025 · v2</b><small>6 fields · saved by Tamar M., yesterday 20:40</small></span><span class="ex">deleted in 2 h</span></div>
      </div>
      <a class="fs-alt">${svg('up')}Or a file from your computer</a>
      <div class="fs-sum"><div><small>Fields</small><b>17</b></div><div><small>With meaning</small><b>17</b></div><div><small>Scored</small><b>9</b></div><div><small>Match timer</small><b style="font-size:18px;margin-top:5px">3:00</b></div></div>
      <div class="fb-note">${svg('info')}<span><b>This creates the 2027 match form as draft v1</b>, with new keys checked against the season. Edit it for the new game, then publish it to start scouting. Nothing from 2026's entries comes with it.</span></div>
    </div>
    <div class="fs-f"><span class="sp"></span><span class="btn">Cancel</span><span class="btn primary">Import as draft v1</span></div>`);

  /* ---------- composer ---------- */
  const desk = (o) => {
    const [inner, menu = ''] = FINALS.view(o.view);
    const body = o.offline ? inner.replace('<div class="fb-body"', `<div class="fs-off">${svg('warn')}<span><b>You're offline.</b> Form changes need a connection, so editing is paused. You can look around; unsaved changes stay on this screen until you're back online.</span></div><div class="fb-body fs-dim"`) : inner;
    return `<div class="desk" style="position:relative"><div data-desk-shell="forms" data-crumb="Admin / Forms / <b>Match form 2026</b>"><div class="fb" style="position:relative">${body}${menu}</div></div>${o.over || ''}</div>`;
  };
  const card = (title, items) => `<div class="fs-card"><h4>${title}</h4><ol>${items.map((i) => `<li><span>${i}</span></li>`).join('')}</ol></div>`;
  const tall = (o) => {
    document.getElementById('root').innerHTML = `<div class="canvas tall">
      <div class="canvas-head"><b>${o.title}</b><span>${o.desc}</span></div>
      <div class="row2">
        <div style="display:flex;flex-direction:column;gap:14px">
          <figure class="frame">${desk(o.v1)}<figcaption>${o.c1}</figcaption></figure>
          <figure class="frame">${desk(o.v2)}<figcaption>${o.c2}</figcaption></figure>
        </div>${o.card}</div></div>`;
  };
  // After shell.js: an offline view shows "Offline" in the top bar and holds Save / Publish.
  const offline = () => {
    const figs = document.querySelectorAll('.frame');
    figs.forEach((f) => {
      if (!f.querySelector('.fs-off')) return;
      const chips = f.querySelectorAll('.top .chip');
      if (chips[1]) chips[1].innerHTML = '<span class="dot" style="background:var(--muted)"></span>Offline';
      f.querySelectorAll('.fb-acts .btn').forEach((b) => { if (/Save|Publish|Match timer|More/.test(b.textContent)) b.setAttribute('disabled', ''); });
    });
  };
  // Final 1440 image: the builder (or the Forms page, o.forms) with the screen over it.
  const final = (o) => {
    const SCR = { timer, 'timer-empty': timerEmpty, json, import: imp, delete: del, export: exp, 'import-new-season': impNew };
    const over = SCR[o.screen] ? SCR[o.screen]() : '';
    let body;
    if (o.forms) body = `<div data-desk-shell="forms" data-crumb="Admin / <b>Forms</b>"><div class="fl-pad">${FORMS_FINAL.view('new-season')}</div></div>`;
    else {
      const [inner] = FINALS.view('event');
      const b = o.screen === 'offline' ? inner.replace('<div class="fb-body"', `<div class="fs-off">${svg('warn')}<span><b>You're offline.</b> Form changes need a connection, so editing is paused. You can look around; unsaved changes stay on this screen until you're back online.</span></div><div class="fb-body fs-dim"`) : inner;
      body = `<div data-desk-shell="forms" data-crumb="Admin / Forms / <b>Match form 2026</b>"><div class="fb" style="position:relative">${b}</div></div>`;
    }
    document.getElementById('root').innerHTML = `<div class="frame"><div class="desk final" style="position:relative">${body}${over}</div></div>`;
  };
  return { timer, timerEmpty, json, imp, del, exp, impNew, tall, card, offline, final, NEW };
})();

// Form builder round 2 (variant D): phase paging, the slimmer top bar and the complex field types.
// Loads after builder.js and reuses FB.svg / FB.NEW. Colours come only from theme.css.
window.FC = (() => {
  const { svg, NEW } = FB;
  const pin = '<svg class="pin" viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
  const undo = '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>';

  /* ---------- the season field image (a stand-in drawing) ---------- */
  const X = (x) => (x * 200).toFixed(1);
  const Y = (y) => (y * 100).toFixed(1);
  const hex = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
  const field = (o = {}) => {
    let s = `<svg class="fb-field" viewBox="0 0 200 100" role="img" aria-label="${o.label || 'Field image'}">
      <rect class="bg" x="0.3" y="0.3" width="199.4" height="99.4" rx="3"/>
      <rect class="zr" x="0.3" y="0.3" width="34" height="99.4" rx="3"/><rect class="zb" x="165.7" y="0.3" width="34" height="99.4" rx="3"/>
      <line class="mid" x1="100" y1="2" x2="100" y2="98"/><line class="sr2" x1="34.3" y1="2" x2="34.3" y2="98"/><line class="sb2" x1="165.7" y1="2" x2="165.7" y2="98"/>
      <polygon class="goal" points="${hex(58, 50, 11)}"/><polygon class="goal" points="${hex(142, 50, 11)}"/>
      <rect class="zb" x="0.3" y="84" width="14" height="15.7"/><rect class="zr" x="185.7" y="0.3" width="14" height="15.7"/>
      <text class="lbr" x="5" y="8">RED</text><text class="lbb" x="173" y="96">BLUE</text>`;
    (o.ghost || []).forEach(([x, y]) => { s += `<circle class="pg" cx="${X(x)}" cy="${Y(y)}" r="4.6"/>`; });
    (o.paths || []).forEach((p) => {
      s += `<polyline class="${p.cls || 'lr'}" points="${p.pts.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ')}"/>`;
      if (p.dots) p.pts.forEach(([x, y]) => { s += `<circle class="pp ${p.cls && p.cls.includes('f') ? 'f' : ''}" cx="${X(x)}" cy="${Y(y)}" r="2"/>`; });
      if (p.nums) p.pts.forEach(([x, y], i) => { s += `<circle class="${p.dot || 'pr'}" cx="${X(x)}" cy="${Y(y)}" r="5"/><text class="nt" x="${X(x)}" y="${Y(y)}">${i + 1}</text>`; });
    });
    (o.pts || []).forEach(([x, y, c, n]) => {
      s += `<circle class="${c || 'pr'}" cx="${X(x)}" cy="${Y(y)}" r="${n ? 5.4 : 4.6}"/>`;
      if (n) s += `<text class="nt" x="${X(x)}" y="${Y(y)}">${n}</text>`;
    });
    if (o.sel !== undefined) { const [x, y] = o.pts[o.sel]; s += `<circle class="ring" cx="${X(x)}" cy="${Y(y)}" r="7.4"/>`; }
    if (o.pill) {
      const a = +X(o.pill.at[0]); const top = +Y(o.pill.at[1]) - 18; const w = o.pill.w || 30;
      s += `<rect class="pill" x="${a - w / 2}" y="${top}" width="${w}" height="10" rx="5"/><polygon class="pill" points="${a - 2.2},${top + 9.8} ${a + 2.2},${top + 9.8} ${a},${top + 12.6}"/><text class="pillt" x="${a}" y="${top + 5.1}">✕  ${o.pill.text}</text>`;
    }
    if (o.hint) s += `<text class="hint" x="100" y="${o.hintY || 92}">${o.hint}</text>`;
    return s + '</svg>';
  };

  /* ---------- top bar: Match timer + More, then save/publish ---------- */
  const head = (o = {}) => {
    const draft = o.state !== 'locked';
    const ver = draft
      ? `<span class="fb-ver">Draft v4 · not published ${svg('chev')}</span><span>made from v3 · ${o.added || 2} field${o.added === 1 ? '' : 's'} added</span><span class="w">● Unsaved changes</span>`
      : `<span class="fb-ver pub">${svg('lock')}v3 · Published · Locked ${svg('chev')}</span><span class="ok">${svg('check')}Saved 11:48</span>`;
    const tail = draft ? `<span class="btn">Save draft</span><span class="btn primary" ${o.blocked ? 'disabled' : ''}>Publish v4</span>` : `<span class="btn primary">Save changes</span>`;
    const why = o.blocked ? `<div class="fb-why">${svg('warn')}1 field needs its meaning before v4 can be published · <a>Next incomplete ${svg('next')}</a></div>` : '';
    return `<div class="fb-head"><div class="fb-title"><b>Match form<span class="yr">2026</span></b><div class="fb-meta">${ver}</div></div>
      <div style="margin-left:auto"><div class="fb-acts">
        <span class="btn">${svg('clock')}Match timer</span>
        <span class="btn ${o.menu ? 'on' : ''}">More${svg('chev')}</span>
        <span class="sep"></span>${tail}</div>${why}</div></div>`;
  };
  const menu = (style) => `<div class="fb-menu" style="${style}">
      <div class="mi hov">${svg('code')}<span><b>Edit as JSON</b><small>Advanced: the whole form as text. Refuses anything invalid and names the line.</small></span></div>
      <div class="mi">${svg('down')}<span><b>Export</b><small>Download this form as a .json file, e.g. to start next season from it.</small></span></div>
      <div class="mi">${svg('up')}<span><b>Import</b><small>Load a .json file. Shows "adds 3 fields, removes 0" before anything changes.</small></span></div>
      <hr><div class="mi">${svg('trash')}<span><b>Delete form</b><small>Removes every version and its entries. Asks first.</small></span></div></div>`;

  /* ---------- the live canvas, paged by phase like the Entry page ---------- */
  const PH = [['Auto', 4], ['Teleop', 5], ['Endgame', 2], ['Notes', 3]];
  const li = (key, inner, o = {}) => `<div class="fb-li ${o.cls || ''}">${o.try ? '' : `<span class="lgrip">${svg('grip')}</span><div class="bar">${o.extra || ''}<code>${key}</code></div>`}${inner}</div>`;
  const canvas = (o) => {
    const i = PH.findIndex((p) => p[0] === o.phase);
    const tabs = PH.map(([n, c]) => `<span class="${n === o.phase ? 'on' : ''}">${n}<small>${c}</small>${o.inc && o.inc === n ? `<span class="w">${svg('warn')}</span>` : ''}</span>`).join('');
    const dots = PH.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
    const prev = i > 0 ? `‹ <b>${PH[i - 1][0]}</b>` : '<span></span>';
    const next = i < PH.length - 1 ? `<b>${PH[i + 1][0]}</b> ›` : '<span></span>';
    return `<div class="fb-pane"><div class="fb-ph"><b>Form</b><small>as the scouter's phone shows it</small>
        <span class="r fb-ltb" style="padding:0"><span class="${o.try ? '' : 'on'}">Edit</span><span class="${o.try ? 'on' : ''}">Try it</span></span></div>
      <div class="fb-lp"><div class="fb-ptabs2">${tabs}</div>
        <div class="fb-lcol" style="align-self:center;width:410px;display:flex;flex-direction:column;gap:8px">
          <div class="fb-paneh"><b>${o.title || o.phase}</b><small>Phase ${i + 1} of 4</small><span class="fb-dots">${dots}</span></div>${o.items}</div>
        <div class="fb-lpfoot">${prev}<span>swipe sideways, or <kbd>←</kbd> <kbd>→</kbd></span>${next}</div></div></div>`;
  };

  /* ---------- field widgets ---------- */
  const ctr = (l, s, v = 0) => `<div class="fb-pvctr"><span class="t"><b>${l}</b><small>${s}</small></span><span class="m">−</span><span class="v">${v}</span><span class="p">+</span></div>`;
  const toggle = (l) => `<div class="fb-lrow"><span class="t"><b>${l}</b></span><span class="fb-swbig"></span></div>`;
  const shots = (o = {}) => `<div class="fb-pvf"><b>Shots</b><small>Tap the goal each time it shoots${o.where ? ', then where it shot from' : ''}</small>
      <div class="fb-evtb"><span>High goal<small>${o.n ? o.n[0] : 'high'}</small></span><span>Low goal<small>${o.n ? o.n[1] : 'low'}</small></span><span>Missed<small>${o.n ? o.n[2] : 'miss'}</small></span></div>${o.chips || ''}</div>`;
  const chips = (list) => `<div class="fb-chips">${list.map(([t, tm, w]) => `<span class="fb-chip">${w ? pin : ''}${t} <code>${tm}</code><span class="x">${svg('x')}</span></span>`).join('')}</div>
      <div class="fb-tools"><span class="fb-tb">${undo}Undo last tap</span><span class="r">${list.length} taps</span></div>`;

  // Timer field: idle = one centred Start; running = time + Pause / Clear; paused = editable time + Resume / Clear.
  const play = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
  const pauseI = '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
  const clearI = '<svg class="o" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>';
  const pencil = '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>';
  const unsure = (on) => `<div class="uns"><span class="fb-swi ${on ? 'on' : ''}"></span>Unsure — no time</div>`;
  const timer = (st = 'idle', v = '0.0') => {
    let h = '';
    if (st === 'idle') h = `<span class="start">${play}Start</span>${unsure(false)}`;
    if (st === 'run') h = `<div class="face run"><span class="v">${v}<small>s</small></span><span class="st"><i></i>Running</span></div>
      <div class="row"><span class="b2 pause">${pauseI}Pause</span><span class="b2">${clearI}Clear</span></div>`;
    if (st === 'paused') h = `<div class="face"><span class="v">${v}<small>s</small></span><span class="st p"><i></i>Paused</span><span class="ed">${pencil}</span></div>
      <div class="row"><span class="b2 go">${play}Resume</span><span class="b2">${clearI}Clear</span></div>${unsure(false)}`;
    if (st === 'unsure') h = `<div class="none">No time recorded · unsure</div>${unsure(true)}`;
    return `<div class="fb-tmr">${h}</div>`;
  };

  /* ---------- settings panes ---------- */
  const f = (label, input, hint) => `<div class="fb-f"><label>${label}</label>${input}${hint ? `<div class="fb-hint">${hint}</div>` : ''}</div>`;
  const seg = (opts, on) => `<div class="fb-seg">${opts.map((x) => `<span class="${x === on ? 'on' : ''}">${x}</span>`).join('')}</div>`;
  const done = (title, sum) => `<div class="fb-grp"><div class="fb-gh"><span class="ch">${svg('chevr')}</span><b>${title}</b><span class="r done">${svg('check')}Complete</span></div><div class="fb-gsum">${sum}</div></div>`;
  const noScore = (what) => `<div class="fb-grp"><div class="fb-gh"><b>Scoring</b></div><div class="fb-note">${svg('info')}<span>${what}</span></div></div>`;
  const pane = (type, tname, label, key, body, o = {}) => `<div class="fb-pane"><div class="fb-sh"><span class="fb-ti">${svg(type)}</span><span class="t"><small>${tname}</small><b>${label}</b></span><span class="r"><span class="ibtn">${svg('dots')}</span></span></div>
      <div class="fb-key">${o.newKey ? `Key <code>${key}</code> follows the label until the first save${NEW}` : `${svg('lock')}Key <code>${key}</code> · permanent, never changes`}</div>
      <div class="fb-pb"><div class="fb-sb">${body}</div></div></div>`;
  const optRows = (rows) => `<div class="fb-opts">${rows.map(([l, v]) => `<div class="fb-opt"><span class="grip">${svg('grip')}</span><b>${l}</b><code>${v}</code><span style="width:15px;height:15px;color:var(--muted);display:grid">${svg('x')}</span></div>`).join('')}
      <div class="fb-opt" style="color:var(--accent-ink);font-weight:650"><span style="width:15px;height:15px;display:grid">${svg('plus')}</span>Add a button</div></div>`;

  const sEvent = () => pane('event_log', 'Event log', 'Shots', 'tele_shots',
    done('Field', 'Teleop · not required · help: “Tap the goal each time it shoots”') +
    `<div class="fb-grp"><div class="fb-gh"><b>Configuration</b><small>Event log</small></div>
      ${f('Buttons', optRows([['High goal', 'high'], ['Low goal', 'low'], ['Missed', 'miss']]), 'One button per kind of event. Each gets its own cycle times.')}
      <div class="fb-sw"><span class="fb-swi on"></span><span><b>Ask where on the field</b> after each tap${NEW}</span></div>
      <div class="fb-note">${svg('info')}<span><b>What a tap saves:</b> the button and the seconds since <b>Start match</b> (or since the first tap, if the timer wasn't started). The analysis works out, per button, how many, the time between taps (cycle times) and the time to the first one.</span></div></div>` +
    done('Meaning', 'count · Teleop · higher is better · Scoring') +
    noScore('Event logs are not scored. Their taps give counts and cycle times; score the goals with a counter if they earn points.'), { newKey: true });

  const mirror = (o) => `<div class="fb-mir" role="img" aria-label="Mirroring preview">
      <figure>${field({ pts: o.blue, paths: o.bluePath, label: 'A blue scout taps' })}<figcaption>A blue scout taps</figcaption></figure>
      <span class="arr">${svg('next')}</span>
      <figure>${field({ pts: o.saved, paths: o.savedPath, label: 'Saved as' })}<figcaption>Saved as (red's side)</figcaption></figure></div>
    <div class="fb-hint">Red is saved as tapped; <b>blue is mirrored</b> left ↔ right, so both mean the same spot on the game image.</div>`;

  const sPosition = () => pane('position', 'Field position', 'Scoring spots', 'auto_score_spots',
    done('Field', 'Autonomous · not required · help: “Tap where it scored from”') +
    `<div class="fb-grp"><div class="fb-gh"><b>Configuration</b><small>Field position</small></div>
      ${f('Each entry holds', seg(['One point', 'A list of points'], 'A list of points'))}
      ${f('Mirror for the blue alliance', seg(['None', 'Left ↔ right', 'Top ↔ bottom', 'Both'], 'Left ↔ right'))}
      ${mirror({ blue: [[0.8, 0.3, 'pb'], [0.74, 0.7, 'pb']], saved: [[0.2, 0.3, 'pi'], [0.26, 0.7, 'pi']] })}
      <div class="fb-hint">Game image: <code style="font-family:var(--font-num)">seasons/2026/field.webp</code>, set on the season in Manage.</div></div>` +
    done('Meaning', 'coordinate · Auto · neutral · Scoring') +
    noScore('Field positions are not scored. They feed the heat maps and scatter charts.'), { newKey: true });

  const sCycle = () => pane('cycle_path', 'Cycle path', 'Cycle routes', 'tele_cycle_routes',
    done('Field', 'Teleop · not required · help: “Tap the route of each cycle”') +
    `<div class="fb-grp"><div class="fb-gh"><b>Configuration</b><small>Cycle path</small></div>
      ${f('Points per cycle, at most', `<div style="display:flex;gap:6px;align-items:center"><span class="ibtn">−</span><div class="fb-in num" style="width:64px;justify-content:center">6</div><span class="ibtn">+</span></div>`, 'A rough sketch, not a trajectory. Fewer points keep each entry small for offline sync.')}
      ${f('Mirror for the blue alliance', seg(['None', 'Left ↔ right', 'Top ↔ bottom', 'Both'], 'Left ↔ right'))}
      ${mirror({ bluePath: [{ pts: [[0.93, 0.12], [0.8, 0.3], [0.71, 0.5]], cls: 'lr', nums: true, dot: 'pb' }], savedPath: [{ pts: [[0.07, 0.12], [0.2, 0.3], [0.29, 0.5]], cls: 'lg', nums: true, dot: 'pi' }] })}</div>` +
    done('Meaning', 'coordinate · Teleop · neutral · Movement') +
    noScore('Cycle paths are not scored. They draw route maps on the team page.'));

  const sTry = () => `<div class="fb-pane"><div class="fb-sh"><span class="fb-ti">${svg('eye')}</span><span class="t"><small>Try it${NEW}</small><b>What this entry would save</b></span></div>
      <div class="fb-pb"><div class="fb-sb">
        <div class="fb-grp"><div class="fb-note">${svg('info')}<span>You are filling the form as a scouter would. <b>Nothing is saved or sent.</b> Use it to check that each field records what you meant.</span></div>
          <div class="fb-sw"><span class="fb-swi on"></span><span><b>Match clock running</b> · 1:12, Teleop</span></div></div>
        <div class="fb-grp"><div class="fb-gh"><b>Saved data</b><small>as it would sync</small></div>
<div class="fb-save"><span class="k">"tele_shots"</span>: [
  { "type": "high", "t": 18, "x": 0.31, "y": 0.62 },
  { "type": "high", "t": 41, "x": 0.27, "y": 0.40 },
  { "type": "miss", "t": 57 }
],
<span class="k">"tele_cycle_routes"</span>: [
  [[0.07,0.85],[0.18,0.62],[0.27,0.45],[0.3,0.3]],
  [[0.08,0.82],[0.2,0.7],[0.31,0.55]]
]</div></div>
        <div class="fb-grp"><div class="fb-gh"><b>What the analysis gets</b></div>
          <div class="fb-dl"><div><span>High goal · taps</span><b>2</b></div><div><span>High goal · time to first</span><b>18 s</b></div><div><span>High goal · cycle times</span><b>18 s · 23 s</b></div><div><span>Missed · taps</span><b>1</b></div><div><span>Cycle routes</span><b>2 cycles · 7 points</b></div></div></div>
      </div></div></div>`;

  /* ---------- the scouter's phone (entry page) ---------- */
  const phone = (o) => `<div style="display:flex;flex-direction:column;height:100%;position:relative">
      <div class="fb-eh"><div class="bk"><span>‹ Scout</span><span class="tag ${o.alliance}">${o.station}</span></div><b>${o.match} · ${o.team}<span> ${o.name}</span></b></div>
      <div class="fb-etimer"><span class="tm">${o.clock}</span><small>${o.clockNote}</small><span class="ph">${o.phase}</span></div>
      <div class="fb-pvtabs">${PH.map(([n]) => `<span class="${n === o.phase ? 'on' : ''}">${n}</span>`).join('')}</div>
      <div class="fb-ebody">${o.body}</div>
      <div class="fb-efoot"><span class="btn primary">Review entry</span></div>${o.over || ''}</div>`;

  /* ---------- page composer: two desktop views, two phones, a notes card ---------- */
  const tall = (o) => {
    const desk = (inner) => `<div class="desk"><div data-desk-shell="forms" data-crumb="Admin / Forms / <b>Match form 2026</b>">${inner}</div></div>`;
    const ph = (p) => `<figure class="frame"><div class="phone"><div data-phone-shell data-time="${p.time}" data-title="Scout">${p.html}</div></div><figcaption>${p.cap}</figcaption></figure>`;
    document.getElementById('root').innerHTML = `<div class="canvas tall">
      <div class="canvas-head"><b>${o.title}</b><span>${o.desc}</span></div>
      <div class="row2">
        <div style="display:flex;flex-direction:column;gap:14px">
          <figure class="frame">${desk(o.v1)}<figcaption>${o.c1}</figcaption></figure>
          <figure class="frame">${desk(o.v2)}<figcaption>${o.c2}</figcaption></figure>
        </div>
        <div style="display:flex;flex-direction:column;gap:18px">
          <div style="display:flex;gap:16px">${o.phones.map(ph).join('')}</div>${o.card}
        </div>
      </div></div>`;
  };

  return { timer, field, head, menu, canvas, li, ctr, toggle, shots, chips, sEvent, sPosition, sCycle, sTry, phone, tall, pin, undo };
})();

// Mock data and builders for the form builder round. Colours come only from theme.css.
window.FB = (() => {
  const ic = {
    counter: '<rect x="3" y="6" width="18" height="12" rx="3"/><path d="M7 12h3M15.5 10.5v3M14 12h3"/>',
    number: '<path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>',
    toggle: '<rect x="2" y="7" width="20" height="10" rx="5"/><circle cx="16" cy="12" r="2.5"/>',
    single_select: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
    multi_select: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6"/>',
    rating: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
    short_text: '<path d="M4 7V5h16v2M12 5v14M9 19h6"/>',
    long_text: '<path d="M4 6h16M4 10h16M4 14h16M4 18h10"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>',
    event_log: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
    position: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    cycle_path: '<circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 18h8a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h8"/>',
    computed: '<path d="M18 5H7l6 7-6 7h11"/>',
    section: '<path d="M4 6h16M4 12h10M4 18h16"/>',
    grip: '<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>',
    chev: '<path d="m6 9 6 6 6-6"/>',
    chevr: '<path d="M9 6l6 6-6 6"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4"/>',
    down: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    up: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    warn: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/>',
    check: '<path d="M5 12l5 5L20 7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>',
    when: '<path d="M4 6h16l-6 7v5l-4 2v-7z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    next: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    dots: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  };
  const svg = (k) => `<svg viewBox="0 0 24 24">${ic[k]}</svg>`;
  // Final renders set window.FINAL: the decided features lose their NEW tag.
  const NEW = window.FINAL ? '' : '<span class="new">NEW</span>';

  const TYPES = [
    ['counter', 'Counter', '− / value / + for things you count', 'Count'],
    ['number', 'Number', 'A free number with min, max and step', 'Count'],
    ['timer', 'Timer', 'A stopwatch that adds up time', 'Count'],
    ['toggle', 'Toggle', 'Yes or no', 'Choose'],
    ['single_select', 'Single select', 'Pick one option', 'Choose'],
    ['multi_select', 'Multi select', 'Pick any number of options', 'Choose'],
    ['rating', 'Rating', '1–5 stars or a slider', 'Choose'],
    ['event_log', 'Event log', 'Timed taps, gives cycle times', 'Field'],
    ['position', 'Field position', 'Tap a point on the field image', 'Field'],
    ['cycle_path', 'Cycle path', 'Tap a short path per cycle', 'Field'],
    ['short_text', 'Short text', 'One line of text', 'Write'],
    ['long_text', 'Long text', 'Notes and comments', 'Write'],
    ['computed', 'Computed', 'Worked out from other fields', 'Other'],
    ['section', 'Section', 'A heading; holds no data', 'Other'],
  ];
  const TNAME = Object.fromEntries(TYPES.map((t) => [t[0], t[1]]));

  // [key, label, type, extras]
  const SECTIONS = [
    { name: 'Autonomous', phase: 'Auto', fields: [
      ['auto_leave', 'Left the start zone', 'toggle', { pts: '3' }],
      ['auto_high', 'Pieces scored high', 'counter', { pts: '6/ea' }],
      ['auto_low', 'Pieces scored low', 'counter', { pts: '3/ea' }],
      ['auto_start', 'Start position', 'position'],
    ] },
    { name: 'Teleop', phase: 'Teleop', fields: [
      ['tele_high', 'Pieces scored high', 'counter', { pts: '4/ea' }],
      ['tele_low', 'Pieces scored low', 'counter', { pts: '2/ea' }],
      ['tele_pieces_dropped', 'Pieces dropped', 'counter', { inc: true, added: true }],
      ['tele_intake', 'Intake taps', 'event_log'],
      ['tele_defence', 'Played defence', 'toggle'],
      ['tele_defence_quality', 'Defence quality', 'rating', { cond: true }],
    ] },
    { name: 'Endgame', phase: 'Endgame', fields: [
      ['end_climb', 'Climb level', 'single_select', { pts: '0–12' }],
      ['end_climb_time', 'Climb time', 'timer'],
    ] },
    { name: 'After match', phase: 'After match', fields: [
      ['post_driver', 'Driver skill', 'rating'],
      ['post_total', 'Total pieces scored', 'computed'],
      ['post_notes', 'Notes', 'long_text'],
    ] },
  ];

  /* ---------- header ---------- */
  const head = (o = {}) => {
    const draft = o.state === 'draft';
    const ver = draft
      ? `<span class="fb-ver">Draft v4 · not published ${svg('chev')}</span><span>made from v3 · 1 field added</span><span class="w">● Unsaved changes</span>`
      : `<span class="fb-ver pub">${svg('lock')}v3 · Published · Locked ${svg('chev')}</span><span>active since 02/10</span><span class="ok">${svg('check')}Saved 11:48</span>`;
    const tail = draft
      ? `<span class="btn">Save draft</span><span class="btn primary" disabled>Publish v4</span>`
      : `<span class="btn primary">Save changes</span>`;
    const why = draft && o.why !== false
      ? `<div class="fb-why">${svg('warn')}1 field needs its meaning before v4 can be published · <a>${o.jump ? `Next incomplete ${svg('next')}` : 'Show'}</a>${o.jump ? NEW : ''}</div>`
      : '';
    return `<div class="fb-head"><div class="fb-title"><b>Match form<span class="yr">2026</span></b><div class="fb-meta">${ver}</div></div>
      <div style="margin-left:auto"><div class="fb-acts">
        <span class="btn ${o.preview ? 'on' : ''}">${svg('eye')}Preview</span>
        <span class="btn">${svg('clock')}Match timer</span>
        <span class="btn">${svg('code')}JSON</span>
        <span class="btn">${svg('down')}Export</span>
        <span class="btn">${svg('up')}Import</span>
        <span class="sep"></span>${tail}</div>${why}</div></div>`;
  };

  const banner = () =>
    `<div class="fb-banner">${svg('lock')}<span><b>v3 is locked: 214 entries were scouted with it.</b>${NEW} Labels, help, ranges, meaning and scoring change in place. Adding or removing a field, or changing a type, starts draft v4.</span></div>`;

  /* ---------- palette ---------- */
  const palette = (style, o = {}) => {
    if (style === 'list') {
      return `<div class="fb-pane"><div class="fb-ph"><b>Fields</b><small>drag onto the form</small></div>
        <div class="fb-pb"><div class="fb-pal">${TYPES.map(([id, n, d]) =>
          `<div class="fb-pi ${o.lift === id ? 'lift' : ''}"><span class="fb-ti sm">${svg(id)}</span><span class="t"><b>${n}</b><small>${d}</small></span><span class="g">${svg('grip')}</span></div>`).join('')}</div></div></div>`;
    }
    if (style === 'grid') {
      let g = '';
      let last = '';
      TYPES.forEach(([id, n, , grp]) => {
        if (grp !== last) { g += `<div class="fb-pgroup">${grp}</div>`; last = grp; }
        g += `<div class="fb-pt"><span class="fb-ti sm">${svg(id)}</span><b>${n}</b></div>`;
      });
      return `<div class="fb-pane"><div class="fb-ph"><b>Fields</b><small>drag onto the form</small></div><div class="fb-pb"><div class="fb-pgrid">${g}</div></div></div>`;
    }
    // rail
    return `<div class="fb-rail"><small>Add</small>${TYPES.map(([id, n]) =>
      `<span class="fb-ti ${o.lift === id ? 'lift' : ''}" title="${n}">${svg(id)}</span>`).join('')}</div>`;
  };

  /* ---------- canvas list ---------- */
  const row = ([key, label, type, x = {}], sel) => {
    const marks = [];
    if (x.cond) marks.push(`<span class="mk">${svg('when')}when</span>`);
    if (x.pts) marks.push(`<span class="mk pts">${x.pts} pts</span>`);
    if (x.inc) marks.push(`<span class="fb-inc">${svg('warn')}Needs meaning<span class="sr"> incomplete</span></span>`);
    return `<div class="fb-row ${sel === key ? 'pick' : ''}"><span class="grip">${svg('grip')}</span><span class="fb-ti sm">${svg(type)}</span>
      <span class="t"><b>${label}</b><code>${key}</code></span>${marks.join('')}<span class="ty">${TNAME[type]}</span></div>`;
  };
  const canvas = (o = {}) => {
    const open = o.open || [];
    const secs = (o.only ? SECTIONS.filter((s) => o.only.includes(s.name)) : SECTIONS).map((s) => {
      const isOpen = open.includes(s.name);
      const inc = s.fields.filter((f) => f[3] && f[3].inc).length;
      const h = `<div class="fb-sec"><span class="ch">${svg(isOpen ? 'chev' : 'chevr')}</span><span class="fb-ti sm">${svg('section')}</span><b>${s.name}</b><span class="ph">${s.phase}</span>
        ${inc ? `<span class="wcnt">${svg('warn')}${inc}</span>` : ''}<span class="cnt">${s.fields.length} fields</span></div>`;
      if (!isOpen) return h;
      let rows = s.fields.map((f) => row(f, o.sel)).join('');
      if (o.drop && s.name === o.drop) rows += '<div class="fb-drop"></div>';
      return h + rows;
    }).join('');
    const title = o.title || 'Form';
    const ptabs = o.ptabs
      ? `<div class="fb-ptabs">${[['Auto', '4'], ['Teleop', '6'], ['Endgame', '2'], ['After', '3']].map(([t, c]) =>
          `<span class="${t === o.ptabs ? 'on' : ''}">${t}${t === 'Teleop' && o.ptabsInc ? `<small class="w">⚠ 1 to finish</small>` : `<small>${c} fields</small>`}</span>`).join('')}</div>`
      : '';
    return `<div class="fb-pane"><div class="fb-ph"><b>${title}</b><small>${o.sub || '4 sections · 15 fields'}</small><span class="r fb-hint">${o.collapse ? `Collapse all${NEW}` : ''}</span></div>${ptabs}
      <div class="fb-pb"><div class="fb-cv ${o.narrow ? 'narrow' : ''}">${secs}</div></div></div>`;
  };

  /* ---------- settings ---------- */
  const seg = (opts, on, need) =>
    `<div class="fb-seg ${need ? 'need' : ''}">${opts.map((x) => `<span class="${x === on ? 'on' : ''}">${x}</span>`).join('')}</div>`;
  const f = (label, input, o = {}) =>
    `<div class="fb-f"><label>${label}${o.rq ? '<span class="rq">required</span>' : ''}${o.need ? '<span class="need">Needed to publish</span>' : ''}</label>${input}${o.hint ? `<div class="fb-hint">${o.hint}</div>` : ''}</div>`;
  const inp = (v, cls = '') => `<div class="fb-in ${cls}">${v}</div>`;
  const sel = (v, cls = '') => `<div class="fb-in ${cls}">${v}${svg('chev')}</div>`;

  const sHead = (type, label, o = {}) =>
    `<div class="fb-sh"><span class="fb-ti">${svg(type)}</span><span class="t"><small>${TNAME[type]}</small><b>${label}</b></span>
      <span class="r">${o.dup ? `<span class="btn sm">${svg('copy')}Copy to Auto${NEW}</span>` : ''}<span class="ibtn">${svg('dots')}</span></span></div>`;
  const sKey = (key, o = {}) => o.live
    ? `<div class="fb-key">Key <code>${key}</code> follows the label until the first save, then it is permanent${NEW}</div>`
    : `<div class="fb-key">${svg('lock')}Key <code>${key}</code> · permanent, never changes</div>`;

  // Counter "Pieces dropped": new and incomplete.
  const grpField = () => `<div class="fb-grp"><div class="fb-gh"><b>Field</b></div>
      ${f('Label', inp('Pieces dropped', 'focus'))}
      ${f('Help text', inp('Shown under the label on the phone', 'ph'))}
      <div class="fb-row2">${f('Section', sel('Teleop'))}<div class="fb-f"><label>&nbsp;</label><div class="fb-sw" style="height:38px"><span class="fb-swi"></span><b>Required</b></div></div></div></div>`;
  const grpConfigCounter = () => `<div class="fb-grp"><div class="fb-gh"><b>Configuration</b><small>Counter</small></div>
      <div class="fb-row4">${f('Min', inp('0', 'num'))}${f('Max', inp('20', 'num'))}${f('Step', inp('1', 'num'))}${f('Default', inp('0', 'num'))}</div></div>`;
  const grpMeaningEmpty = (ph) => `<div class="fb-grp"><div class="fb-gh"><b>Meaning</b><small>4 required</small><span class="r fb-inc">${svg('warn')}${ph ? 2 : 3} missing</span></div>
      <div class="fb-note">${svg('info')}<span><b>This cannot be added later.</b> Nobody goes back and describes 80 fields.</span></div>
      ${f('Description', inp('What does this number mean?', 'ta ph need'), { rq: 1, need: 1 })}
      <div class="fb-row2">${f('Unit', sel('count'), { rq: 1 })}${f('Category', sel('—', 'ph'))}</div>
      ${ph ? f('Phase', seg(['Auto', 'Teleop', 'Endgame', 'After'], 'Teleop'), { rq: 1, hint: `Set from the Teleop tab it was dropped on${NEW}` }) : f('Phase', seg(['Auto', 'Teleop', 'Endgame', 'After'], null, 1), { rq: 1, need: 1 })}
      ${f('Direction', seg(['Higher is better', 'Lower is better', 'Neutral'], null, 1), { rq: 1, need: 1 })}
      ${f('Expected range', `<div class="fb-row2">${inp('min 0', 'num ph')}${inp('max', 'num ph')}</div>`, { hint: 'A value outside it is blocked when the scouter enters it.' })}</div>`;
  const grpScoreCounter = () => `<div class="fb-grp"><div class="fb-gh"><b>Scoring</b><small>points per piece, by phase</small></div>
      <table class="fb-mx"><tr><th></th><th>Auto</th><th>Teleop</th><th>Endgame</th></tr>
      <tr><td>Each piece</td><td><div class="pt z">0</div></td><td><div class="pt z">0</div></td><td><div class="pt z">0</div></td></tr></table>
      <div class="fb-hint">0 everywhere means it is recorded but not scored.</div></div>`;
  const grpWhen = () => `<div class="fb-grp"><div class="fb-gh"><b>Show when</b><small>one condition</small></div><div class="fb-cond">${svg('when')}Show this field only when…</div></div>`;

  // Single select "Climb level": complete, ordinal, scored.
  const OPTS = [['None', 'none', 0], ['Parked', 'park', 2], ['Low bar', 'low', 6], ['High bar', 'high', 12]];
  const grpConfigClimb = () => `<div class="fb-grp"><div class="fb-gh"><b>Configuration</b><small>Single select</small></div>
      <div class="fb-sw"><span class="fb-swi on"></span><span><b>Ordered</b> · the list order is the rank, worst → best</span></div>
      <div class="fb-scale"><span>WORST</span></div>
      <div class="fb-opts">${OPTS.map(([l, v], i) => `<div class="fb-opt"><span class="grip">${svg('grip')}</span><span class="rk">${i + 1}</span><b>${l}</b><code>${v}</code></div>`).join('')}</div>
      <div class="fb-scale"><span>BEST</span><span style="color:var(--muted);font-weight:600">Adding an option starts draft v4</span></div></div>`;
  const grpScoreClimb = () => `<div class="fb-grp"><div class="fb-gh"><b>Scoring</b><small>points per option, by phase</small><span class="r fb-hint">in place · no new version</span></div>
      <table class="fb-mx"><tr><th></th><th>Auto</th><th>Teleop</th><th>Endgame</th></tr>
      ${OPTS.map(([l, , p]) => `<tr><td>${l}</td><td><div class="pt z">0</div></td><td><div class="pt z">0</div></td><td><div class="pt ${p ? '' : 'z'} ${l === 'High bar' ? 'focus' : ''}">${p}</div></td></tr>`).join('')}</table></div>`;
  const grpMeaningDone = (open) => open
    ? `<div class="fb-grp"><div class="fb-gh"><b>Meaning</b><span class="r done">${svg('check')}Complete</span></div>
      ${f('Description', inp('Highest bar the robot was hanging from when the match ended', 'ta'), { rq: 1 })}
      <div class="fb-row2">${f('Unit', sel('enum'), { rq: 1 })}${f('Category', sel('Scoring'))}</div>
      ${f('Phase', seg(['Auto', 'Teleop', 'Endgame', 'After'], 'Endgame'), { rq: 1 })}
      ${f('Direction', seg(['Higher is better', 'Lower is better', 'Neutral'], 'Higher is better'), { rq: 1 })}</div>`
    : `<div class="fb-grp"><div class="fb-gh"><span class="ch">${svg('chevr')}</span><b>Meaning</b><span class="r done">${svg('check')}Complete</span></div><div class="fb-gsum">enum · Endgame · higher is better · Scoring</div></div>`;
  const grpFieldDone = () => `<div class="fb-grp"><div class="fb-gh"><span class="ch">${svg('chevr')}</span><b>Field</b><span class="r done">${svg('check')}Complete</span></div><div class="fb-gsum">Endgame section · required · no help text</div></div>`;

  const settings = (which, o = {}) => {
    let h;
    let body;
    if (which === 'dropped') {
      h = sHead('counter', 'Pieces dropped', o) + sKey('tele_pieces_dropped', { live: true });
      if (o.tab) {
        const tabs = { Field: grpField() + grpConfigCounter(), Meaning: grpMeaningEmpty(o.phase), Scoring: grpScoreCounter(), 'Show when': grpWhen() };
        body = tabs[o.tab];
      } else body = grpField() + grpConfigCounter() + grpMeaningEmpty(o.phase) + grpScoreCounter() + grpWhen();
    } else {
      h = sHead('single_select', 'Climb level', o) + sKey('end_climb');
      if (o.tab) {
        const tabs = { Field: grpConfigClimb(), Meaning: grpMeaningDone(true), Scoring: grpScoreClimb() + grpConfigClimb(), 'Show when': grpWhen() };
        body = tabs[o.tab];
      } else body = grpFieldDone() + grpConfigClimb() + grpScoreClimb() + grpMeaningDone(false) + grpWhen();
    }
    const tabs = o.tab
      ? `<div class="fb-stabs">${['Field', 'Meaning', 'Scoring', 'Show when'].map((t) => {
          const mark = which === 'dropped' && t === 'Meaning' ? `<span class="wm">${svg('warn')}</span>` : (t !== 'Show when' ? `<span class="ok">${svg('check')}</span>` : '');
          return `<span class="${t === o.tab ? 'on' : ''}">${t}${mark}</span>`;
        }).join('')}</div>`
      : '';
    return `<div class="fb-pane">${h}${tabs}<div class="fb-pb"><div class="fb-sb">${body}</div></div></div>`;
  };

  /* ---------- preview (the scouter's phone at 375 px) ---------- */
  const pvTeleop = () => `<div class="fb-pvctr"><span class="t"><b>Pieces scored high</b><small>Upper goal</small></span><span class="m">−</span><span class="v">2</span><span class="p">+</span></div>
        <div class="fb-pvctr"><span class="t"><b>Pieces scored low</b><small>Lower goal</small></span><span class="m">−</span><span class="v">0</span><span class="p">+</span></div>
        <div class="fb-pvctr"><span class="t"><b>Pieces dropped</b><small>&nbsp;</small></span><span class="m">−</span><span class="v">0</span><span class="p">+</span></div>
        <div class="fb-pvf"><b>Intake taps</b><small>Tap each time it picks up a piece</small><div class="fb-evt"><span>Ground</span><span>Station</span></div></div>`;
  const previewInner = (ph) => ph === 'Teleop' ? `<div class="fb-ph375">
      <div class="fb-pvtimer"><span class="tm">2:30</span><small>Auto 0:15 · Teleop 2:15 · Endgame 0:30</small><span class="go">Start match</span></div>
      <div class="fb-pvtabs"><span>Auto</span><span class="on">Teleop</span><span>Endgame</span><span>After</span></div>
      <div class="fb-pvbody">${pvTeleop()}</div>
      <div class="fb-pvfoot">Preview · nothing typed here is saved or sent</div></div>` : `<div class="fb-ph375">
      <div class="fb-pvtimer"><span class="tm">2:30</span><small>Auto 0:15 · Teleop 2:15 · Endgame 0:30</small><span class="go">Start match</span></div>
      <div class="fb-pvtabs"><span>Auto</span><span>Teleop</span><span class="on">Endgame</span><span>After</span></div>
      <div class="fb-pvbody">
        <div class="fb-pvf"><b>Climb level</b><small>Highest bar at the end of the match</small>
          <div class="fb-pvopts"><span>None</span><span>Parked</span><span>Low bar</span><span class="on">High bar</span></div></div>
        <div class="fb-pvf"><b>Climb time</b><small>From starting the climb to hanging</small>
          <div class="fb-pvtimerf"><span class="v">0.0 s</span><span class="b">Start</span><span class="u"><span class="fb-swi"></span>Unsure</span></div></div>
      </div>
      <div class="fb-pvfoot">Preview · nothing typed here is saved or sent</div></div>`;
  const preview = (o = {}) => `<div class="${o.over ? 'fb-over' : 'fb-pane'} fb-pv" style="${o.style || ''}">
      <div class="fb-pvh"><b>Preview</b><small>phone width · 375 px</small><span class="r ibtn">${svg('x')}</span></div>
      <div class="fb-pvwrap" style="${o.scale ? `zoom:${o.scale}` : ''}">${previewInner(o.phase)}</div></div>`;

  /* ---------- live canvas (variant D) ---------- */
  const star = svg('rating');
  const live = (o = {}) => {
    const sec = (n, p, c) => `<div class="fb-lsec"><b>${n}</b><span class="ph">${p}</span><span class="cnt">${c}</span></div>`;
    const item = (key, inner, cls = '', extra = '') => `<div class="fb-li ${cls}"><span class="lgrip">${svg('grip')}</span><div class="bar">${extra}<code>${key}</code></div>${inner}</div>`;
    const ctr = (l, s, v = 0) => `<div class="fb-pvctr"><span class="t"><b>${l}</b><small>${s}</small></span><span class="m">−</span><span class="v">${v}</span><span class="p">+</span></div>`;
    let h = '';
    if (o.view === 1) {
      h += `<div class="fb-lsec" style="opacity:.6"><b>Autonomous</b><span class="ph">Auto</span><span class="cnt">4 fields · collapsed</span></div>`;
      h += sec('Teleop', 'Teleop', '6 fields');
      h += item('tele_high', ctr('Pieces scored high', 'Upper goal', 0), '', '<span class="mk fb-cond-tag" style="font-family:var(--font-num)">4/ea pts</span>');
      h += item('tele_low', ctr('Pieces scored low', 'Lower goal', 0), '', '<span class="fb-cond-tag" style="font-family:var(--font-num)">2/ea pts</span>');
      h += item('tele_pieces_dropped', ctr('Pieces dropped', '<span style="color:var(--muted)">No help text yet</span>', 0), 'pick inc', `<span class="fb-inc">${svg('warn')}Needs meaning<span class="sr"> incomplete</span></span>`);
      h += item('tele_intake', `<div class="fb-lrow"><span class="t"><b>Intake taps</b><small>Tap each time it picks up a piece</small></span></div><div class="fb-evt"><span>Ground</span><span>Station</span></div>`);
      h += item('tele_defence', `<div class="fb-lrow"><span class="t"><b>Played defence</b></span><span class="fb-swbig"></span></div>`);
    } else {
      h += `<div class="fb-lsec" style="opacity:.6"><b>Teleop</b><span class="ph">Teleop</span><span class="cnt">6 fields · collapsed</span></div>`;
      h += sec('Endgame', 'Endgame', '2 fields');
      h += item('end_climb', `<div class="fb-pvf"><b>Climb level</b><small>Highest bar at the end of the match</small><div class="fb-pvopts"><span>None</span><span>Parked</span><span>Low bar</span><span>High bar</span></div></div>`, 'pick', '<span class="fb-cond-tag" style="font-family:var(--font-num)">0–12 pts</span>');
      h += item('end_climb_time', `<div class="fb-pvf"><b>Climb time</b><small>From starting the climb to hanging</small><div class="fb-pvtimerf"><span class="v">0.0 s</span><span class="b">Start</span><span class="u"><span class="fb-swi"></span>Unsure</span></div></div>`);
      h += sec('After match', 'After match', '3 fields');
      h += item('post_driver', `<div class="fb-pvf"><b>Driver skill</b><div class="fb-stars">${star.repeat(5)}</div></div>`);
      h += item('post_total', `<div class="fb-lrow"><span class="t"><b>Total pieces scored</b><small>auto + teleop, high and low</small></span><span style="font-family:var(--font-num);font-size:22px;color:var(--muted)">0</span></div>`);
    }
    return `<div class="fb-pane"><div class="fb-ph"><b>Form</b><small>as the scouter's phone shows it · 4 sections · 15 fields</small>
        <span class="r fb-ltb" style="padding:0"><span class="${o.view === 1 ? 'on' : ''}">Edit</span><span>Try it</span></span></div>
      <div class="fb-pb fb-live"><div class="fb-lcol">${h}</div></div></div>`;
  };

  /* ---------- phone gate + NEW card ---------- */
  const gate = () => `<div class="gate"><div class="gi">${svg('monitor')}</div><b>This needs a computer</b>
    <p>Open the form builder on a screen at least 1024 pixels wide. It is pre-season work, done sitting down. Phones do the competition job — entering, browsing and reading — and this is not one of those.</p>
    <span class="btn">Back to scouting</span></div>`;
  const newCard = (items, layout) => `<div class="fb-newcard"><h4>New in this variant</h4><p>Not in the spec today. For each: now · not now, but wanted · not at all.</p>
    <ol>${items.map((i) => `<li><span>${i}</span></li>`).join('')}</ol><div class="lay">${layout}</div></div>`;

  // Adds the admin "Forms" nav row (decided 2026-10-08) after shell.js has drawn the sidebar.
  const nav = () => {
    document.querySelectorAll('.side .navg').forEach((g) => {
      if (!/Admin/.test(g.querySelector('h6').textContent)) return;
      g.insertAdjacentHTML('beforeend', `<a class="on">${svg('file')}Forms</a>`);
    });
  };

  // Writes the 2000x1660 round canvas: two desktop views stacked, the phone and the NEW card.
  const tall = (o) => {
    const desk = (inner) => `<div class="desk"><div data-desk-shell="forms" data-crumb="Admin / Forms / <b>Match form 2026</b>">${inner}</div></div>`;
    document.getElementById('root').innerHTML = `<div class="canvas tall">
      <div class="canvas-head"><b>${o.title}</b><span>${o.desc}</span></div>
      <div class="row2">
        <div style="display:flex;flex-direction:column;gap:14px">
          <figure class="frame">${desk(o.v1)}<figcaption>${o.c1}</figcaption></figure>
          <figure class="frame">${desk(o.v2)}<figcaption>${o.c2}</figcaption></figure>
        </div>
        <div style="display:flex;flex-direction:column;gap:18px">
          <figure class="frame"><div class="phone"><div data-phone-shell data-time="20:14" data-title="Forms">${gate()}</div></div><figcaption>Below 1024 px: the locked desktop-only gate</figcaption></figure>
          ${o.news}
        </div>
      </div></div>`;
  };

  return { svg, NEW, head, banner, palette, canvas, settings, preview, live, gate, newCard, nav, tall };
})();

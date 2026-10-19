// Round 3: map fields in the Review entry confirmation. Builds mini maps, the confirmation
// list and the read-only map pop-up. Loads after 01-entry's entry.js and parts.js (PX).
// The field image is the app's own season image; colours come only from theme.css.
window.RV = (() => {
  const IMG = '../../../../../apps/client/public/seasons/2026/field.webp';
  const R = 2000 / 812; // the season image's shape
  const ic = (p) => `<svg viewBox="0 0 24 24">${p}</svg>`;
  const I = {
    expand: ic('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>'),
    pin: '<svg viewBox="0 0 24 24"><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/></svg>',
    eye: ic('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    x: ic('<path d="M6 6l12 12M18 6 6 18"/>'),
  };

  /* Q39 · 2630 Thunderbolts, Red 1. Points are on the season image (x from the red end, y down). */
  const START = [[0.27, 0.3]];
  const ROUTES = [
    [[0.27, 0.3], [0.3, 0.4], [0.45, 0.33], [0.41, 0.45], [0.37, 0.46]],
    [[0.37, 0.53], [0.46, 0.68], [0.41, 0.6], [0.37, 0.54]],
  ];
  const EVENTS = [
    ['Scored high', '0:12', [0.26, 0.4]],
    ['Scored high', '0:31', [0.24, 0.62]],
    ['Missed', '0:40', [0.4, 0.7]],
    ['Defended', '1:05', null],
    ['Scored low', '1:22', [0.3, 0.56]],
  ];

  // The view the scout knows: upright with their own end at the bottom (phone),
  // flat with it on the left (computer). Red scout: phone = image turned 90° anticlockwise.
  const view = (p, layout) => (layout === 'phone' ? [p[1], 1 - p[0]] : [p[0], p[1]]);

  // o: { layout, w, spots: [[x, y, label?]], paths: [[[x, y]...]], full }
  const mm = (o) => {
    const phone = o.layout === 'phone';
    const W = o.w;
    const H = Math.round(phone ? W * R : W / R);
    const img = phone
      ? `<img src="${IMG}" alt="" style="width:${H}px;height:${W}px;transform:translate(-50%,-50%) rotate(-90deg)">`
      : `<img src="${IMG}" alt="" style="width:${W}px;height:${H}px;transform:translate(-50%,-50%)">`;
    const at = (p) => view(p, o.layout).map((v) => (v * 100).toFixed(2));
    let s = `<span class="rv-mm ${o.full ? 'full' : ''}" style="width:${W}px;height:${H}px">${img}`;
    if (o.paths && o.paths.length) {
      s += `<svg class="rt" viewBox="0 0 100 100" preserveAspectRatio="none">${o.paths
        .map((r) => { const pts = r.map((p) => at(p).join(',')).join(' '); return `<polyline class="hl" points="${pts}"/><polyline points="${pts}"/>`; })
        .join('')}</svg>`;
      if (o.full) o.paths.forEach((r) => r.forEach((p) => { const [x, y] = at(p); s += `<i class="rv-pp" style="left:${x}%;top:${y}%"></i>`; }));
    }
    (o.spots || []).forEach((p) => {
      const [x, y] = at(p);
      s += p[2] ? `<i class="rv-nd" style="left:${x}%;top:${y}%">${p[2]}</i>` : `<i class="rv-dot" style="left:${x}%;top:${y}%"></i>`;
    });
    if (o.expand) s += `<span class="rv-ex">${I.expand}</span>`;
    return s + '</span>';
  };

  const go = (layout) => `<span class="go">${I.expand}${layout === 'phone' ? 'Tap' : 'Click'} to view</span>`;
  const row = (label, value, o = {}) => `<div class="rv-row"><dt>${label}</dt><dd class="${o.num ? 'num' : ''} ${o.none ? 'none' : ''}">${value}</dd></div>`;
  const mapRow = (label, cap, map, layout, extra = '') => `<div class="rv-maprow"><div class="l"><dt>${label}</dt><span class="cap">${cap}</span>${go(layout)}${extra}</div>${map}</div>`;
  const events = () => `<ol class="rv-evs">${EVENTS.map(([n, t, p]) => `<li class="${p ? '' : 'np'}"><span class="pin">${I.pin}</span><span>${n}${p ? '' : '<small>no place</small>'}</span><span class="t">${t}</span></li>`).join('')}</ol>`;
  const evSpots = (numbered) => EVENTS.map((e, i) => (e[2] ? [...e[2], numbered ? String(i + 1) : ''] : null)).filter(Boolean);

  // The whole confirmation list, by phase, as the app lists it today plus the map rows.
  const list = (layout) => {
    const w = layout === 'phone' ? 56 : 168;
    return `<dl class="rv-sum">
      ${row('Status', 'Played')}
      <h3>Autonomous</h3>
      ${mapRow('Starting position', '<span class="num">1</span> point', mm({ layout, w, spots: START }), layout)}
      ${mapRow('Auto path', '<span class="num">2</span> routes · <span class="num">9</span> points', mm({ layout, w, paths: ROUTES }), layout)}
      <h3 class="tele">Teleop</h3>
      ${mapRow('Teleop events', '<span class="num">5</span> events · <span class="num">4</span> on the map', mm({ layout, w, spots: evSpots(false) }), layout, events())}
      ${row('Cycle time', '0:08', { num: true })}
      ${row('Cycle estimate', '12 s', { num: true })}
      ${row('Shooting position', '—', { none: true })}
      <h3>Endgame</h3>
      ${row('Climb level', 'High rung')}
      ${row('Climb time', '9 s', { num: true })}
      ${row('Climb points', '15', { num: true })}
      <h3>Notes</h3>
      ${row('Driver skill', 'Good')}
    </dl>`;
  };

  const head = () => `<div class="rv-title">Confirm this entry</div>
    <div class="rv-sub"><span class="who"><span><span class="num">Q39</span> · 2630 Thunderbolts</span><span class="tag red">Red 1</span></span>
    <span>You can still edit it for 10 minutes after submitting.</span></div>`;
  const foot = () => `<div class="rv-foot"><a class="btn">Keep editing</a><a class="btn primary">Submit entry</a></div>`;

  // Phone: the bottom sheet over the entry screen.
  const sheet = (scrollTo) => `<div class="rv-scrim"></div><div class="rv-sheet" ${scrollTo ? `data-scroll="${scrollTo}"` : ''}>
      <div class="rv-scroll"><div class="rv-in"><div class="grab"></div>${head()}${list('phone')}<div style="height:12px"></div></div></div>${foot()}</div>`;

  // Desktop: the Dialog.
  const dialog = () => `<div class="dx-scrim"><div class="rv-dlg"><div class="rv-scroll">${head()}${list('desktop')}</div>${foot()}</div></div>`;

  // Phone: the read-only full-screen map, opened from the event log's mini map.
  const pop = () => `<div class="sbar"><span>11:45</span><span style="font-size:11px">● ● ●</span></div><div class="rv-pop">
      <div class="rv-poph"><span class="x">${I.x}</span><span class="t"><b>Teleop events</b><small>Q39 · 2630 · Teleop</small></span>
        <span class="rv-vo">${I.eye}View only</span><span class="tag red">Red 1</span></div>
      <div class="rv-popmap">${mm({ layout: 'phone', w: 180, spots: evSpots(true), full: true })}</div>
      <div class="rv-pophint">Numbers follow the order of the events below</div>
      <div class="rv-popbar"><div class="rv-chips">${EVENTS.map(([n, t, p], i) => `<span class="rv-chip ${p ? '' : 'np'}"><span class="n">${p ? i + 1 : '–'}</span>${n}<span class="t">${t}</span>${p ? '' : '<small>no place</small>'}</span>`).join('')}</div>
        <div class="rv-cnt"><b>5</b> events · <b>4</b> on the map</div>
        <a class="btn">Close</a></div></div>`;

  // Scroll a sheet so the named phase heading sits at the top.
  const scroll = () => document.querySelectorAll('.rv-sheet[data-scroll]').forEach((s) => {
    const box = s.querySelector('.rv-scroll');
    const h = s.querySelector(`h3.${s.dataset.scroll}`);
    box.scrollTop = h.offsetTop - 52; // h3's offsetParent is .rv-scroll (position: relative)
  });

  return { mm, list, sheet, dialog, pop, scroll, I };
})();

// Phase 1 E small parts: builders for the scouter's entry screen. Uses 01-entry's E (status, fields).
window.PX = (() => {
  const ic = (p) => `<svg viewBox="0 0 24 24">${p}</svg>`;
  const I = {
    check: ic('<path d="M5 12l5 5 9-10"/>'),
    warn: ic('<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/>'),
    star: ic('<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>'),
    calc: ic('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2M14 12h2M8 16h2M14 16h2"/>'),
    play: '<svg viewBox="0 0 24 24"><path d="M7 5v14l12-7z"/></svg>',
    reset: ic('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
    undo: ic('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
    draft: ic('<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
    flask: ic('<path d="M9 3h6M10 3v6L4 19a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2l-6-10V3"/><path d="M7 15h10"/>'),
    chev: ic('<path d="M9 6l6 6-6 6"/>'),
  };
  const tick = '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>';
  const tabs = (cur, done) => `<div class="ptabs">${['Auto', 'Teleop', 'Endgame', 'Notes'].map((t, i) =>
    `<span class="${i === cur ? 'on' : i < done ? 'done' : ''}">${i < done && i !== cur ? tick : ''}${t}</span>`).join('')}</div>`;
  const phead = (name, n) => `<div class="phead"><b>${name}</b><span class="pos">Phase ${n} of 4</span><span class="dots">${[1, 2, 3, 4].map((k) => `<i class="${k < n ? 'done' : k === n ? 'on' : ''}"></i>`).join('')}</span></div>`;
  const head = (o = {}) => `<div class="ehead"><div class="row"><span class="back">‹ Scout</span><span class="tag ${o.side || 'red'}">${o.station || 'Red 1'}</span></div><h1><span class="num">${o.match || 'Q39'}</span> · ${o.team || '1690 Orbit'}</h1><div class="meta"><span class="dot"></span>${o.meta || 'Draft saved on this device · 11:43'}</div></div>`;

  /* fields */
  const lbl = (t, o = {}) => `<div class="flbl">${t}${o.req ? '<span class="px-req">Required</span>' : ''}${o.hint ? `<small>${o.hint}</small>` : ''}</div>`;
  const number = (t, o = {}) => `<div class="fld">${lbl(t, o)}<div class="px-num ${o.v === undefined ? 'ph' : ''} ${o.bad ? 'bad' : ''}"><span class="v">${o.v === undefined ? 'Type a number' : o.v}</span><span class="u">${o.unit || ''}</span></div>
      ${o.bad ? `<div class="px-err">${I.warn}${o.bad}</div>` : o.range ? `<div class="px-range">${o.range}</div>` : ''}</div>`;
  const multi = (t, opts, on, o = {}) => `<div class="fld">${lbl(t, o)}<div class="px-multi">${opts.map((x) => `<span class="${on.includes(x) ? 'on' : ''}"><i>${on.includes(x) ? tick : ''}</i>${x}</span>`).join('')}</div>
      <div class="px-hintline"><span>Pick any that apply</span>${o.undo ? `<b>${I.undo}Undo “${o.undo}”</b>` : ''}</div></div>`;
  // Rating, stars style: chosen version D (2026-10-09) — boxed stars filled up to the pick, a word under each, the pick ringed.
  const WORDS = ['Poor', 'Weak', 'OK', 'Good', 'Great'];
  const stars = (t, n, o = {}) => `<div class="fld">${lbl(t, o)}<div class="rt-d">${[1, 2, 3, 4, 5].map((k) => `<span class="${k <= n ? 'fill' : ''} ${k === n ? 'on' : ''}">${I.star}${WORDS[k - 1]}</span>`).join('')}</div></div>`;
  const slider = (t, v, o = {}) => {
    const pct = ((v - 1) / 4) * 100;
    return `<div class="fld">${lbl(t, o)}<div class="px-slider"><span class="tr"></span><span class="fl" style="width:calc((100% - 24px) * ${pct / 100})"></span><span class="kn" style="left:calc(12px + (100% - 24px) * ${pct / 100})"></span></div>
      <div class="px-ticks">${[1, 2, 3, 4, 5].map((k) => (k === v ? `<b>${k}</b>` : `<span>${k}</span>`)).join('')}</div></div>`;
  };
  const text = (t, v, o = {}) => `<div class="fld">${lbl(t, o)}<div class="px-text ${v ? '' : 'ph'}">${v || 'Type here'}</div></div>`;
  const comp = (t, sub, v) => `<div class="fld"><div class="px-comp">${I.calc}<span class="t"><b>${t}</b><small>${sub}</small></span><span class="v">${v}</span></div></div>`;
  const sec = (t) => `<div class="px-sec"><b>${t}</b></div>`;
  const counter = (t, v, hint) => `<div class="fld fld-row"><div class="flbl">${t}${hint ? `<small>${hint}</small>` : ''}</div><div class="ctr-row"><b><svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg></b><span class="num">${v}</span><b class="p"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></b></div></div>`;
  const select = (t, opts, on, o = {}) => `<div class="fld">${lbl(t, o)}<div class="opts">${opts.map((x) => `<span class="${x === on ? 'on' : ''}">${x}</span>`).join('')}</div>${o.bad ? `<div class="px-err">${I.warn}${o.bad}</div>` : ''}</div>`;

  /* sticky match timer */
  const PH = [['AUTO', 15], ['TELEOP', 135], ['ENDGAME', 30]];
  const timer = (st, o = {}) => {
    if (st === 'ready') return `<div class="px-tm"><div class="row"><span class="go">${I.play}Start match</span><span class="plan">3:00 match</span></div></div>`;
    if (st === 'over') return `<div class="px-tm over"><div class="row"><span class="ph end">MATCH OVER</span><span class="cd">3:00</span><span class="tot">keep entering</span></div></div>`;
    // running: o.phase index, o.left 'm:ss' in phase, o.fill fraction of the phase, o.total 'm:ss'
    const bar = PH.map(([n, s], i) => `<span style="flex:${s}" class="${i < o.phase ? 'done' : ''}">${i === o.phase ? `<i style="width:${o.fill * 100}%"></i>` : i < o.phase ? '<i></i>' : ''}</span>`).join('');
    return `<div class="px-tm"><div class="row"><span class="ph">${PH[o.phase][0]}</span><span class="cd ${o.warn ? 'w' : ''}">${o.left}<small>left in ${PH[o.phase][0].toLowerCase()}</small></span><span class="tot">${o.total} / 3:00</span><span class="rs">${I.reset}</span></div><div class="bar">${bar}</div></div>`;
  };

  /* a whole entry screen inside data-phone-shell */
  const screen = (o) => `<div data-phone-shell data-time="${o.time || '11:43'}"${o.title ? ` data-title="${o.title}"` : ''}><div style="display:flex;flex-direction:column;height:100%;position:relative">
      ${o.top || ''}<div class="px-scroll">${o.body}</div>${o.bar === false ? '' : `<div class="ebar">${o.barNote ? `<div class="px-ebarnote">${o.barNote}</div>` : ''}<a class="btn primary block" ${o.barDisabled ? 'disabled' : ''}>${o.barText || 'Review entry'}</a></div>`}${o.over || ''}</div></div>`;
  const fig = (inner, cap) => `<figure class="frame"><div class="phone">${inner}</div><figcaption>${cap}</figcaption></figure>`;
  const card = (title, items) => `<div class="px-card"><h4>${title}</h4><ol>${items.map((i) => `<li><span>${i}</span></li>`).join('')}</ol></div>`;
  const page = (title, desc, figs, cardHtml) => {
    document.getElementById('root').innerHTML = `<div class="canvas"><div class="canvas-head"><b>${title}</b><span>${desc}</span></div><div class="frames">${figs.join('')}${cardHtml || ''}</div></div>`;
  };
  return { I, tabs, phead, head, number, multi, stars, slider, text, comp, sec, counter, select, timer, screen, fig, card, page };
})();

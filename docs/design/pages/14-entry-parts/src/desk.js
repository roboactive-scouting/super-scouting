// Desktop Entry page with the Phase 1 E parts. Uses 01-entry's E and this round's PX.
window.DX = (() => {
  const P = PX;
  const tick = '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>';
  const row = (label, hint, control, o = {}) => `<div class="dx-f"><div class="flbl">${label}${o.req ? '<span class="px-req">Required</span>' : ''}${hint ? `<small>${hint}</small>` : ''}</div><div>${control}</div></div>`;
  // reuse the phone builders, then drop their own label (the row has it)
  const ctl = (html) => `<div class="fld" style="padding:0;border:0">${html.replace(/^<div class="fld[^"]*">/, '').replace(/<\/div>$/, '').replace(/<div class="flbl">.*?<\/div>/, '')}</div>`;
  const PH = [['AUTO', 15], ['TELEOP', 135], ['ENDGAME', 30]];
  const timer = (phase, left, fill, total) => `<div class="dx-tm"><span class="ph">${PH[phase][0]}</span><span class="cd">${left}<small>left in ${PH[phase][0].toLowerCase()}</small></span>
      <span class="bar">${PH.map(([, s], i) => `<span style="flex:${s}" class="${i < phase ? 'done' : ''}">${i === phase ? `<i style="width:${fill * 100}%"></i>` : i < phase ? '<i></i>' : ''}</span>`).join('')}</span>
      <span class="tot">${total} / 3:00</span><span class="rs">${P.I.reset}</span></div>`;
  const side = (o) => `<div class="live" style="align-self:start">
      <h3>This entry</h3><div style="color:var(--muted);font-size:12.5px;margin:3px 0 12px">Select a phase to jump to it.</div>
      <div class="lrow done"><span class="ic">${tick}</span><span>Status</span><b>Played</b></div>
      <div class="lrow done"><span class="ic">${tick}</span><span>Autonomous</span><small>3 of 3</small></div>
      <div class="lrow ${o.warnTele ? 'warn' : 'cur'}"><span class="ic"></span><span>Teleop</span><small>${o.warnTele ? '1 to fix' : '4 of 5'}</small></div>
      <div class="lrow ${o.warnEnd ? 'warn' : ''}"><span class="ic"></span><span>Endgame</span><small>${o.warnEnd ? '1 to fix' : '0 of 3'}</small></div>
      <div class="lrow"><span class="ic"></span><span>Notes</span><small>0 of 4</small></div>
      <a class="btn primary" style="width:100%;margin-top:14px;height:48px">${o.practice ? 'Finish practice' : 'Review entry'}</a></div>`;
  const tabs = (cur, done) => `<div class="ptabs">${['Auto', 'Teleop', 'Endgame', 'Notes'].map((t, i) => `<span class="${i === cur ? 'on' : i < done ? 'done' : ''}">${i < done && i !== cur ? tick : ''}${t}</span>`).join('')}</div>`;
  const page = (o) => `<div class="desk final"><div data-desk-shell="scout" data-crumb="Scout / <b>Q39 · 1690 Orbit</b>">${o.strip || ''}<div class="dwrap">
      <div><div class="dhead"><div><h1><span class="num">Q39</span> · 1690 Orbit</h1><div class="meta"><span class="dot"></span>${o.meta || 'Draft saved on this device · 11:45'}</div></div><span class="tag red">Red alliance</span></div>
        <div style="margin-top:16px" class="lbl">Robot status</div><div>${E.status('seg')}</div>
        <div class="card" style="margin-top:14px">${o.timer || ''}${tabs(o.cur, o.cur)}<div class="pane">${P.phead(o.phase, o.cur + 1)}${o.fields}</div></div></div>
      ${side(o)}</div></div>${o.over || ''}</div>`;
  return { row, ctl, timer, page, P };
})();

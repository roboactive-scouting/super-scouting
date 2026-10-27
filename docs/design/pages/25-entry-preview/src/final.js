// Entry preview (25) — closed: variant B (score band, phase subtotals, points per row, form version)
// plus D's Team page and Edit buttons (Edit only for who may edit, SPEC-FINAL 7.6). Loads after ep.js.
window.FIN = (() => {
  const { head, sum, none, band, P, desk } = EP;
  const ic = (p) => `<svg viewBox="0 0 24 24" style="width:15px;height:15px">${p}</svg>`;
  const team = ic('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8"/>');
  const edit = ic('<path d="M4 20h4L19 9l-4-4L4 16z"/>');
  const view = '<svg viewBox="0 0 24 24" style="width:13px;height:13px"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
  const acts = (canEdit = true) => `<div class="ep-act"><span class="btn">${team}Team page</span>${canEdit ? `<span class="btn">${edit}Edit</span>` : ''}</div>`;
  const h = (o = {}) => head({ ...o }).replace(/ <span class="new">NEW<\/span>/g, '');
  const b = () => band().replace(/<span class="new">NEW<\/span>/g, '');

  const deskPage = () => desk(`${h({ dk: true, ver: true })}<div class="ep-dbody"><div class="tp-cols" style="grid-template-columns:1fr 1fr">${b()}<div style="align-self:end">${acts()}</div>${sum({ pts: true, only: ['Autonomous', 'Teleop', 'Endgame'] })}${sum({ only: ['Post-match'] })}</div></div>`);

  const superSum = `<div class="ep-sum"><div class="ep-ph"><h3>Auto</h3><div class="ep-row"><span class="n">Auto reliability</span><span class="v">Good</span></div><div class="ep-row map"><span class="n">Start position</span><span class="v"><b>1 spot</b><small>${view}Tap to view</small></span></div></div><div class="ep-ph"><h3>Teleop</h3><div class="ep-row"><span class="n">Driver skill</span><span class="v">Good</span></div><div class="ep-row"><span class="n">Defence</span><span class="v">Some</span></div><div class="ep-row"><span class="n">Penalties seen</span><span class="v">Pinning</span></div></div><div class="ep-ph"><h3>Notes</h3><div class="ep-row long"><span class="n">Strengths</span><span class="v">Fast cycles on the near side; quick to recover after contact</span></div></div></div>`;
  const p1 = () => P(`${h({ ver: true })}<div class="ep-pad">${b()}${sum({ pts: true, only: ['Autonomous', 'Teleop'] })}</div>`);
  const p2 = () => P(`${h({ meta: false })}<div class="ep-pad" style="padding-top:10px">${sum({ pts: true, only: ['Endgame', 'Post-match'] })}${acts()}</div>`, { time: '12:05' });
  const p3 = () => P(`${h({ status: 'n', match: 'Q26', who: 'Yael Shapira', ini: 'YS', when: '14/11/2026 13:20', ver: true })}<div class="ep-pad">${none('n')}${acts(false)}</div>`, { title: 'Q26 · 1690', time: '12:06' });
  const p4 = () => P(`${h({ super: true, who: 'Dana Mor', ini: 'DM', when: '14/11/2026 11:12', ver: true })}<div class="ep-pad">${superSum}${acts()}</div>`, { title: 'Super · 1690', time: '12:07' });
  return { deskPage, p1, p2, p3, p4 };
})();

// Team search (23) — closed: variant A2 (user 2026-10-23). "At this event" by default, no Other events
// column, the whole row opens the team page; other events go through the event picker and an are-you-sure.
window.FIN = (() => {
  const { V, P, desk, search, chips, rowOff, evPick, confirmSheet, confirmDlg, trLink, trOff2, tbl2, inEv, offEv, I, EV } = TS;
  const top = (on) => `<div class="ts-dhd"><div><h1>Search teams</h1><p>2026 season · 64 teams · ranks from ${EV}</p></div></div><div class="ts-dbar">${search('')}${chips(on)}</div>`;
  const deskAll = () => desk(`<div class="ts-dpad">${top('All')}${tbl2(inEv.slice(0, 6).map((t) => trLink(t)).join('') + offEv.map((t) => trOff2(t)).join(''))}</div>${confirmDlg()}`);
  const off3 = offEv.filter((t) => t[0] !== 1576);
  const p3 = () => P(`<div class="ts-pad">${search('30', { focus: 1 })}${chips('All')}<div class="ts-list">${off3.map((t) => rowOff(t, { q: '30' })).join('')}</div></div>${evPick()}`, { time: '12:26' });
  const p4 = () => P(`<div class="ts-pad">${search('30', { focus: 1 })}${chips('All')}<div class="ts-list">${off3.map((t) => rowOff(t, { q: '30' })).join('')}</div></div>${confirmSheet()}`, { time: '12:26' });
  const p5 = () => P(`<div class="ts-pad">${search('30', { focus: 1 })}${chips('All')}<div class="ts-offnote">${I.off}<span><b>Offline.</b> Other events need a connection; teams at ${EV.split(' · ')[0]} still open.</span></div><div class="ts-list">${off3.map((t) => rowOff(t, { q: '30', dis: 1 })).join('')}</div></div>`, { time: '12:27', offline: 1 });
  return { desk: () => V.a2.desk(), deskAll, p1: V.a2.p1, p2: V.a2.p2, p3, p4, p5 };
})();

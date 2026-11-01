// Entry search (26) — closed: variant A, the closed Entries page (05) plus a Both · Match · Super switch;
// the station tag is dropped from the table and the phone cards (user 2026-10-23). Loads after es.js.
window.FIN = (() => {
  const { V, P, desk, dhead, srch, chips4, seg, head, supCard, card, mixedCards, mixedRows, table, key, SUP } = ES;
  const noStn = (h) => h.replace(/<span class="stn [rb]">[^<]*<\/span>/g, '');
  const deskPage = () => desk(`<div class="es-dpad">${dhead()}<div class="es-dbar">${srch('')}<div class="es-chips">${chips4()}</div><span style="flex:1"></span>${seg('Both', 'dk')}</div>${noStn(table(mixedRows(11, { hov: 2 })))}${key}</div>`);
  const p1 = () => noStn(V.a.p1());
  const p2 = () => noStn(V.a.p2());
  const p3 = () => noStn(P(`<div class="es-pad">${head()}${srch('')}${seg()}<div class="es-chips">${chips4('Needs a look')}</div>${E.rows().filter((r) => r.sync === 'r' || r.flag).map((r) => card(r)).join('')}</div>`, { time: '12:32' }));
  const p4 = () => noStn(P(`<div class="es-pad">${srch('orbit')}${seg()}<div class="es-chips">${chips4('All', { all: 2 })}</div>${E.rows().filter((r) => r.tn === 1690).map((r) => card(r)).join('')}${supCard(SUP[0])}</div>`, { time: '12:33' }));
  return { deskPage, p1, p2, p3, p4 };
})();

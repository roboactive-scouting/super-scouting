// Discarded records (/sync/discarded): the read-only log of records removed after an admin hard-deleted their parent
// (SPEC-FINAL §9.7). Closed 2026-10-12: grouped by removal; no entered values (user). Loads after 05-entries/src/entries.js (E).
window.DL = (() => {
  const T = E.T;
  const ic = (p) => `<svg viewBox="0 0 24 24">${p}</svg>`;
  const I = {
    sync: ic('<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M3 21v-5h5"/>'),
    merge: ic('<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="12" r="2.5"/><path d="M6 8.5v7M8.3 7.2C12 9 13 11 15.5 12"/>'),
    gear: ic('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
    left: ic('<path d="M15 6l-6 6 6 6"/>'),
    info: ic('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
    bin: ic('<path d="M3 7h18M8 7V4h8v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>'),
    log: ic('<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>'),
  };
  const sv = (k) => E.svg(k);

  const G = [
    { when: 'Sun 12 Oct, 08:02', evt: 'District #2 · Haifa', recs: [
      { m: 'Q12', st: 'R2', tn: 3075, s: 'P', who: 'Noa Levi', at: 'Fri 10 Oct, 14:20' },
      { m: 'Q12', st: 'B1', tn: 1574, s: 'B', who: 'Noa Levi', at: 'Fri 10 Oct, 14:22' },
    ] },
    { when: 'Thu 9 Oct, 17:40', evt: 'Practice day', recs: [{ sup: true, tn: 4590, who: 'Omer Katz', at: 'Thu 9 Oct, 16:55' }] },
  ];
  const kind = (r) => (r.sup ? '<span class="sn-super">SUPER</span>' : '<span class="dl-kind">Match</span>');
  const why = `<div class="why">${I.info}An admin deleted the competition, season or form it belonged to.</div>`;
  const rec = (r) => `<div class="dl-rec"><div class="l1">${r.sup ? '' : `<span class="m">${r.m}</span>`}${r.st ? E.station(r.st) : ''}<span class="tn">${r.tn}</span><span class="nm">${T[r.tn]}</span><span class="rt">${r.sup ? kind(r) : E.status(r.s)}</span></div>
      <div class="l2"><span>${r.sup ? 'Super entry' : 'Match entry'} · ${r.who}</span><span>saved <span class="num">${r.at}</span></span></div></div>`;
  const group = (g) => `<div class="dl-lab">Removed ${g.when}<span class="r">${g.evt}</span></div><div class="dl-list">${g.recs.map(rec).join('')}</div>`;
  const head = `<span class="dl-back">${I.left}Sync</span><div><div class="cf-h1">Discarded records</div><div class="cf-sub">Entries removed from this phone because an admin deleted what they belonged to. Kept here for as long as the app is installed.</div></div>`;
  const empty = `<div class="cf-empty"><span class="ei" style="background:var(--line-2);color:var(--ink-2)">${I.log}</span><b>Nothing has been discarded</b><p>An entry is only removed when an admin deletes the competition, season or form it belonged to. If that happens, it is listed here.</p><a class="btn" style="margin-top:4px">Back to Sync</a></div>`;

  const PILL = "<span class='dot'></span>All sent";
  const screen = (body, o = {}) => `<div data-phone-shell data-time="${o.time || '08:10'}" data-title="Discarded" data-sync="${PILL}"><div class="cf-pad">${body}</div></div>`;
  const phones = () => [
    [screen(`${head}${why.replace('class="why"', 'class="cf-note" style="font-size:12.5px"')}${G.map(group).join('')}`), '1 · The log, newest removal first'],
    [screen(`${head}${empty}`, { time: '09:30' }), '2 · Nothing discarded'],
  ];
  const trow = (r) => `<tr><td class="m">${r.sup ? '' : r.m}</td><td>${r.st ? E.station(r.st) + ' ' : ''}<span class="tn">${r.tn}</span><span class="nm">${T[r.tn]}</span></td>
      <td>${r.sup ? kind(r) : E.status(r.s)}</td><td>${r.who}</td><td class="mu"><span class="num">${r.at}</span></td></tr>`;
  const desk = () => `<div class="dl-desk">${head.replace('this phone', 'this device')}${why.replace('class="why"', 'class="cf-note" style="font-size:13px"')}
      <div class="dl-card"><table class="dl-tbl"><tr><th>Match</th><th>Team</th><th>Status</th><th>Scouter</th><th>Saved</th></tr>
      ${G.map((g) => `<tr><td colspan="5" class="grp">Removed ${g.when}<span style="float:right;font-weight:600">${g.evt}</span></td></tr>${g.recs.map(trow).join('')}`).join('')}</table></div></div>`;

  const nav = () => {
    document.querySelectorAll('.side').forEach((s) => {
      const admin = [...s.querySelectorAll('.navg')].pop();
      admin.insertAdjacentHTML('afterend', `<div class="navg"><h6>This device</h6><a class="on">${I.sync}Sync</a><a>${I.merge}Conflicts</a><a>${I.gear}Settings</a></div>`);
    });
    document.querySelectorAll('header.top').forEach((t) => {
      const c = t.querySelectorAll('.chip');
      c[0].innerHTML = '<span class="dot"></span>All sent';
      c[1].innerHTML = '<span class="dot"></span>Online';
    });
  };
  return { phones, desk, nav };
})();

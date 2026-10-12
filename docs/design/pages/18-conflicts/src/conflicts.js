// Conflicts page (/conflicts), closed 2026-10-12: variant C (one scroll of cards showing only what differs; a settled
// card folds to a line with Undo, the resolve sent when Undo runs out) plus "n fields differ" and the Settled today log.
// Loads after 05-entries/src/entries.js (E: team names, station tags, icons).
window.CF = (() => {
  const T = E.T;
  const ic = (p) => `<svg viewBox="0 0 24 24">${p}</svg>`;
  const I = {
    sync: ic('<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M3 21v-5h5"/>'),
    merge: ic('<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="12" r="2.5"/><path d="M6 8.5v7M8.3 7.2C12 9 13 11 15.5 12"/>'),
    copy: ic('<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>'),
    gear: ic('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
    info: ic('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
    off: ic('<path d="M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2-1.5M2 8.8a15 15 0 0 1 4.2-2.7M22 8.8A15 15 0 0 0 11 5M12 20h.01"/>'),
  };
  const sv = (k) => E.svg(k);
  const first = (n) => n.split(' ')[0];

  // f: [label, copy A value, copy B value, differs]
  const C = [
    { kind: 'div', m: 'Q12', st: 'R2', tn: 2096, A: { who: 'Dana Levi', at: '09:09', live: true }, B: { who: 'Noa Cohen', at: '09:07' },
      f: [['Robot status', 'Played', 'Played'], ['Auto pieces', '3', '4', 1], ['Teleop pieces high', '7', '7'], ['Climb', 'High', 'Low', 1], ['Auto notes', 'Left the line late', 'Missed the first shot', 1], ['Teleop notes', 'Fast cycles', 'Fast cycles'], ['Defense', 'Good', 'Good']] },
    { kind: 'dup', m: 'Q14', st: 'B1', tn: 1690, A: { who: 'Yael Shapira', at: '09:31' }, B: { who: 'Omer Katz', at: '09:33', live: true },
      f: [['Robot status', 'Played', 'Broke down', 1], ['Auto pieces', '2', '2'], ['Teleop pieces high', '5', '3', 1], ['Climb', 'Low', 'Low'], ['Auto notes', '—', '—'], ['Teleop notes', '—', 'Stopped at 1:10', 1], ['Defense', 'OK', 'OK']] },
    { kind: 'div', sup: true, tn: 4338, A: { who: 'Tamar Mizrahi', at: '10:02', live: true }, B: { who: 'Amit Ben-David', at: '09:58' },
      f: [['Drive', 'Swerve', 'Swerve'], ['Strengths', 'Fast intake, good driver', 'Fast intake', 1], ['Concerns', 'Climb fails under defense', '—', 1]] },
  ];
  const nd = (c) => c.f.filter((x) => x[3]).length;
  const live = (c) => (c.A.live ? c.A : c.B);
  const other = (c) => (c.A.live ? c.B : c.A);
  const LIVE = '<span class="cf-live">Counted now</span>';
  const kind = (c) => (c.kind === 'dup' ? `<span class="cf-kind">${I.copy}Scouted twice</span>` : `<span class="cf-kind">${I.merge}Edited on two phones</span>`);
  const why = (c) =>
    c.kind === 'dup'
      ? `Two people scouted this robot in this match. ${first(live(c).who)}’s, entered later, is counted now; both are kept until you pick.`
      : `Two edits started from the same copy on different phones. ${first(live(c).who)}’s later edit is counted now; ${first(other(c).who)}’s is kept aside.`;
  const title = (c) => `${c.sup ? '<span class="sn-super">SUPER</span>' : `<span class="m">${c.m}</span>`}${c.st ? E.station(c.st) : ''}<span class="tn">${c.tn}</span><span class="nm">${T[c.tn]}</span>`;
  const head = (c, o = {}) => `<div class="cf-ih"><div class="l1">${title(c)}</div><div class="l1">${kind(c)}<span class="cf-nd">${nd(c)} fields differ</span></div>${o.why ? `<p>${why(c)}</p>` : ''}</div>`;
  const colHead = (p) => `<b>${first(p.who)}</b><span class="t">${p.at}</span> ${p.live ? LIVE : ''}`;
  const diff = (c, o = {}) => {
    const rows = o.all ? c.f : c.f.filter((x) => x[3]);
    const more = o.all ? `<tr class="more"><td colspan="3">Show only the differences ${sv('down').replace('<svg', '<svg style="transform:rotate(180deg)"')}</td></tr>` : `<tr class="more"><td colspan="3">Show the ${c.f.length - nd(c)} that match ${sv('down')}</td></tr>`;
    return `<table class="cf-diff"><colgroup><col class="f"><col><col></colgroup><tr><th>Field</th><th>${colHead(c.A)}</th><th>${colHead(c.B)}</th></tr>
      ${rows.map(([l, a, b, d]) => `<tr class="${d ? 'd' : ''}"><td>${l}</td><td>${a}</td><td>${b}</td></tr>`).join('')}${more}</table>`;
  };
  const acts = (c, o = {}) => {
    const dis = o.dis ? 'disabled' : '';
    const cls = o.stack ? 'cf-acts' : 'cf-acts2';
    if (c.kind === 'dup') return `<div class="${cls}"><a class="btn" ${dis}>Keep ${first(c.A.who)}’s</a><a class="btn" ${dis}>Keep ${first(c.B.who)}’s</a></div>`;
    return `<div class="${cls}"><a class="btn primary" ${dis}>Keep ${first(live(c).who)}’s</a><a class="btn" ${dis}>Restore ${first(other(c).who)}’s</a></div>`;
  };
  const card = (c, o = {}) => `<div class="cf-item">${head(c, o)}${diff(c, o)}${acts(c, o)}</div>`;
  const done = (n = 4) => `<div class="cf-done"><span class="ck">${sv('check')}</span><span><b>Kept Dana’s copy</b> · Q12 2096</span><span class="u">Undo <span class="num">${n}</span></span></div>`;
  const empty = `<div class="cf-empty"><span class="ei">${sv('check')}</span><b>Nothing left to review</b><p>Every copy is settled. New conflicts appear here after a sync.</p><a class="btn" style="margin-top:4px">Back to Sync</a></div>`;
  const log = `<div class="cf-lab">Settled today</div><div class="cf-log">
      <div>${sv('check')}<span><b>Q12 · 2096</b> kept Dana’s copy</span><span class="num" style="margin-left:auto">10:15 · Noa L.</span></div>
      <div>${sv('check')}<span><b>Q14 · 1690</b> kept Omer’s, removed Yael’s</span><span class="num" style="margin-left:auto">10:17 · Noa L.</span></div>
      <div>${sv('check')}<span><b>Super · 4338</b> kept Tamar’s</span><span class="num" style="margin-left:auto">10:18 · Noa L.</span></div></div>`;
  const offline = `<div class="cf-warnbar">${I.off}<span><b>Offline.</b> You can read these, but resolving needs a connection, because it settles the entry for everyone.</span></div>`;
  const scouter = `<div class="cf-note">${I.info}<span><b>A lead or an admin resolves these.</b> Until then the copy marked “Counted now” is the one in the statistics.</span></div>`;
  const pageHead = (sub) => `<div><div class="cf-h1">Conflicts</div><div class="cf-sub">${sub || 'District #3 · Tel Aviv · 3 to review'}</div></div>`;

  const PILL = { on: "<span class='dot'></span>All sent", off: "<span class='dot off'></span>Offline" };
  const screen = (body, o = {}) => `<div data-phone-shell data-time="${o.time || '10:14'}" data-title="Conflicts" data-sync="${PILL[o.pill || 'on']}"><div class="cf-pad">${body}</div></div>`;

  const phones = () => [
    [screen(`${pageHead()}${card(C[0])}${card(C[1])}`), '1 · One scroll: only what differs'],
    [screen(`${pageHead('District #3 · Tel Aviv · 2 to review')}${done()}${card(C[1])}${card(C[2])}`, { time: '10:15' }), '2 · Settled: folds, Undo counts down, then sends'],
    [screen(`${pageHead()}${offline}${card(C[0], { all: true, why: true, dis: true })}`, { pill: 'off', time: '10:21' }), '3 · Offline, one card opened in full'],
    [screen(`${pageHead()}${scouter}${card(C[0], { dis: true })}${card(C[1], { dis: true })}`, { time: '10:20' }), '4 · A scouter: read only'],
    [screen(`${pageHead('District #3 · Tel Aviv · all settled')}${empty}${log}`, { time: '10:19' }), '5 · All settled, with today’s log'],
  ];
  const dcard = (c) => `<div class="cf-item" style="display:grid;grid-template-columns:300px minmax(0,1fr)"><div style="border-right:1px solid var(--line-2)">${head(c, { why: true })}${acts(c, { stack: true })}</div><div>${diff(c)}</div></div>`;
  const desk = () => `<div class="cf-desk" style="max-width:1100px">${pageHead('District #3 · Tel Aviv · 2 to review')}${done()}${dcard(C[1])}${dcard(C[2])}</div>`;

  // After shell.js: the "This device" group (Sync, Conflicts on, Settings) and the top-bar chips.
  const nav = () => {
    document.querySelectorAll('.side').forEach((s) => {
      const admin = [...s.querySelectorAll('.navg')].pop();
      const cnt = (n, c) => `<span style="margin-left:auto;font-family:var(--font-num);font-size:12px;color:${c}">${n}</span>`;
      admin.insertAdjacentHTML('afterend', `<div class="navg"><h6>This device</h6><a>${I.sync}Sync</a><a class="on">${I.merge}Conflicts${cnt(2, '#f2c36b')}</a><a>${I.gear}Settings</a></div>`);
    });
    document.querySelectorAll('header.top').forEach((t) => {
      const c = t.querySelectorAll('.chip');
      c[0].innerHTML = '<span class="dot"></span>All sent';
      c[1].innerHTML = '<span class="dot"></span>Online';
    });
  };
  return { phones, desk, nav };
})();

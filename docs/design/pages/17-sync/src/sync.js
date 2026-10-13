// Sync page (/sync), closed 2026-10-12: variant B (status strip + Waiting / Sent / Problems tabs, tools in More)
// plus A's conflicts link and sending progress, and D's "shown by QR" mark and received-by-QR counts.
// Loads after 05-entries/src/entries.js (E: team names, robot status and station tags, icons).
window.SN = (() => {
  const T = E.T;
  const ic = (p) => `<svg viewBox="0 0 24 24">${p}</svg>`;
  const I = {
    sync: ic('<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M3 21v-5h5"/>'),
    qr: ic('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h3M21 18v3M17.5 17.5h.01"/>'),
    scan: ic('<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10"/>'),
    bin: ic('<path d="M3 7h18M8 7V4h8v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>'),
    log: ic('<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>'),
    merge: ic('<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="12" r="2.5"/><path d="M6 8.5v7M8.3 7.2C12 9 13 11 15.5 12"/>'),
    phone: ic('<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>'),
    plus: ic('<path d="M12 5v14M5 12h14"/>'),
    gear: ic('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
    eye: ic('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  };
  const sv = (k) => E.svg(k);

  // Waiting (unsynced) records; the count is the top-bar count.
  const P = [
    { m: 'Q39', st: 'B2', tn: 5951, s: 'P', at: '11:47', org: 'here', newm: true },
    { m: 'Q38', st: 'R3', tn: 4338, s: 'B', at: '11:41', org: 'qr', from: 'Yael' },
    { m: 'Super', tn: 1690, sup: true, at: '11:30', org: 'here' },
    { m: 'Q36', st: 'B2', tn: 5135, s: 'D', at: '11:25', org: 'here', rej: 'This entry is locked — ask a lead.', why: 'It was changed after its 5 minutes were up.' },
    { m: 'Q71', st: 'R1', tn: 2231, s: 'P', at: 'Sat 15:02', org: 'here', evt: 'District #2 · Haifa' },
  ];

  const SUPER = '<span class="sn-super">SUPER</span>';
  const org = (p) => (p.org === 'qr' ? `<span class="sn-org">${I.qr}QR · from ${p.from}</span>` : `<span class="sn-org">${I.phone}This phone</span>`);
  const ok = (t) => `<span class="sn-ok">${sv('check')}${t}</span>`;
  const newm = `<div class="sn-newm">${I.plus}New match — sends with this entry</div>`;
  const shown = `<span class="sn-shown">${I.qr}shown by QR <span class="num">11:44</span></span>`;
  const err = (p, o = {}) =>
    `<div class="sn-err">${sv('alert')}<div><b>Not sent:</b> ${p.rej}${o.why ? ` <span style="color:var(--muted)">${p.why}</span>` : ''}${o.open ? `<div class="acts"><span class="sn-mini">${I.eye}Open entry</span></div>` : ''}</div></div>`;

  // Record card (phone). o: sent, sending, shown, why, open
  const rec = (p, o = {}) => `<div class="sn-rec ${o.sent ? 'sent' : ''} ${o.sending ? 'sending' : ''}">
      <div class="l1">${p.sup ? '' : `<span class="m">${p.m}</span>`}<span class="tn">${p.tn}</span><span class="nm">${T[p.tn]}</span>
        <span class="rt">${o.sending ? '<span class="sn-spin"></span>' : ''}${o.sent ? ok(o.sent) : ''}${p.sup ? SUPER : E.status(p.s)}</span></div>
      <div class="l2">${p.st ? E.station(p.st) : ''}<span>saved <span class="num">${p.at}</span></span>${org(p)}${o.shown && !p.rej ? shown : ''}</div>
      ${p.newm && !o.sent ? newm : ''}${p.rej ? err(p, o) : ''}</div>`;

  // Table row (computer)
  const trow = (p) => {
    const note = p.rej ? `<span class="sn-up">${sv('alert')}Not sent</span>` : p.newm ? `<span class="sn-newm" style="display:inline-flex">${I.plus}New match — sends with this entry</span>` : '';
    return `<tr class="${p.rej ? 'has-note' : ''}"><td class="m">${p.sup ? '' : p.m}</td>
      <td>${p.st ? E.station(p.st) + ' ' : ''}<span class="tn">${p.tn}</span><span class="nm">${T[p.tn]}</span></td>
      <td>${p.sup ? SUPER : E.status(p.s)}</td><td class="mu"><span class="num">${p.at}</span></td><td>${org(p)}</td><td>${note}</td></tr>` +
      (p.rej ? `<tr class="note"><td></td><td colspan="5">${err(p, { why: true, open: true })}</td></tr>` : '');
  };
  const grp = (t, r) => `<tr><td colspan="6" class="grp">${t}<span style="float:right;font-weight:600">${r}</span></td></tr>`;
  const table = (rows) => `<table class="sn-tbl"><tr><th>Match</th><th>Team</th><th>Status</th><th>Saved</th><th>Made on</th><th></th></tr>${rows.join('')}</table>`;

  // Status strip: off · sending · on
  const strip = (k, more) => {
    const m = more ? `<span class="sn-more-btn">⋯</span>` : '';
    if (k === 'sending')
      return `<div class="sn-strip"><span class="w"><b><span class="sn-spin"></span>Sending…</b><div class="sn-prog" style="margin-top:6px"><div class="l">Sent<span class="num">2 of 5</span></div><div class="bar"><i style="width:40%"></i></div></div></span><a class="btn primary" disabled>Sending…</a>${m}</div>`;
    if (k === 'on')
      return `<div class="sn-strip"><span class="w"><b><span class="dot"></span>Online</b><small>last sync <span class="num">11:49</span></small></span><a class="btn primary">${I.sync}Sync now</a>${m}</div>`;
    return `<div class="sn-strip"><span class="w"><b><span class="dot off"></span>Offline</b><small>last sync <span class="num">11:40</span> · sends by itself</small></span><a class="btn primary">${I.sync}Sync now</a>${m}</div>`;
  };
  const tabs = (on, n = [5, 27, 1]) =>
    `<div class="sn-tabs">${[['Waiting', n[0]], ['Sent', n[1]], ['Problems', n[2]]].map(([l, c], i) => `<span class="${i === on ? 'on' : ''}">${i === 2 && c ? '<i class="wn"></i>' : ''}${l} <span class="num">${c}</span></span>`).join('')}</div>`;
  const conf = `<div class="sn-conf"><span class="ic">${I.merge}</span><span><b>2 conflicts to review</b><small>Two copies of the same entry. A lead picks.</small></span><span class="go">Review${sv('chev')}</span></div>`;
  const grouped = (o = {}) => `<div class="sn-list"><div class="sn-grp">District #3 · Tel Aviv<span class="r">this event · 4</span></div>${P.slice(0, 4).map((p) => rec(p, o)).join('')}
      <div class="sn-grp">District #2 · Haifa<span class="r">earlier event · 1</span></div>${rec(P[4], o)}</div>`;
  const discNotice = `<div class="sn-notice">${sv('alert')}<div><b>2 entries were removed from this phone.</b> An admin deleted the event they belonged to, so they can’t be sent.<ul><li>Q12 · 3075 Ha-Dream Team · Noa · Fri 14:20</li><li>Q12 · 1574 MisCar · Noa · Fri 14:22</li></ul>
      <div class="acts"><span class="sn-mini">Dismiss</span><span class="sn-mini">${I.log}See the log</span></div></div></div>`;
  const moreItems = () => `<div class="sn-mi">${I.qr}<span><b>Send by QR</b><small>To the collector tablet. No internet needed.</small></span></div>
      <div class="sn-mi">${I.scan}<span><b>Receive by QR</b><small>On the collector tablet: scan another phone.</small></span></div>
      <div class="sn-mi">${I.log}<span><b>Discarded records</b><small>2 removed because their event was deleted.</small></span></div><div style="height:1px;background:var(--line-2);margin:4px 8px"></div>
      <div class="sn-mi dis">${I.bin}<span><b>Discard received QR data</b><small>Held: 1 received copy hasn’t reached the cloud.</small></span></div>`;
  const who = (av, n, t, s) => `<div class="sn-who"><span class="av">${av}</span><span class="t"><b>${t}</b><small>${s}</small></span><span class="n">${n}</span></div>`;
  const received = `<div class="sn-list"><div class="sn-grp">Received by QR<span class="r">12 from 3 scouters</span></div>${who('YS', 5, 'Yael Shapira', 'last scan 11:44')}${who('OK', 4, 'Omer Katz', 'last scan 11:38')}${who('AB', 3, 'Amit Ben-David', 'last scan 11:31')}</div>`;
  const head = (sub) => `<div><div class="sn-h1">Sync</div><div class="sn-sub">${sub || 'What this phone has sent, and what is still waiting.'}</div></div>`;

  // Shell bits
  const PILL = {
    off: "<span class='dot off'></span>Offline · 5",
    sending: "<span class='sn-spin'></span>Sending · 5",
    on: "<span class='dot w'></span>1 waiting",
    on4: "<span class='dot w'></span>4 waiting",
    tab: "<span class='dot off'></span>Offline · 17",
  };
  const screen = (body, o = {}) => `<div data-phone-shell data-time="${o.time || '11:48'}" data-title="Sync" data-sync="${PILL[o.pill || 'off']}"><div class="sn-pad">${body}</div></div>${o.over || ''}`;

  const phones = () => [
    [screen(`${head()}${strip('off', true)}${conf}${tabs(0)}${grouped()}`), '1 · Waiting, grouped by competition (a lead sees conflicts)'],
    [screen(`${head()}${strip('sending', true)}${tabs(0, [3, 29, 1])}<div class="sn-list">${rec(P[0], { sent: '11:49' })}${rec(P[1], { sent: '11:49' })}${rec(P[2], { sending: true })}${rec(P[3])}</div>`, { pill: 'sending', time: '11:49' }), '2 · Sending: progress, rows tick off'],
    [screen(`${head()}${strip('on', true)}${tabs(2, [1, 31, 1])}<div class="sn-list">${rec(P[3], { why: true, open: true })}</div>${discNotice}`, { pill: 'on', time: '11:52' }), '3 · Problems: the refused entry and what was discarded'],
    [screen(`${head()}${strip('off', true)}${tabs(0)}${grouped()}`, { over: `<div class="sn-scrim"></div><div class="sn-sheet"><span class="grab"></span><h3>More</h3>${moreItems()}</div>` }), '4 · More (⋯): QR and the escape hatch'],
    [screen(`${head()}${strip('off', true)}${tabs(0, [4, 27, 1])}<div class="sn-list">${P.filter((p) => !p.rej).map((p) => rec(p, { shown: true })).join('')}</div>`, { pill: 'on4', time: '11:45' }), '5 · After Send by QR: “shown by QR”, still waiting'],
    [screen(`${head('What this tablet has sent, and what is still waiting.')}${strip('off', true)}${tabs(0, [17, 40, 0])}${received}<div class="sn-list"><div class="sn-grp">District #3 · Tel Aviv<span class="r">this event · 17</span></div>${rec(P[1])}${rec({ ...P[0], org: 'qr', from: 'Omer' })}</div>`, { pill: 'tab', time: '11:46' }), '6 · Collector tablet: received copies by scouter'],
  ];
  const desk = () => `<div class="sn-desk"><div style="display:flex;align-items:flex-end;gap:12px"><div style="flex:1">${head('What this device has sent, and what is still waiting.')}</div><a class="btn">⋯ More</a></div>
      <div style="display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:14px">${strip('off')}${conf}</div>
      <div style="width:520px">${tabs(0)}</div>
      <div class="sn-card">${table([grp('District #3 · Tel Aviv', 'this event · 4'), ...P.slice(0, 4).map(trow), grp('District #2 · Haifa', 'earlier event · 1'), trow(P[4])])}</div></div>`;

  // After shell.js: the "This device" group (Sync on, Conflicts for leads, Settings) and the top-bar chips.
  const nav = () => {
    document.querySelectorAll('.side').forEach((s) => {
      const admin = [...s.querySelectorAll('.navg')].pop();
      const cnt = (n, c) => `<span style="margin-left:auto;font-family:var(--font-num);font-size:12px;color:${c}">${n}</span>`;
      admin.insertAdjacentHTML('afterend', `<div class="navg"><h6>This device</h6><a class="on">${I.sync}Sync${cnt(5, '#f2c36b')}</a><a>${I.merge}Conflicts${cnt(2, 'var(--rail-muted)')}</a><a>${I.gear}Settings</a></div>`);
    });
    document.querySelectorAll('header.top').forEach((t) => {
      const c = t.querySelectorAll('.chip');
      c[0].innerHTML = '<span class="dot w"></span>5 waiting to send';
      c[1].innerHTML = '<span class="dot off"></span>Offline';
    });
  };
  return { phones, desk, nav };
})();

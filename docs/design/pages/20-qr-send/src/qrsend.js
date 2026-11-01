// Page 20, QR send (/sync/qr/send, task 1.47), final: variant A, the dark full-screen plate (closed 2026-10-20).
// No Stop: Done closes it (Esc on a computer), and nothing is marked sent either way.
// Loads after 05-entries/src/entries.js (E) and 17-sync/src/sync.js (SN: the Sync page under the computer's dialog).
window.QS = (() => {
  const ic = (p) => `<svg class="qsv" viewBox="0 0 24 24">${p}</svg>`;
  const I = {
    next: ic('<path d="M9 5l7 7-7 7"/>'),
    back: ic('<path d="M15 5l-7 7 7 7"/>'),
    sun: ic('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    check: ic('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    cloud: ic('<path d="M7 18a5 5 0 0 1-.9-9.9A6 6 0 0 1 17.7 9 4.5 4.5 0 0 1 17 18z"/>'),
  };

  // A version-40-looking code (177 modules + 4 quiet), drawn black on white by draw().
  const qr = (seed, cls = '') => `<div class="qs-qr ${cls}"><canvas data-qr="${seed}"></canvas></div>`;
  const draw = () => {
    document.querySelectorAll('canvas[data-qr]').forEach((cv) => {
      const N = 177, q = 4, px = 3, M = N + 2 * q;
      cv.width = cv.height = M * px;
      const g = cv.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, M * px, M * px); g.fillStyle = '#000';
      let s = +cv.dataset.qr || 7;
      const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      const res = new Uint8Array(N * N);
      const set = (x, y, v) => { if (x < 0 || y < 0 || x >= N || y >= N) return; res[y * N + x] = 1; if (v) g.fillRect((x + q) * px, (y + q) * px, px, px); };
      const finder = (ox, oy) => { for (let y = -1; y < 8; y++) for (let x = -1; x < 8; x++) { const d = Math.max(Math.abs(x - 3), Math.abs(y - 3)); set(ox + x, oy + y, d !== 2 && d !== 4); } };
      finder(0, 0); finder(N - 7, 0); finder(0, N - 7);
      const P = [6, 30, 58, 86, 114, 142, 170];
      P.forEach((cy) => P.forEach((cx) => {
        if (res[cy * N + cx]) return;
        for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) set(cx + x, cy + y, Math.max(Math.abs(x), Math.abs(y)) !== 1);
      }));
      for (let i = 8; i < N - 8; i++) { if (!res[6 * N + i]) set(i, 6, i % 2 === 0); if (!res[i * N + 6]) set(6, i, i % 2 === 0); }
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!res[y * N + x] && rnd() < 0.5) g.fillRect((x + q) * px, (y + q) * px, px, px);
    });
  };

  // Frame strip: one segment per frame; the one on screen white, the ones already shown this pass filled.
  const strip = (n, cur, dark) => `<div class="qs-strip ${dark ? 'dark' : ''}">${Array.from({ length: n }, (_, i) => `<i class="${i + 1 === cur ? 'on' : i + 1 < cur ? 'done' : ''}"></i>`).join('')}</div>`;
  const counter = (cur, n) => `<span class="qs-count" role="status">Frame <b>${cur}</b> of <b>${n}</b></span>`;
  const sbar = (time) => `<div class="sbar"><span>${time}</span><span style="font-size:11px">● ● ●</span></div>`;
  const empty = `<div class="qs-empty on-dark"><span class="ic">${I.cloud}</span><b>Nothing to send</b><p>Everything on this phone has already reached the cloud.</p><a class="btn">${I.back}Back to Sync</a></div>`;
  const NOTE = '<small>Nothing is marked sent. These records wait for the cloud as before.</small>';

  const head = (sub, awake) => `<div class="qa-head"><span class="t">Send by QR<small>${sub}</small></span>${awake ? `<span class="qa-awake">${I.sun}Screen stays on</span>` : ''}</div>`;
  // o: seed, n, cur, time, sub, batch ([k, of, records line]), empty
  const phone = (o) => {
    const last = !o.batch || o.batch[0] === o.batch[1];
    return `${sbar(o.time || '11:44')}<div class="pbody qa">${head(o.sub || '12 entries · 1 super entry', !o.empty)}
      ${o.empty ? empty : `
      ${o.batch ? `<div class="qa-batch"><span>Batch <b>${o.batch[0]}</b> of <b>${o.batch[1]}</b></span><small>${o.batch[2]}</small></div>` : ''}
      ${qr(o.seed, 'qa-qr')}
      <div class="qa-meta">${strip(o.n, o.cur, true)}<div class="qa-line">${counter(o.cur, o.n)}<span class="lp">loops by itself</span></div></div>
      <p class="qa-hint">Hold the phone still, about 20 cm from the tablet’s camera.</p>
      <div class="qa-foot">${last ? `<a class="btn primary block">${I.check}Done — back to Sync</a>`
        : `<div class="row"><a class="btn sec">Done</a><a class="btn primary">Next batch ${I.next}</a></div>`}${NOTE}</div>`}</div>`;
  };

  const desk = () => `<div class="qs-dlg-wrap"><div class="qs-dlg qa-dlg">
      <div class="qa-dl">${qr(11, 'qa-qr')}</div>
      <div class="qa-dr"><div class="qa-dh"><b>Send by QR</b></div>
        <p class="mu">To the collector tablet. No internet needed.</p>
        <div class="qa-big">${counter(4, 11)}</div>${strip(11, 4)}
        <p class="mu" style="margin-top:2px">Loops 1…11 by itself. A frame the tablet misses comes round again.</p>
        <div class="qs-what"><b>In this code</b><span>12 entries · 1 super entry</span><span class="mu">Q28–Q39 · saved before 11:44</span></div>
        <p class="qs-note">${I.sun}Screen stays on while this is open</p>
        <div style="margin-top:auto;display:flex;flex-direction:column;gap:8px"><a class="btn primary">${I.check}Done — back to Sync</a>
        <small class="mu">Nothing is marked sent. These records wait for the cloud as before.</small></div></div></div></div>`;
  const deskOver = () => `<div data-desk-shell="sync" data-crumb="This device / <b>Sync</b>">${SN.desk()}</div>${desk()}`;

  const phones = () => [
    [phone({ seed: 3, n: 11, cur: 4 }), '1 · Showing: the frames loop by themselves'],
    [phone({ seed: 5, n: 13, cur: 9, batch: [1, 2, '200 of 205 records'], sub: '205 records · 2 batches', time: '11:45' }), '2 · Over 200 records: batch 1 of 2'],
    [phone({ seed: 21, n: 1, cur: 1, batch: [2, 2, 'the last 5 records'], sub: '205 records · 2 batches', time: '11:45' }), '3 · The last batch ends with Done'],
    [phone({ empty: true, sub: 'To the collector tablet', time: '11:52' }), '4 · Nothing waiting'],
  ];
  return { phones, deskOver, draw };
})();

// Page 21, QR receive (/sync/qr/receive, task 1.48), final: variant C, big status seen from both sides, plus one
// green cell per frame so the user sees which frames are still missing (user, 2026-10-20).
// Loads after 20-qr-send/src/qrsend.js (QS.draw draws the code the held phone shows).
window.QV = (() => {
  const ic = (p) => `<svg class="qsv" viewBox="0 0 24 24">${p}</svg>`;
  const I = {
    check: ic('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    cam: ic('<path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="4"/>'),
    camoff: ic('<path d="M3 3l18 18M9 4h6l2 2h2a2 2 0 0 1 2 2v9M17.5 19.5H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1"/><path d="M9.5 10.5a4 4 0 0 0 5 5"/>'),
    sound: ic('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
    alert: ic('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.01"/>'),
    info: ic('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>'),
  };

  // The camera view: a stand-in feed with a phone held up showing its code, and aim corners.
  const cam = (o = {}) => `<div class="qv-cam ${o.cls || ''}">
      <div class="held" style="transform:rotate(${o.tilt ?? -5}deg)"><div class="scr"><div class="qs-qr"><canvas data-qr="${o.seed || 3}"></canvas></div></div></div>
      <span class="aim"></span>${o.over || ''}</div>`;
  // Frame cells: one per frame, numbered, green once collected (any order).
  const cells = (n, got, o = {}) => `<div class="qv-cells ${o.light ? '' : 'dark'}" style="grid-template-columns:repeat(${n},1fr)">${Array.from({ length: n }, (_, i) => `<i class="${got.includes(i + 1) ? 'on' : ''}">${i + 1}</i>`).join('')}</div>`;
  const GOT = [1, 2, 4, 5, 7, 8, 10];
  const ring = (k, n, big) => {
    const r = 54, c = 2 * Math.PI * r;
    return `<div class="qv-ring ${big ? 'big' : ''}"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="${r}"/><circle class="v" cx="60" cy="60" r="${r}" stroke-dasharray="${(k / n) * c} ${c}"/></svg><span><b class="num">${k}</b><small>of ${n}</small></span></div>`;
  };
  const sbar = (time) => `<div class="sbar"><span>${time}</span><span style="font-size:11px">● ● ●</span></div>`;
  const top = `<div class="qv-ctop"><span class="t">Receive by QR</span><span class="qv-snd">${I.sound}Sound on</span></div>`;
  const back = (cls = 'sec') => `<div class="qa-foot" style="padding:0 16px"><a class="btn ${cls} block">Done — back to Sync</a></div>`;

  // o: seed, time, done, bad, blocked
  const phone = (o) => {
    if (o.done)
      return `${sbar(o.time)}<div class="pbody qv-c won">${top}
        <div class="qv-win"><span class="ck">${I.check}</span><b>Got it, Yael!</b><span class="big num">13</span><small>records · 12 entries, 1 super</small>
          <p>Next phone, step up.</p><span class="qv-hint">${I.info}Her phone shows Next batch? Tap it there, then scan again.</span></div>
        <div class="qa-foot" style="padding:0 16px"><a class="btn primary block">${I.cam}Scan the next phone</a><a class="btn ghost-w block">Done — back to Sync</a></div></div>`;
    if (o.blocked)
      return `${sbar(o.time)}<div class="pbody qv-c">${top}<div class="qv-blocked on-dark"><span class="ic">${I.camoff}</span><b>The camera is blocked</b><p>Allow the camera for this site in the browser’s settings, then try again.</p><a class="btn">${I.cam}Try again</a></div>${back()}</div>`;
    const k = o.bad ? 0 : GOT.length;
    return `${sbar(o.time)}<div class="pbody qv-c">${top}
      ${cam({ seed: o.seed, cls: 'tall', over: o.bad ? `<div class="qv-bad">${I.alert}<b>That code was damaged</b><small>Starting again, hold still</small></div>` : '' })}
      <div class="qv-cbar">${ring(k, 11)}<div><b>${o.bad ? 'Scanning again' : 'Scanning…'}</b><small>${o.bad ? 'The pieces did not add up. Nothing was saved.' : 'Missing frames come round again.'}</small></div></div>
      <div class="qv-cellrow">${cells(11, o.bad ? [] : GOT)}</div>
      ${back()}</div>`;
  };

  const desk = () => `<div class="qv-cdesk">${cam({ seed: 4, cls: 'wide' })}<div class="qv-cside"><div class="qv-ctop" style="padding:0"><span class="t" style="font-size:22px">Receive by QR</span><span class="qv-snd">${I.sound}Sound on</span></div>
      ${ring(7, 11, true)}<b style="font-size:18px">Scanning…</b>${cells(11, GOT, { light: true })}<span class="mu">7 of 11 frames, in any order. A green screen and a beep mean it is done.</span>
      <a class="btn" style="margin-top:auto">Done — back to Sync</a></div></div>`;

  const phones = () => [
    [phone({ seed: 3, time: '11:44' }), '1 · Scanning: the ring and one cell per frame'],
    [phone({ done: true, time: '11:45' }), '2 · Done: green screen, name, beep'],
    [phone({ seed: 7, bad: true, time: '11:46' }), '3 · A damaged code: starts again'],
    [phone({ blocked: true, time: '11:40' }), '4 · Camera blocked'],
  ];
  return { phones, desk };
})();

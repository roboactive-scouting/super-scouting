// Settings round: section builders and the page composer. Loads after 01-entry/src/entry.js and 14-entry-parts/src/parts.js (PX).
window.ST = (() => {
  const P = PX;
  const ic = (p) => `<svg viewBox="0 0 24 24">${p}</svg>`;
  const I = {
    sun: ic('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    text: ic('<path d="M4 7V5h16v2M12 5v14M9 19h6"/>'),
    screen: ic('<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>'),
    vib: ic('<rect x="7" y="4" width="10" height="16" rx="2"/><path d="M3 9v6M21 9v6"/>'),
    dev: ic('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'),
    chev: ic('<path d="M9 6l6 6-6 6"/>'),
    gear: ic('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    menu: ic('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  };
  const NEW = window.FINAL ? '' : '<span class="new">NEW</span>';

  const mini = (theme) => `<div class="mini" data-theme="${theme}"><div class="tb"></div><div class="bd"><span class="l1"></span><span class="l2"></span><span class="al"><i class="r"></i><i class="b"></i></span><span class="bt"></span></div></div>`;
  const themes = (on) => `<div class="st-themes">
      <div class="st-th ${on === 'light' ? 'on' : ''}">${mini('light')}<div class="t"><span class="rd"></span><span><b>Light</b><small>The everyday look</small></span></div></div>
      <div class="st-th ${on === 'outdoor' ? 'on' : ''}">${mini('outdoor')}<div class="t"><span class="rd"></span><span><b>Outdoor</b><small>Black on white, stronger colours, for sunlight</small></span></div></div></div>`;
  const STEPS = [[1, '100%', 14], [1.15, '115%', 16], [1.3, '130%', 18], [1.5, '150%', 21]];
  const size = (on) => `<div class="st-seg">${STEPS.map(([k, l, px]) => `<span class="${k === on ? 'on' : ''}"><b style="font-size:${px}px">Aa</b><small>${l}</small></span>`).join('')}</div>`;
  const sample = (scale) => `<div class="st-sample" style="font-size:${14 * scale}px"><b>Pieces scored high</b><small style="font-size:${12.5 * scale}px">This is how labels and hints will read.</small></div>`;
  const sw = (t, sub, on, o = {}) => `<div class="st-sw"><span class="t"><b>${t}</b><small>${sub}</small></span><span class="st-swi ${on ? 'on' : ''} ${o.dis ? 'dis' : ''}"></span></div>`;

  const secTheme = (on) => `<div class="st-sec"><h3>Theme<small>Saved on this device only.</small></h3>${themes(on)}</div>`;
  const secSize = (on) => `<div class="st-sec"><h3>Text size<small>On top of your phone’s own text size.</small></h3>${size(on)}${sample(on)}</div>`;
  const secMatch = (o = {}) => `<div class="st-sec"><h3>During a match</h3>${sw('Keep the screen on', 'While an entry is open, the screen never dims.', true)}<div class="st-hr"></div>
      ${sw('Vibrate on taps', o.ios ? 'This phone doesn’t support vibration.' : 'A short buzz on every counter and button tap.', !o.ios, { dis: o.ios })}</div>`;
  const secDevice = (o = {}) => `<div class="st-sec"><h3>This device</h3>
      <div class="st-kv"><span>Signed in as</span><b>Noa Levi · Scout lead</b></div>
      <div class="st-kv"><span>Competition</span><b>Israel District #1</b></div>
      <div class="st-kv"><span>Waiting to send</span><b>${o.waiting ?? 3} entries</b></div>
      <div class="st-kv"><span>Version</span><code>9b102cd</code></div>
      <div class="st-wipe"><span style="font-size:13.5px;color:var(--ink-2)"><b>Wipe this device</b> — removes everything this app keeps here and signs out. For a phone you are handing on.</span>
        <a class="btn ink" ${o.waiting === 0 ? '' : 'disabled'}>Wipe this device</a>${o.waiting === 0 ? '' : `<small>⚠ Send the ${o.waiting ?? 3} waiting entries first</small>`}</div></div>`;

  const title = `<div><div class="st-h1">Settings</div><div class="st-sub">For this device only. Nothing here changes other phones.</div></div>`;
  const screen = (body, o = {}) => `<div data-phone-shell data-time="${o.time || '09:12'}" data-title="Settings">${body}</div>${o.over || ''}`;

  const tall = (o) => {
    const fig = (inner, cap, theme) => `<figure class="frame"><div class="phone" ${theme ? `data-theme="${theme}"` : ''} style="position:relative">${inner}</div><figcaption>${cap}</figcaption></figure>`;
    document.getElementById('root').innerHTML = `<div class="canvas tall">
      <div class="canvas-head"><b>${o.title}</b><span>${o.desc}</span></div>
      <div class="st-row">${o.phones.map(([h, c, t]) => fig(h, c, t)).join('')}${o.card}</div>
      <div class="st-row2"><figure class="frame"><div class="desk"><div data-desk-shell="settings" data-crumb="This device / <b>Settings</b>">${o.desk}</div></div><figcaption>${o.deskCap}</figcaption></figure></div></div>`;
  };
  const card = (items, layout) => `<div class="st-card"><h4>New in this variant</h4><p>Not in the spec today. For each: now · not now, but wanted · not at all.</p><ol>${items.map((i) => `<li><span>${i}</span></li>`).join('')}</ol><div class="lay">${layout}</div></div>`;
  // After shell.js: a "This device" group with Settings in the sidebar.
  const nav = () => document.querySelectorAll('.side').forEach((s) => {
    const admin = [...s.querySelectorAll('.navg')].pop();
    admin.insertAdjacentHTML('afterend', `<div class="navg"><h6>This device</h6><a class="on">${I.gear}Settings</a></div>`);
  });
  // Final (variant C rows; the choices open in sheets with live examples), chosen 2026-10-09.
  const li = (icn, t, sub, v) => `<div class="st-li"><span class="ic">${icn}</span><span class="t"><b>${t}</b>${sub ? `<small>${sub}</small>` : ''}</span><span class="v">${v}</span></div>`;
  const finalRows = (theme, sizeLabel, o = {}) => `<div class="st-pad">${title}<div class="st-lab">Look</div><div class="st-list">${li(I.sun, 'Theme', '', `${theme}${I.chev}`)}${li(I.text, 'Text size', '', `${sizeLabel}${I.chev}`)}</div>
      <div class="st-lab">During a match</div><div class="st-list">${li(I.screen, 'Keep the screen on', 'while an entry is open', '<span class="st-swi on"></span>')}${li(I.vib, 'Vibrate on taps', o.ios ? 'this phone can’t vibrate' : 'a short buzz on each tap', `<span class="st-swi ${o.ios ? 'dis' : 'on'}"></span>`)}</div>
      <div class="st-lab">This device</div><div class="st-list">${li(I.dev, 'Noa Levi · Scout lead', 'Israel District #1 · version 9b102cd', '')}${li(I.dev, 'Wipe this device', o.waiting === 0 ? 'removes everything this app keeps here' : `held: ${o.waiting ?? 3} entries waiting to send`, I.chev)}</div></div>`;
  const preview = (scale) => `<div class="st-prev"><span class="cap">PREVIEW</span><div class="bd" style="zoom:${scale}">${P.counter('Pieces scored high', 4, 'Upper goal')}${P.select('Climb level', ['None', 'Low', 'High'], 'High')}</div></div>`;
  // Theme sheet: a live example (the same preview as Text size) drawn in the theme being picked, then the tiles.
  const themeSheet = (on) => `<div class="st-scrim"></div><div class="st-sheet"><span class="grab"></span><h3>Theme</h3><div data-theme="${on}" style="border-radius:var(--radius-card)">${preview(1)}</div>${themes(on)}<a class="btn primary block">Done</a></div>`;
  const sizeSheet = (on) => `<div class="st-scrim"></div><div class="st-sheet"><span class="grab"></span><h3>Text size</h3><div style="font-size:12.5px;color:var(--muted);margin-top:-6px">On top of your phone’s own text size.</div>${preview(on)}${size(on)}<a class="btn primary block">Done</a></div>`;
  const wipeSheet = `<div class="st-scrim"></div><div class="st-sheet"><span class="grab"></span><h3>Wipe this device?</h3>
      <p style="font-size:13.5px;color:var(--ink-2);line-height:1.45">Removes everything this app keeps on this phone and signs out. For a phone you are handing on.</p>
      <div class="px-draft" style="margin:0;border-left-color:var(--warn)"><div class="t"><span><b>3 entries are still waiting to send.</b> Wipe is held until they are sent, so nothing is lost.</span></div></div>
      <a class="btn" style="width:100%">Keep this device</a><a class="btn ink" style="width:100%;background:var(--ink);color:var(--surface)" disabled>Wipe this device</a></div>`;
  return { finalRows, preview, themeSheet, sizeSheet, wipeSheet, P, I, NEW, themes, size, sample, sw, secTheme, secSize, secMatch, secDevice, title, screen, tall, card, nav, STEPS };
})();

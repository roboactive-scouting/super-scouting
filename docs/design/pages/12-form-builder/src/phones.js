// Scouter phone: map fields (position, cycle path, event log "where") open a full-screen map.
// Loads after builder.js and complex.js. Colours come only from theme.css.
window.FP = (() => {
  const { svg } = FB;
  const icon = (p) => `<svg viewBox="0 0 24 24">${p}</svg>`;
  const undo = icon('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>');
  const plus = icon('<path d="M12 5v14M5 12h14"/>');
  const chevr = icon('<path d="M9 6l6 6-6 6"/>');
  const x = icon('<path d="M6 6l12 12M18 6 6 18"/>');
  const erase = icon('<path d="m7 21-4.3-4.3a2.4 2.4 0 0 1 0-3.4l9.6-9.6a2.4 2.4 0 0 1 3.4 0l5.6 5.6a2.4 2.4 0 0 1 0 3.4L13 21"/><path d="M22 21H7M5 11l9 9"/>');

  // Portrait field: red end at the bottom. Field coords [x along the length from red, y across].
  let OWN = 'red';
  const D = ([fx, fy]) => (OWN === 'blue'
    ? [((1 - fy) * 100).toFixed(1), (fx * 200).toFixed(1)]
    : [(fy * 100).toFixed(1), (200 - fx * 200).toFixed(1)]);
  const hex = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
  const fieldV = (o = {}) => {
    OWN = o.own || 'red';
    const far = OWN === 'blue' ? ['zr', 'lbr', 'RED END'] : ['zb', 'lbb', 'BLUE END'];
    const near = OWN === 'blue' ? ['zb', 'lbb', 'BLUE END', 'b'] : ['zr', 'lbr', 'RED END', 'r'];
    const [gx1, gy1] = D([0.29, 0.5]);
    const [gx2, gy2] = D([0.71, 0.5]);
    let s = `<svg class="fb-fieldv" viewBox="-1 -1 102 202" role="img" aria-label="${o.label || 'Field map'}">
      <rect class="bg" x="0" y="0" width="100" height="200" rx="3"/>
      <rect class="${far[0]}" x="0" y="0" width="100" height="34" rx="3"/><rect class="${near[0]}" x="0" y="166" width="100" height="34" rx="3"/>
      <line class="mid" x1="2" y1="100" x2="98" y2="100"/>
      <polygon class="goal" points="${hex(+gx1, +gy1, 11)}"/><polygon class="goal" points="${hex(+gx2, +gy2, 11)}"/>
      <rect class="${near[0]}" x="0" y="0" width="16" height="14"/><rect class="${far[0]}" x="84" y="186" width="16" height="14"/>
      <text class="${far[1]}" x="50" y="8">${far[2]}</text><text class="${near[1]}" x="50" y="191">${near[2]}</text><text class="yours ${near[3]}" x="50" y="197">your alliance</text>`;
    (o.paths || []).forEach((p, i) => {
      const pts = p.pts.map(D);
      const line = pts.map((q) => q.join(',')).join(' ');
      if (p.sel) s += `<polyline class="${OWN === 'blue' ? 'lb' : 'lr'} halo" points="${line}"/>`;
      s += `<polyline class="${OWN === 'blue' ? 'lb' : 'lr'} ${p.cls || ''}" points="${line}"/>`;
      pts.forEach(([a, b]) => { s += `<circle class="pp ${OWN === 'blue' ? 'b' : ''} ${p.cls === 'f' ? 'f' : ''}" cx="${a}" cy="${b}" r="${p.cls === 'draw' ? 3 : 2.2}"/>`; });
    });
    (o.pts || []).forEach((p, i) => {
      const [a, b] = D(p);
      if (o.sel === i) s += `<circle class="ring" cx="${a}" cy="${b}" r="7"/>`;
      s += `<circle class="${p[2] || 'pr'}" cx="${a}" cy="${b}" r="4.4"/>`;
      if (p[3]) s += `<text class="nt" x="${a}" y="${b}">${p[3]}</text>`;
    });
    if (o.pill) {
      const [a, b] = D(o.pill.at).map(Number);
      const w = o.pill.w || 32;
      const top = b - 21;
      s += `<rect class="pill" x="${a - w / 2}" y="${top}" width="${w}" height="11" rx="5.5"/><polygon class="tip" points="${a - 2.5},${top + 10.8} ${a + 2.5},${top + 10.8} ${a},${top + 14}"/>
        <text class="pillt" x="${a}" y="${top + 5.6}">✕  ${o.pill.text}</text>`;
    }
    return s + '</svg>';
  };

  const sbar = (t) => `<div class="sbar"><span>${t}</span><span style="font-size:11px">● ● ●</span></div>`;

  // The full-screen map pop-up.
  const pop = (o) => `${sbar(o.time)}<div class="fb-pop">
      <div class="fb-poph"><span class="x">${x}</span><span class="t"><b>${o.title}</b><small>${o.sub}</small></span><span class="tag ${o.alliance || 'red'}">${o.station || 'Red 1'}</span></div>
      <div class="fb-popmap">${fieldV(o.map)}</div>
      <div class="fb-pophint">${o.hint}</div>
      <div class="fb-popbar">${o.bar}</div></div>`;

  // The map field inside the form: one big button with a thumbnail.
  const mapBtn = (o) => `<div class="fb-mapbtn ${o.empty ? 'empty' : ''}"><span class="th">${FC.field(o.thumb || {})}</span>
      <span class="t"><b>${o.title}</b><small>${o.sub}</small></span><span class="go">${chevr}</span></div>`;

  return { fieldV, pop, mapBtn, sbar, undo, plus, x, erase };
})();

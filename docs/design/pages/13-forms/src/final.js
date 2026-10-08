// The closed Forms list page (A + C). A final .html sets window.FINAL = true, loads
// ../../12-form-builder/src/builder.js, forms.js and this file, then calls FORMS_FINAL.desk(name).
window.FORMS_FINAL = (() => {
  const F = FL, s = F.svg;
  const open = (t) => `<span class="btn op">${s('eye')}${t || 'Open'}</span>`;
  const tli = (dot, title, sub, right) => `<div class="fl-tli"><span class="dot ${dot}"></span><div class="b"><span class="t"><b>${title}</b><small>${sub}</small></span><span class="r">${right || ''}</span></div></div>`;
  const versions = `<div class="fl-vh"><span class="fl-sec">Versions</span><span class="r">Open a version to work on it in the builder</span></div>
    <div class="fl-tl">
      ${tli('d', 'Draft v4', '2 fields added · not published yet · 17 fields', open('Continue'))}
      ${tli('on', 'v3 · active', 'Published 02/10 · locked · 15 fields', `<code>214 entries</code>${open()}`)}
      ${tli('', 'v2', 'Published 20/09 · 14 fields', `<code>38 entries</code>${open('View')}<span class="btn">${F.restoreI}Restore</span>`)}
      ${tli('', 'v1', 'Published 05/09 · 12 fields', `<code>12 entries</code>${open('View')}<span class="btn">${F.restoreI}Restore</span>`)}
    </div>`;
  const stats = `<div class="fl-stats"><div><small>Fields</small><b>15</b></div><div><small>Entries</small><b>214</b></div><div><small>Versions</small><b>3</b></div><div style="flex:1.6"><small>Last edited</small><b class="s">08/10 · Noa Levi</b></div></div>`;
  const matchCard = `<div class="fl-card">${F.matchHead()}${stats}${versions}
    <div class="fl-acts"><span class="btn primary">${s('eye')}Open builder</span><span class="btn">${s('down')}Export</span><span class="sp2"></span><span class="fl-meta">Open builder opens the draft if there is one</span></div></div>`;
  const VIEWS = {
    season: () => F.head() + F.seasons('2026') + `<div class="fl-cards">${matchCard}${F.superEmpty('2026')}</div>`,
    'new-season': () => F.head() + F.seasons('2027') + F.warn() + `<div class="fl-cards">${F.matchEmpty()}${F.superEmpty('2027')}</div>`,
  };
  const desk = (name) => {
    document.getElementById('root').innerHTML = `<div class="desk final"><div data-desk-shell="forms" data-crumb="Admin / <b>Forms</b>"><div class="fl-pad">${VIEWS[name]()}</div></div></div>`;
  };
  const phone = () => {
    document.getElementById('root').innerHTML = `<div class="canvas" style="height:940px">
      <div class="canvas-head"><b>Forms — final · phone</b><span>Forms needs a computer and is not in the phone menu. Opened by its address, a phone shows the locked desktop-only gate.</span></div>
      <div class="frames"><figure class="frame"><div class="phone"><div data-phone-shell data-time="20:14" data-title="Forms">${gate()}</div></div><figcaption>Below 1024 px</figcaption></figure></div></div>`;
  };
  const gate = () => `<div class="gate"><div class="gi">${s('monitor')}</div><b>This needs a computer</b>
    <p>Open the forms page on a screen at least 1024 pixels wide. It is pre-season work, done sitting down. Phones do the competition job — entering, browsing and reading — and this is not one of those.</p>
    <span class="btn">Back to scouting</span></div>`;
  return { desk, phone };
})();

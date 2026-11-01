// Round 28's triggers (user 2026-10-28): where the delete dialogs open from, drawn onto the
// closed finals of page 25 (entry preview) and page 13 (forms list) after they render.
window.DT = (() => {
  const trash =
    '<svg viewBox="0 0 24 24" style="width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
  // Entry preview: a lead or admin gets Delete after Edit (a scouter never deletes, §3.9).
  const entry = () =>
    document.querySelectorAll('.ep-act').forEach((el) => {
      if (/Edit/.test(el.textContent)) el.insertAdjacentHTML('beforeend', `<span class="btn dt-del">${trash}Delete</span>`);
    });
  // Forms list: an older version's row ends with a Delete button; the draft and the active
  // version have none (discarding a draft and replacing the active version are other jobs).
  const forms = () =>
    document.querySelectorAll('.fl-tli').forEach((row) => {
      const r = row.querySelector('.r');
      const name = row.querySelector('.t b').textContent;
      if (/Restore/.test(r.textContent)) r.insertAdjacentHTML('beforeend', `<span class="btn dt-x" aria-label="Delete version ${name}" title="Delete version ${name}">${trash}</span>`);
    });
  return { entry, forms };
})();

// Fills every [data-field="<total>,<hollow>"] with one square per entry; the last
// <hollow> squares are drawn as outlines (super entries).
document.querySelectorAll('[data-field]').forEach((el) => {
  const [total, hollow] = el.dataset.field.split(',').map(Number);
  let html = '';
  for (let i = 0; i < total; i++) html += i >= total - (hollow || 0) ? '<i class="s"></i>' : '<i></i>';
  el.innerHTML = html;
});

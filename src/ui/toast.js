let el = null;
let timer = null;

export function toast(msg, ms = 2800) {
  if (!el) el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('show'), ms);
}

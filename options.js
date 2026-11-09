const DEFAULT_HK = { alt: true, ctrl: false, shift: false, meta: false, code: 'KeyF', label: 'Alt + F' };
const list = document.getElementById('list');
const hkBox = document.getElementById('hotkey');
const hkMsg = document.getElementById('hkmsg');
let profiles = [];
let hotkey = { ...DEFAULT_HK };

// ----- hotkey recorder -----
const MOD_CODES = ['ShiftLeft','ShiftRight','ControlLeft','ControlRight','AltLeft','AltRight','MetaLeft','MetaRight'];
const keyName = c => c.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');

function labelOf(h) {
  const parts = [];
  if (h.ctrl) parts.push('Ctrl');
  if (h.alt) parts.push('Alt');
  if (h.shift) parts.push('Shift');
  if (h.meta) parts.push('Meta');
  parts.push(keyName(h.code));
  return parts.join(' + ');
}
function showHotkey() { hkBox.value = hotkey.label; }

hkBox.addEventListener('focus', () => { hkBox.classList.add('rec'); hkBox.value = 'Press your combination…'; hkMsg.textContent = ''; });
hkBox.addEventListener('blur', () => { hkBox.classList.remove('rec'); showHotkey(); });
hkBox.addEventListener('keydown', e => {
  e.preventDefault();
  if (MOD_CODES.includes(e.code)) return;            // wait for the real key
  if (!(e.altKey || e.ctrlKey || e.metaKey)) {
    hkMsg.textContent = 'Include Alt, Ctrl or Meta so it does not trigger while typing.';
    return;
  }
  const h = { alt: e.altKey, ctrl: e.ctrlKey, shift: e.shiftKey, meta: e.metaKey, code: e.code };
  h.label = labelOf(h);
  hotkey = h;
  hkMsg.textContent = '';
  showHotkey();
  hkBox.blur();
});
document.getElementById('resetKey').onclick = () => { hotkey = { ...DEFAULT_HK }; hkMsg.textContent = ''; showHotkey(); };
document.getElementById('resetPos').onclick = () => {
  chrome.storage.local.set({ bubblePos: null }, () => flash('Bubble position reset ✓'));
};

// ----- profiles -----
function render() {
  list.innerHTML = '';
  profiles.forEach((p, i) => {
    const d = document.createElement('div');
    d.className = 'card';
    d.innerHTML = `
      <button class="danger" data-i="${i}">Delete</button>
      <label>Label (e.g. "Me", "John")</label><input type="text" data-k="label">
      <label>Account holder name</label><input type="text" data-k="name">
      <label>Routing number</label><input type="text" data-k="routing">
      <label>Account number</label><input type="text" data-k="account">
      <label>Type</label>
      <select data-k="type"><option value="checking">Checking</option><option value="savings">Savings</option></select>`;
    d.querySelectorAll('[data-k]').forEach(el => {
      el.value = p[el.dataset.k] || (el.dataset.k === 'type' ? 'checking' : '');
      el.oninput = el.onchange = () => (p[el.dataset.k] = el.value.trim());
    });
    d.querySelector('.danger').onclick = () => { profiles.splice(i, 1); render(); };
    list.appendChild(d);
  });
}

document.getElementById('add').onclick = () => {
  profiles.push({ label: '', name: '', routing: '', account: '', type: 'checking' });
  render();
};

function flash(msg) {
  const s = document.getElementById('status');
  s.textContent = msg;
  setTimeout(() => (s.textContent = ''), 2000);
}

document.getElementById('save').onclick = () => {
  chrome.storage.local.set({
    profiles,
    hotkey,
    showBubble: document.getElementById('showBubble').checked
  }, () => flash('Saved ✓'));
};

chrome.storage.local.get({ profiles: [], hotkey: DEFAULT_HK, showBubble: true }, r => {
  hotkey = r.hotkey;
  showHotkey();
  document.getElementById('showBubble').checked = r.showBubble;
  profiles = r.profiles.length ? r.profiles
    : [{ label: 'Me', name: '', routing: '', account: '', type: 'checking' }];
  render();
});

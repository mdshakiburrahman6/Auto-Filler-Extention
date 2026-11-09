(function () {
  'use strict';
  if (window.__bankAutofill) return;
  window.__bankAutofill = true;

  const DEFAULTS = {
    profiles: [], active: 0, showBubble: true, bubblePos: null,
    hotkey: { alt: true, ctrl: false, shift: false, meta: false, code: 'KeyF', label: 'Alt + F' }
  };
  let settings = { ...DEFAULTS };
  let bubble = null, menu = null, lastModal = null;

  const load = () => new Promise(r =>
    chrome.storage.local.get(DEFAULTS, s => { settings = s; r(s); }));
  load();
  chrome.storage.onChanged.addListener(() => load().then(syncBubble));

  // ---------- helpers ----------
  const visibleInputs = () => [...document.querySelectorAll(
    'input:not([type=radio]):not([type=checkbox]):not([type=hidden]):not([type=submit]):not([type=button])'
  )].filter(i => i.offsetParent !== null);

  const radioText = r =>
    (r.closest('label')?.innerText || r.parentElement?.innerText || '').trim();
  const findRadio = test =>
    [...document.querySelectorAll('input[type=radio]')].find(r => test(radioText(r)));
  const addNewRadio = () => findRadio(t => /add new bank account/i.test(t));

  const hasForm = () => {
    const txt = document.body.innerText || '';
    return (/routing number/i.test(txt) && visibleInputs().length >= 5) || !!addNewRadio();
  };

  const waitFor = async (cond, ms = 2500) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (cond()) return true;
      await new Promise(r => setTimeout(r, 80));
    }
    return cond();
  };

  const setValue = (el, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
    ['input', 'change', 'blur'].forEach(t => el.dispatchEvent(new Event(t, { bubbles: true })));
  };

  // Put an element in the browser's "top layer": above every z-index, modals included
  const toTop = el => {
    el.setAttribute('popover', 'manual');
    document.body.appendChild(el);
    try { el.showPopover(); } catch (e) { el.style.zIndex = 2147483647; }
  };

  const toast = msg => {
    const t = document.createElement('div');
    t.textContent = msg;
    Object.assign(t.style, {
      inset: 'auto', margin: '0', border: 'none', position: 'fixed',
      right: '24px', bottom: '90px', background: '#222', color: '#fff',
      padding: '8px 14px', borderRadius: '8px', font: '14px sans-serif', overflow: 'visible'
    });
    toTop(t);
    setTimeout(() => t.remove(), 2500);
  };

  // ---------- fill ----------
  async function fill(index) {
    await load();
    const { profiles, active } = settings;
    if (!profiles.length) { toast('No profile saved. Click the extension icon.'); return; }
    const i = index ?? active;
    const p = profiles[i] || profiles[0];
    if (index != null) chrome.storage.local.set({ active: index });

    const addNew = addNewRadio();
    if (addNew && !addNew.checked) addNew.click();

    const ready = await waitFor(() => visibleInputs().length >= 5);
    if (!ready) { toast('Form not found on this page'); return; }
    const inputs = visibleInputs();

    const vals = [p.name, p.routing, p.routing, p.account, p.account];
    inputs.slice(0, 5).forEach((el, n) => setValue(el, vals[n]));

    const want = (p.type || 'checking').toLowerCase();
    const typeRadio = findRadio(t => t.toLowerCase() === want);
    if (typeRadio && !typeRadio.checked) typeRadio.click();

    toast(`Filled: ${p.label || p.name} ✓ Review, then click Transfer`);
  }

  // Bubble and hotkey both come here
  async function trigger() {
    await load();
    if (settings.profiles.length > 1 && bubble && !menu) return showMenu(settings.profiles);
    return fill();
  }

  // ---------- profile menu ----------
  function showMenu(profiles) {
    closeMenu();
    menu = document.createElement('div');
    Object.assign(menu.style, {
      inset: 'auto', margin: '0', position: 'fixed', background: '#fff', color: '#222',
      border: '1px solid #ccc', borderRadius: '8px', padding: '4px',
      font: '14px sans-serif', boxShadow: '0 4px 12px rgba(0,0,0,.25)', overflow: 'visible'
    });
    const r = bubble.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(r.left - 150, innerWidth - 180)) + 'px';
    menu.style.top = Math.max(8, r.top - (profiles.length * 34 + 12)) + 'px';
    profiles.forEach((p, i) => {
      const b = document.createElement('div');
      b.textContent = p.label || p.name || ('Profile ' + (i + 1));
      Object.assign(b.style, { padding: '8px 14px', cursor: 'pointer', borderRadius: '6px', minWidth: '130px' });
      b.onmouseenter = () => (b.style.background = '#eef3fd');
      b.onmouseleave = () => (b.style.background = '');
      b.onclick = () => { closeMenu(); fill(i); };
      menu.appendChild(b);
    });
    toTop(menu);
  }
  const closeMenu = () => { menu?.remove(); menu = null; };

  // ---------- bubble ----------
  const clamp = (v, max) => Math.max(0, Math.min(v, max));

  function placeBubble() {
    if (!bubble) return;
    const pos = settings.bubblePos;
    if (pos) {
      Object.assign(bubble.style, {
        left: clamp(pos.left, innerWidth - 52) + 'px',
        top: clamp(pos.top, innerHeight - 52) + 'px',
        right: 'auto', bottom: 'auto'
      });
    } else {
      Object.assign(bubble.style, { left: 'auto', top: 'auto', right: '24px', bottom: '24px' });
    }
  }

  function makeBubble() {
    bubble = document.createElement('div');
    bubble.textContent = '⚡';
    Object.assign(bubble.style, {
      inset: 'auto', margin: '0', border: 'none', padding: '0', position: 'fixed',
      width: '52px', height: '52px', borderRadius: '50%', background: '#1a73e8',
      color: '#fff', fontSize: '24px', display: 'flex', alignItems: 'center',
      justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,.3)',
      userSelect: 'none', overflow: 'visible'
    });
    placeBubble();
    syncTitle();

    let dragging = false, moved = false, offX = 0, offY = 0;
    bubble.addEventListener('mousedown', e => {
      dragging = true; moved = false;
      const r = bubble.getBoundingClientRect();
      offX = e.clientX - r.left; offY = e.clientY - r.top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      moved = true;
      Object.assign(bubble.style, {
        left: clamp(e.clientX - offX, innerWidth - 52) + 'px',
        top: clamp(e.clientY - offY, innerHeight - 52) + 'px',
        right: 'auto', bottom: 'auto'
      });
    });
    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      if (moved) {
        const r = bubble.getBoundingClientRect();
        chrome.storage.local.set({ bubblePos: { left: Math.round(r.left), top: Math.round(r.top) } });
      } else {
        trigger();
      }
    });
    document.addEventListener('mousedown', e => {
      if (menu && !menu.contains(e.target) && e.target !== bubble) closeMenu();
    });
    toTop(bubble);
  }

  function syncTitle() {
    if (bubble) bubble.title = `Autofill bank form (${settings.hotkey.label})`;
  }
  function syncBubble() {
    syncTitle();
    placeBubble();
    if (bubble && !settings.showBubble) { bubble.remove(); bubble = null; closeMenu(); }
  }

  // ---------- hotkey ----------
  document.addEventListener('keydown', e => {
    const h = settings.hotkey;
    if (!h || e.code !== h.code) return;
    if (e.altKey !== h.alt || e.ctrlKey !== h.ctrl || e.shiftKey !== h.shift || e.metaKey !== h.meta) return;
    if (!hasForm()) return;
    e.preventDefault();
    e.stopPropagation();
    fill();
  }, true);

  // ---------- watch the page ----------
  setInterval(() => {
    const found = hasForm();
    if (found && settings.showBubble && !bubble) makeBubble();
    if (!found && bubble) { bubble.remove(); bubble = null; closeMenu(); }

    // If a modal dialog opened after the bubble, lift the bubble above it again
    const modal = document.querySelector('dialog:modal');
    if (bubble && modal && modal !== lastModal) {
      try { bubble.hidePopover(); bubble.showPopover(); } catch (e) {}
    }
    lastModal = modal;
  }, 1000);
})();

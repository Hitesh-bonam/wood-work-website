/* Woodwork website: photo viewer, story mode, before/after slider, filters, chapter menu and price estimator.
   Every page works without this file; it only adds the interactive parts. */
(() => {
  'use strict';

  const d = document;
  const $ = (sel, root = d) => root.querySelector(sel);
  const $$ = (sel, root = d) => Array.from(root.querySelectorAll(sel));
  const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const readJson = (id) => {
    const el = d.getElementById(id);
    if (!el) return null;
    try {
      return JSON.parse(el.textContent);
    } catch (err) {
      return null;
    }
  };
  const svg = (paths) => `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
  const ICON = {
    x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    left: svg('<path d="M14.5 5.5 8 12l6.5 6.5"/>'),
    right: svg('<path d="M9.5 5.5 16 12l-6.5 6.5"/>'),
    pause: svg('<path d="M9 5.5v13M15 5.5v13"/>'),
    play: svg('<path d="M8 5.5v13l10.5-6.5z"/>'),
    wa: svg('<path d="M4.5 19.5 5.7 16a8 8 0 1 1 3 2.6z"/><path stroke-width="1.6" d="M9.4 9.1c0 2.9 2.6 5.5 5.5 5.5l1-1.5-2-1-.9.8a4.7 4.7 0 0 1-2-2l.8-.9-1-2z"/>'),
    phone: svg('<path d="M5 4h3.6l1.8 4.5-2.2 1.4a11.5 11.5 0 0 0 5.9 5.9l1.4-2.2L20 15.4V19a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z"/>'),
    tag: svg('<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1 1 0 0 1 0 1.4l-7.3 7.3a1 1 0 0 1-1.4 0z"/><circle cx="8.5" cy="8.5" r="1.6"/>'),
    arrow: svg('<path d="M4.5 12h15M13.5 6l6 6-6 6"/>'),
  };

  $$('[data-js-only]').forEach((el) => {
    el.hidden = false;
  });

  const canDialog = typeof HTMLDialogElement === 'function' && typeof HTMLDialogElement.prototype.showModal === 'function';

  /* Stops the click that follows a swipe or a long press. */
  function blockNextClick() {
    const stop = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 400);
  }

  let locks = 0;
  function lockScroll(on) {
    locks = Math.max(0, locks + (on ? 1 : -1));
    d.documentElement.classList.toggle('noscroll', locks > 0);
  }

  /* The phone's Back button closes an open photo or story instead of leaving the page. */
  const overlay = (() => {
    let active = null;
    let skipPop = false;
    let after = null;
    const setRestoration = (mode) => {
      try {
        if ('scrollRestoration' in history) history.scrollRestoration = mode;
      } catch (err) {
        // older browsers: nothing to do
      }
    };
    const isOverlayEntry = () => Boolean(history.state && history.state.woodworkOverlay);
    window.addEventListener('popstate', () => {
      if (skipPop) {
        skipPop = false;
      } else if (active) {
        const current = active;
        active = null;
        current.close();
      } else if (isOverlayEntry()) {
        // Forward into a photo that is no longer open: step back so the next Back press works normally.
        history.back();
        return;
      }
      setRestoration('auto');
      const run = after;
      after = null;
      if (run) requestAnimationFrame(run);
    });
    // The page was reloaded (or restored) while a photo was open: leave that history step.
    if (isOverlayEntry()) {
      setRestoration('auto');
      history.back();
    }
    return {
      opened(closeFromBack) {
        active = { close: closeFromBack, history: false };
        try {
          // Going back to the page must not make the browser jump to an old scroll position.
          setRestoration('manual');
          history.pushState({ woodworkOverlay: true }, '');
          active.history = true;
        } catch (err) {
          active.history = false;
          setRestoration('auto');
        }
      },
      closed(fromBack, then) {
        const current = active;
        active = null;
        if (!fromBack && current && current.history && history.state && history.state.woodworkOverlay) {
          skipPop = true;
          after = then || null;
          history.back();
          return;
        }
        if (then) then();
      },
    };
  })();

  /* Swipe left/right/down on an element. Ignored while the page is pinch-zoomed. */
  function onSwipe(el, handlers) {
    const pointers = new Set();
    let start = null;
    let multi = false;
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pointers.add(e.pointerId);
      if (pointers.size === 1) {
        start = { x: e.clientX, y: e.clientY, id: e.pointerId, touch: e.pointerType === 'touch' };
        multi = false;
      } else {
        multi = true;
      }
    });
    const end = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      const s = start;
      if (!pointers.size) start = null;
      if (e.type !== 'pointerup' || !s || s.id !== e.pointerId || multi || pointers.size) return;
      if (window.visualViewport && window.visualViewport.scale > 1.05) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      // A finger swipe never produces a click, but a mouse drag does; only the mouse needs it stopped.
      const stopClick = () => {
        if (!s.touch) blockNextClick();
      };
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        stopClick();
        (dx < 0 ? handlers.left : handlers.right)();
      } else if (handlers.down && dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.5) {
        stopClick();
        handlers.down();
      }
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  function makeDialog(className, label, html) {
    const dlg = d.createElement('dialog');
    dlg.className = className;
    dlg.setAttribute('aria-label', label);
    dlg.innerHTML = html;
    d.body.appendChild(dlg);
    let reason = { fromBack: false, then: null };
    const api = {
      dlg,
      onClose: null,
      open() {
        if (dlg.open) return;
        dlg.showModal();
        lockScroll(true);
        overlay.opened(() => {
          reason = { fromBack: true, then: null };
          if (dlg.open) dlg.close();
        });
      },
      close(then) {
        reason = { fromBack: false, then: then || null };
        if (dlg.open) dlg.close();
        else if (then) then();
      },
    };
    dlg.addEventListener('close', () => {
      const r = reason;
      reason = { fromBack: false, then: null };
      lockScroll(false);
      if (api.onClose) api.onClose();
      overlay.closed(r.fromBack, r.then);
    });
    window.addEventListener('pagehide', () => {
      if (dlg.open) {
        reason = { fromBack: true, then: null };
        dlg.close();
      }
    });
    return api;
  }

  /* ---------- Photo viewer ---------- */
  function createViewer() {
    const box = makeDialog('viewer', 'Photo viewer', `<div class="v-bar"><p class="v-title" aria-live="polite"></p><button type="button" class="v-btn v-close" aria-label="Close">${ICON.x}</button></div>
<div class="v-stage"><img class="v-img" alt="" draggable="false"><button type="button" class="v-btn v-prev" aria-label="Previous photo">${ICON.left}</button><button type="button" class="v-btn v-next" aria-label="Next photo">${ICON.right}</button></div>
<div class="v-foot"><p class="v-cap"></p><a class="v-link" hidden></a></div>`);
    const { dlg } = box;
    const title = $('.v-title', dlg);
    const img = $('.v-img', dlg);
    const cap = $('.v-cap', dlg);
    const link = $('.v-link', dlg);
    const prev = $('.v-prev', dlg);
    const next = $('.v-next', dlg);
    const state = { list: [], i: 0, name: '', opener: null, token: 0 };

    function render() {
      const n = state.list.length;
      const p = state.list[state.i];
      if (!p) return;
      const token = ++state.token;
      img.alt = p.alt || p.c || 'Photo';
      img.src = p.s || p.l;
      if (p.l && p.l !== p.s) {
        const big = new Image();
        big.onload = () => {
          if (token === state.token && dlg.open) img.src = p.l;
        };
        big.src = p.l;
      }
      title.textContent = n > 1 ? `${state.name ? `${state.name} · ` : ''}${state.i + 1} / ${n}` : state.name;
      cap.textContent = '';
      if (p.ch) {
        const ch = d.createElement('span');
        ch.className = 'v-ch';
        ch.textContent = p.ch;
        cap.appendChild(ch);
      }
      if (p.c) cap.appendChild(d.createTextNode(p.c));
      prev.hidden = n < 2;
      next.hidden = n < 2;
      if (n > 1) {
        [state.i + 1, state.i - 1].forEach((k) => {
          const q = state.list[(k + n) % n];
          if (q && q !== p) new Image().src = q.l || q.s;
        });
      }
    }
    function show(i) {
      const n = state.list.length;
      if (!n) return;
      state.i = ((i % n) + n) % n;
      render();
    }
    function open(list, i, options = {}) {
      state.list = list;
      state.name = options.name || '';
      state.opener = options.opener || d.activeElement;
      if (options.link) {
        link.href = options.link.href;
        link.textContent = options.link.text;
        link.hidden = false;
      } else {
        link.hidden = true;
        link.removeAttribute('href');
      }
      show(i);
      box.open();
    }
    box.onClose = () => {
      state.token++;
      img.removeAttribute('src');
      const opener = state.opener;
      state.opener = null;
      if (opener && opener.focus && d.contains(opener)) opener.focus({ preventScroll: true });
    };
    $('.v-close', dlg).addEventListener('click', () => box.close());
    prev.addEventListener('click', () => show(state.i - 1));
    next.addEventListener('click', () => show(state.i + 1));
    link.addEventListener('click', (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      const href = link.href;
      box.close(() => window.location.assign(href));
    });
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        show(state.i + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        show(state.i - 1);
      }
    });
    onSwipe($('.v-stage', dlg), { left: () => show(state.i + 1), right: () => show(state.i - 1), down: () => box.close() });

    return {
      open,
      isOpen: () => dlg.open,
      current: () => state.list,
      replaceList(list, i) {
        if (!dlg.open) return;
        state.list = list;
        show(i);
      },
    };
  }

  const viewer = canDialog ? createViewer() : null;
  const pageList = readJson('photos-data');
  const pageTitle = ($('main h1') || {}).textContent || '';
  const lists = new Map();
  function loadList(url) {
    if (!lists.has(url)) {
      lists.set(url, fetch(url, { credentials: 'same-origin' })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .catch((err) => {
          lists.delete(url);
          throw err;
        }));
    }
    return lists.get(url);
  }

  d.addEventListener('click', (e) => {
    if (!viewer || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const tile = e.target.closest('a[data-proj]');
    if (tile) {
      e.preventDefault();
      const quick = { s: tile.dataset.s, l: tile.dataset.l, c: tile.dataset.c, ch: tile.dataset.ch, alt: (tile.getAttribute('aria-label') || '').replace(/^Open photo: /, '') };
      const wanted = Number(tile.dataset.i) || 0;
      const quickList = [quick];
      viewer.open(quickList, 0, { name: tile.dataset.title || '', opener: tile, link: { href: tile.getAttribute('href'), text: 'See the full project' } });
      loadList(tile.dataset.json)
        .then((list) => {
          if (Array.isArray(list) && list.length && viewer.isOpen() && viewer.current() === quickList) viewer.replaceList(list, Math.min(wanted, list.length - 1));
        })
        .catch(() => {});
      return;
    }
    const pageTile = e.target.closest('a[data-lb]');
    if (pageTile && Array.isArray(pageList) && pageList.length) {
      e.preventDefault();
      viewer.open(pageList, Number(pageTile.dataset.lb) || 0, { name: pageTitle, opener: pageTile });
    }
  });

  /* ---------- Story mode ---------- */
  function createStory(button, list) {
    const DURATION = 4000;
    const ds = button.dataset;
    const endButtons = [
      ds.wa ? `<a class="btn wa" href="${escHtml(ds.wa)}">${ICON.wa}<span>Get a quote on WhatsApp</span></a>` : ds.tel ? `<a class="btn wa" href="${escHtml(ds.tel)}">${ICON.phone}<span>Call us</span></a>` : '',
      ds.price ? `<a class="btn s-price" href="${escHtml(ds.price)}">${ICON.tag}<span>See the price</span></a>` : '',
      ds.next ? `<a class="btn s-next-project" href="${escHtml(ds.next)}"><span>Next: ${escHtml(ds.nextLabel || 'project')}</span>${ICON.arrow}</a>` : '',
    ].join('');
    const box = makeDialog('viewer story', 'Project story', `<div class="s-bars">${list.map(() => '<span class="s-bar"><i></i></span>').join('')}</div>
<div class="v-bar"><p class="v-title"></p><button type="button" class="v-btn s-pp" aria-label="Pause">${ICON.pause}</button><button type="button" class="v-btn v-close" aria-label="Close story">${ICON.x}</button></div>
<div class="v-stage s-stage"><img class="v-img" alt="" draggable="false"><div class="s-cap"><span class="v-ch"></span><p class="v-cap"></p></div><button type="button" class="s-zone s-prev" aria-label="Previous photo"></button><button type="button" class="s-zone s-next" aria-label="Next photo"></button></div>
<div class="s-end" hidden><h2>Like this project?</h2><p>${escHtml(ds.title || '')}</p>${endButtons}<button type="button" class="btn s-replay">Watch again</button></div>`);
    const { dlg } = box;
    const bars = $$('.s-bar i', dlg);
    const img = $('.v-img', dlg);
    const chapter = $('.s-cap .v-ch', dlg);
    const caption = $('.s-cap .v-cap', dlg);
    const stage = $('.s-stage', dlg);
    const end = $('.s-end', dlg);
    const pp = $('.s-pp', dlg);
    $('.v-title', dlg).textContent = ds.title || '';
    let i = 0;
    let elapsed = 0;
    let ready = false;
    let paused = false;
    let held = false;
    let holdTimer = 0;
    let raf = 0;
    let last = 0;
    let token = 0;
    let opener = null;

    function paintBars() {
      bars.forEach((bar, k) => {
        bar.style.width = k < i ? '100%' : k > i ? '0%' : `${Math.min(100, (elapsed / DURATION) * 100)}%`;
      });
    }
    function finish() {
      i = list.length;
      ready = false;
      stage.hidden = true;
      end.hidden = false;
      paintBars();
      const first = $('a, button', end);
      if (first) first.focus({ preventScroll: true });
    }
    function go(k) {
      if (k >= list.length) {
        finish();
        return;
      }
      i = Math.max(0, k);
      elapsed = 0;
      ready = false;
      stage.hidden = false;
      end.hidden = true;
      const p = list[i];
      const t = ++token;
      img.alt = p.alt || p.c || '';
      img.src = p.s || p.l;
      chapter.textContent = p.ch || '';
      caption.textContent = p.c || '';
      const pic = new Image();
      pic.onload = () => {
        if (t !== token) return;
        img.src = pic.src;
        ready = true;
      };
      pic.onerror = () => {
        if (t === token) ready = true;
      };
      pic.src = p.l || p.s;
      const after = list[i + 1];
      if (after) new Image().src = after.l || after.s;
      paintBars();
    }
    function tick(now) {
      raf = requestAnimationFrame(tick);
      const dt = last ? Math.min(now - last, 100) : 0;
      last = now;
      if (!ready || paused || held || d.hidden || i >= list.length) return;
      elapsed += dt;
      if (elapsed >= DURATION) go(i + 1);
      else paintBars();
    }
    function setPaused(value) {
      paused = value;
      pp.innerHTML = value ? ICON.play : ICON.pause;
      pp.setAttribute('aria-label', value ? 'Play' : 'Pause');
    }
    function open() {
      opener = button;
      clearTimeout(holdTimer);
      held = false;
      setPaused(false);
      go(0);
      box.open();
      last = 0;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    }
    box.onClose = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      token++;
      img.removeAttribute('src');
      if (opener && d.contains(opener)) opener.focus({ preventScroll: true });
    };

    $('.v-close', dlg).addEventListener('click', () => box.close());
    pp.addEventListener('click', () => setPaused(!paused));
    $('.s-prev', dlg).addEventListener('click', () => go(i - 1));
    $('.s-next', dlg).addEventListener('click', () => go(i + 1));
    $('.s-replay', dlg).addEventListener('click', () => {
      setPaused(false);
      go(0);
      pp.focus({ preventScroll: true });
    });
    const priceLink = $('.s-price', dlg);
    if (priceLink) {
      priceLink.addEventListener('click', (e) => {
        e.preventDefault();
        box.close(() => {
          const target = d.querySelector(ds.price);
          if (target) target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        });
      });
    }
    $$('.s-end a:not(.s-price)', dlg).forEach((a) => {
      a.addEventListener('click', (e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        const href = a.getAttribute('href');
        box.close(() => window.location.assign(href));
      });
    });
    stage.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      clearTimeout(holdTimer);
      holdTimer = setTimeout(() => {
        held = true;
      }, 280);
    });
    const release = () => {
      clearTimeout(holdTimer);
      if (held) {
        held = false;
        blockNextClick();
      }
    };
    // Released anywhere (even outside the photo) ends the pause, so the story can never get stuck.
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    onSwipe(stage, { left: () => go(i + 1), right: () => go(i - 1), down: () => box.close() });
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (i < list.length) go(i + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(Math.min(i, list.length) - 1);
      } else if (e.key === ' ' && !e.target.closest('a, button')) {
        e.preventDefault();
        setPaused(!paused);
      }
    });
    return { open };
  }

  const storyButton = $('[data-story]');
  if (storyButton) {
    if (canDialog && Array.isArray(pageList) && pageList.length) {
      const story = createStory(storyButton, pageList);
      storyButton.addEventListener('click', () => story.open());
    } else {
      storyButton.hidden = true;
    }
  }

  /* ---------- Before / after slider ---------- */
  $$('[data-ba]').forEach((figure) => {
    const frame = $('.ba-frame', figure);
    const range = $('.ba-range', figure);
    const set = (value) => {
      const v = Math.max(0, Math.min(100, value));
      figure.style.setProperty('--pos', `${v}%`);
      if (range) range.value = String(Math.round(v));
    };
    if (range) range.addEventListener('input', () => set(Number(range.value)));
    // Mouse: the line follows at once. Finger: only after a clear sideways drag, so scrolling the
    // page over the photo never moves the line.
    let dragging = false;
    let pending = null;
    const move = (e) => {
      const rect = frame.getBoundingClientRect();
      if (rect.width > 0) set(((e.clientX - rect.left) / rect.width) * 100);
    };
    frame.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.pointerType === 'mouse') {
        dragging = true;
        move(e);
      } else {
        pending = { x: e.clientX, y: e.clientY, id: e.pointerId };
      }
    });
    frame.addEventListener('pointermove', (e) => {
      if (pending && e.pointerId === pending.id) {
        const dx = Math.abs(e.clientX - pending.x);
        const dy = Math.abs(e.clientY - pending.y);
        if (dx > 8 && dx > dy) {
          pending = null;
          dragging = true;
        } else if (dy > 8) {
          pending = null;
        }
      }
      if (dragging) move(e);
    });
    const stop = () => {
      dragging = false;
      pending = null;
    };
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  });

  /* ---------- Gallery filters ---------- */
  const filters = $('[data-filters]');
  if (filters) {
    filters.hidden = false;
    const none = $('[data-none]');
    filters.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-type]');
      if (!button) return;
      const type = button.dataset.type;
      $$('button[data-type]', filters).forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      let shown = 0;
      $$('.pj').forEach((project) => {
        const match = type === 'all' || (project.dataset.types || '').split('|').includes(type);
        project.hidden = !match;
        if (match) shown++;
      });
      if (none) none.hidden = shown > 0;
    });
  }

  /* ---------- Chapter menu follows the page ---------- */
  const chapterNav = $('.chap-nav');
  if (chapterNav) {
    const inner = $('.chap-in', chapterNav);
    const links = $$('a[href^="#"]', chapterNav);
    const sections = links.map((a) => d.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))));
    let current = null;
    const activate = (link) => {
      if (link === current) return;
      if (current) current.removeAttribute('aria-current');
      current = link;
      if (!link) return;
      link.setAttribute('aria-current', 'true');
      const left = link.offsetLeft - (inner.clientWidth - link.offsetWidth) / 2;
      inner.scrollTo({ left: Math.max(0, left), behavior: reduceMotion ? 'auto' : 'smooth' });
    };
    // The chapter whose title has passed 40% of the screen height is the one being read.
    const update = () => {
      const line = window.innerHeight * 0.4;
      let found = null;
      sections.forEach((section, i) => {
        if (section && section.getBoundingClientRect().top <= line) found = links[i];
      });
      activate(found);
    };
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        update();
      });
    }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /* ---------- Price estimator ---------- */
  const form = $('#estimator');
  const rates = readJson('rates-data');
  if (form && rates && Array.isArray(rates.services) && rates.services.length) {
    const select = $('#est-svc', form);
    const qty = $('#est-qty', form);
    const out = $('#est-out', form);
    const err = $('#est-err', form);
    const label = $('#est-qty-label', form);
    const wa = $('#est-wa', form);
    const radios = $$('input[name="tier"]', form);
    const premium = radios.find((r) => r.value === 'prem');
    const standard = radios.find((r) => r.value === 'std');
    const symbol = rates.symbol || '₹';
    const number = new Intl.NumberFormat(symbol === '₹' ? 'en-IN' : 'en-US', { maximumFractionDigits: 0 });
    const money = (n) => `${symbol}${number.format(n)}`;
    const roundNice = (n) => {
      const step = n < 10000 ? 100 : 1000;
      return Math.max(step, Math.round(n / step) * step);
    };
    const showError = (on) => {
      err.hidden = !on;
      if (on) qty.setAttribute('aria-invalid', 'true');
      else qty.removeAttribute('aria-invalid');
    };
    const update = () => {
      const service = rates.services[Number(select.value)] || rates.services[0];
      if (premium) {
        premium.disabled = service.prem == null;
        if (premium.disabled && premium.checked && standard) standard.checked = true;
      }
      const usePremium = Boolean(premium && premium.checked && service.prem != null);
      label.textContent = `How many ${service.unit}?`;
      const raw = qty.value.trim();
      const amount = Number(raw);
      let text = 'Enter a size to see an estimate';
      let ok = false;
      if (qty.validity && qty.validity.badInput) {
        showError(true);
      } else if (raw === '') {
        showError(false);
      } else if (!(amount > 0) || amount > 1000000) {
        showError(true);
      } else {
        showError(false);
        ok = true;
        const total = amount * (usePremium ? service.prem : service.std);
        text = `${money(roundNice(total * 0.9))} – ${money(roundNice(total * 1.1))}`;
      }
      out.textContent = text;
      out.classList.toggle('placeholder', !ok);
      if (wa && form.dataset.waBase) {
        const name = form.dataset.name || '';
        const message = ok
          ? `Hi ${name}, I used the estimator on your website: ${service.name}, ${amount} ${service.unit}, ${usePremium ? 'premium' : 'standard'} finish, about ${text}. Can you visit and give me a quote?`
          : `Hi ${name}, I'd like an estimate for ${service.name.toLowerCase()} for my home.`;
        wa.href = form.dataset.waBase + encodeURIComponent(message);
      }
    };
    form.addEventListener('input', update);
    form.addEventListener('change', update);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      update();
    });
    update();
  }
})();

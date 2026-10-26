/* Upload page (admin/): add a project, or photos to a project, straight from a phone.
   Photos are redrawn smaller right here in the browser, which also removes their hidden data (GPS location,
   camera details), before anything is sent. Then everything is saved to GitHub as one commit.
   The GitHub key stays on this phone (localStorage) and is only ever sent to api.github.com.
   Photos waiting to be sent, their captions and the typed details are kept on the phone (IndexedDB) until
   they are published, so a page the phone closes (low memory while the camera is open, switching apps)
   comes back as it was. The rules (names, info.txt, the commit) are in admin-core.js. */
(() => {
  'use strict';

  const core = window.WoodworkUpload;
  const d = document;
  const $ = (id) => d.getElementById(id);
  if (!core || !$('up-config')) return;
  // Inside another site's frame, a hidden copy of this page could trick the owner into publishing.
  if (window.top !== window.self) {
    $('main').hidden = true;
    return;
  }
  let config;
  try {
    config = JSON.parse($('up-config').textContent);
  } catch (err) {
    return;
  }

  const repo = core.findRepo(config, window.location);
  const keyName = `woodwork-upload-key:${repo}`;
  const savedKey = {
    get() {
      try {
        return window.localStorage.getItem(keyName) || '';
      } catch (err) {
        return '';
      }
    },
    set(value) {
      try {
        window.localStorage.setItem(keyName, value);
        return true;
      } catch (err) {
        return false;
      }
    },
    clear() {
      try {
        window.localStorage.removeItem(keyName);
      } catch (err) {
        // nothing was saved
      }
    },
  };

  // The last save while it isn't certain that it arrived (see core.publish). This tab keeps it even when
  // the page reloads; the store of waiting photos below keeps it too.
  const memoName = `woodwork-upload-memo:${repo}`;
  const savedMemo = {
    get() {
      try {
        const memo = JSON.parse(window.sessionStorage.getItem(memoName) || 'null');
        return memo && memo.commit ? memo : null;
      } catch (err) {
        return null;
      }
    },
    set(memo) {
      try {
        if (memo && memo.commit) window.sessionStorage.setItem(memoName, JSON.stringify(memo));
        else window.sessionStorage.removeItem(memoName);
      } catch (err) {
        // This browser can't keep it here; the store of waiting photos still does.
      }
    },
  };

  /* Photos waiting to be sent, kept on this phone (IndexedDB). Where a browser can't store them (some
     private modes), every call quietly does nothing and the page works as before. */
  const kept = (() => {
    const prefix = `${repo}|`;
    let opening = null;
    const open = () => {
      if (!opening) {
        opening = new Promise((resolve) => {
          try {
            const request = window.indexedDB.open('woodwork-upload', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('items');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
            request.onblocked = () => resolve(null);
          } catch (err) {
            resolve(null);
          }
        });
      }
      return opening;
    };
    const run = async (mode, work) => {
      const db = await open();
      if (!db) return null;
      return new Promise((resolve) => {
        try {
          const tx = db.transaction('items', mode);
          const request = work(tx.objectStore('items'));
          tx.oncomplete = () => resolve(request ? request.result : true);
          tx.onerror = () => resolve(null);
          tx.onabort = () => resolve(null);
        } catch (err) {
          resolve(null);
        }
      });
    };
    const mine = () => window.IDBKeyRange.bound(prefix, `${prefix}￿`);
    return {
      put: (name, value) => run('readwrite', (store) => store.put(value, prefix + name)),
      remove: (name) => run('readwrite', (store) => store.delete(prefix + name)),
      all: async () => (await run('readonly', (store) => store.getAll(mine()))) || [],
      clear: () => run('readwrite', (store) => store.delete(mine())),
    };
  })();

  const el = {
    alert: $('up-alert'),
    loadingText: $('up-loading-text'),
    retry: $('up-retry'),
    connect: $('up-connect'),
    connectBtn: $('up-connect-btn'),
    key: $('up-key'),
    keyErr: $('up-key-err'),
    keyAgain: $('up-key-again'),
    keyAgainText: $('up-key-again-text'),
    keyRetry: $('up-key-retry'),
    keyNew: $('up-key-new'),
    form: $('up-form'),
    project: $('up-project'),
    chips: $('up-chips'),
    chapterHint: $('up-chapter-hint'),
    gallery: $('up-gallery'),
    camera: $('up-camera'),
    photoStatus: $('up-photo-status'),
    restored: $('up-restored'),
    clear: $('up-clear'),
    photoErr: $('up-photo-err'),
    list: $('up-photos'),
    captions: $('up-captions'),
    details: $('up-details'),
    detailsStatus: $('up-details-status'),
    fieldsBox: $('up-fields'),
    fields: Array.from(d.querySelectorAll('[data-field]')),
    price: $('up-f-price'),
    priceErr: $('up-f-price-err'),
    sendErr: $('up-send-err'),
    publish: $('up-publish'),
    bar: $('up-bar'),
    progressText: $('up-progress-text'),
    done: $('up-done'),
    doneText: $('up-done-text'),
    doneLink: $('up-done-link'),
    again: $('up-again'),
    foot: $('up-foot'),
    repoName: $('up-repo'),
    forget: $('up-forget'),
  };

  const state = {
    client: null,
    tree: null, // projects on GitHub, from core.listProjects
    original: {}, // the details as loaded, to see what the owner changed
    detailsReady: true,
    pendingEdits: null, // typed details waiting for their project's details to load
    photos: [], // { id, key, name, type, blob, ext, sha, uploaded, thumb, caption, cover, ready, removed, row }
    memo: savedMemo.get() || {}, // the last save, while it isn't certain that it arrived (see core.publish)
    problems: [],
    queue: Promise.resolve(),
    preparing: 0,
    busy: false,
    formStarted: false,
    draftReady: false, // true once what the phone kept has been put back, so it is never overwritten by an empty page
    nextId: 1,
  };

  /* ---------- Screens and messages ---------- */

  const SCREENS = ['up-loading', 'up-norepo', 'up-connect', 'up-form', 'up-progress', 'up-done'];
  function show(id) {
    SCREENS.forEach((screen) => {
      $(screen).hidden = screen !== id;
    });
    el.foot.hidden = id === 'up-norepo' || !savedKey.get();
    if (id === 'up-form') state.formStarted = true;
  }
  function setText(node, text) {
    node.textContent = text || '';
    node.hidden = !text;
  }
  const notice = (text) => setText(el.alert, text);
  const keyError = (text) => setText(el.keyErr, text);
  const sendError = (text) => setText(el.sendErr, text);

  /* ---------- Keeping the page on this phone ---------- */

  let saveTimer = 0;
  /** Writes what is on the page (captions, choices, typed details, the last save) to this phone. */
  function saveDraft(now) {
    clearTimeout(saveTimer);
    if (!state.draftReady) return Promise.resolve();
    if (!now) {
      saveTimer = setTimeout(() => saveDraft(true), 300);
      return Promise.resolve();
    }
    savedMemo.set(state.memo);
    const checked = el.chips.querySelector('input[name="chapter"]:checked');
    const draft = {
      kind: 'draft',
      project: el.project.value,
      chapter: checked ? checked.value : '',
      edits: state.detailsReady ? detailChanges() : state.pendingEdits || {},
      photos: state.photos.filter((p) => p.ready).map((p) => ({ id: p.id, caption: p.caption, cover: p.cover })),
      memo: state.memo && state.memo.commit ? state.memo : null,
    };
    if (!draft.photos.length && !Object.keys(draft.edits).length && !draft.memo) return kept.remove('draft');
    return kept.put('draft', draft);
  }
  // A phone may close the page soon after it is hidden (switching to the camera or another app).
  d.addEventListener('visibilitychange', () => {
    if (d.visibilityState === 'hidden') saveDraft(true);
  });

  /** Puts back what was on the page when the phone closed it. Returns true when there was something. */
  async function restoreDraft() {
    const items = await kept.all();
    const draft = items.find((item) => item && item.kind === 'draft') || { photos: [], edits: {} };
    const records = items.filter((item) => item && item.kind === 'photo');
    const memo = savedMemo.get() || draft.memo || null;
    if (memo) state.memo = memo;
    const edits = draft.edits || {};
    if (!records.length && !Object.keys(edits).length) return false;

    // Photos kept without a list (the page closed at that very moment) go to a new project, as on a fresh page.
    const target = draft.project == null ? core.NEW : draft.project;
    const known = target === core.NEW || state.tree.projects.some((p) => p.folder === target);
    fillProjects(known ? target : '', { choose: !known });
    await chooseProject(known ? edits : null);
    const radio = Array.from(el.chips.querySelectorAll('input[name="chapter"]')).find((input) => input.value === draft.chapter);
    if (radio) radio.checked = true;

    const order = new Map((draft.photos || []).map((entry, at) => [entry.id, Object.assign({ at }, entry)]));
    const place = (record) => (order.has(record.id) ? order.get(record.id).at : 1e6 + record.id);
    const project = currentProject();
    records.sort((a, b) => place(a) - place(b)).forEach((record) => {
      const entry = order.get(record.id) || {};
      const photo = {
        id: record.id,
        key: `kept|${record.id}`,
        name: record.name,
        type: record.type,
        ext: record.ext || '.jpg',
        sha: record.sha || '',
        blob: new Blob([record.bytes], { type: record.mime || 'image/jpeg' }),
        thumb: URL.createObjectURL(new Blob([record.thumbBytes], { type: 'image/jpeg' })),
        caption: entry.caption || '',
        cover: Boolean(entry.cover) && !(project && project.hasCover),
        // Sent again when published: GitHub may tidy away a photo that a save never used, and this page
        // may be opened again weeks later. (A photo already in a project isn't sent twice; see core.publish.)
        uploaded: false,
        ready: true,
        removed: false,
      };
      state.photos.push(photo);
      renderPhoto(photo);
      photo.row.caption.value = photo.caption;
      photo.row.cover.checked = photo.cover;
      photo.row.thumb.src = photo.thumb;
      photo.row.thumb.hidden = false;
      photo.row.status.hidden = true;
      state.nextId = Math.max(state.nextId, record.id + 1);
    });
    numberRows();
    updatePhotoStatus();
    chapterChanged();
    if (records.length) {
      let text = 'Your photos from last time are back. Publish them, or tap Clear all photos.';
      if (!known) text = target ? 'Your photos from last time are back, but their project isn’t on GitHub any more. Choose the project again (step 1).' : 'Your photos from last time are back. Choose their project (step 1), then publish them.';
      setText(el.restored, text);
    }
    return true;
  }

  /* ---------- Connecting this phone ---------- */

  function useKey(token) {
    state.client = core.createClient({ token, repo });
  }

  /**
   * GitHub refused the saved key. It stays on this phone until a new key works: the problem may pass,
   * and it is the only copy the owner has.
   */
  function askForKey(message) {
    state.client = null;
    show('up-connect');
    keyError('');
    const saved = Boolean(savedKey.get());
    el.keyAgain.hidden = !saved;
    el.keyAgainText.textContent = saved ? message || '' : '';
    if (!saved) keyError(message || '');
  }

  async function load({ treeSha, select, choose = false } = {}) {
    const sha = treeSha || (await state.client.head()).tree;
    state.tree = core.listProjects(await state.client.files(sha), config);
    fillProjects(select, { choose });
  }

  async function openForm({ keep = false } = {}) {
    show('up-loading');
    el.loadingText.textContent = 'Loading your projects…';
    el.retry.hidden = true;
    notice('');
    try {
      await load();
    } catch (err) {
      if (err.kind === 'auth') {
        askForKey(core.describeError(err, repo, 'load'));
        return;
      }
      el.loadingText.textContent = 'Your projects couldn’t be loaded.';
      notice(core.describeError(err, repo, 'load'));
      el.retry.hidden = false;
      return;
    }
    show('up-form');
    if (keep) {
      refreshChapters();
      return;
    }
    if (!(await restoreDraft())) await chooseProject();
    state.draftReady = true;
    await saveDraft(true);
  }

  el.connect.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.busy) return;
    const token = el.key.value.replace(/\s+/g, '');
    const problem = core.checkKeyFormat(token);
    if (problem) {
      keyError(problem);
      el.key.focus();
      return;
    }
    keyError('');
    state.busy = true;
    el.connectBtn.disabled = true;
    el.connectBtn.textContent = 'Connecting…';
    let remembered = false;
    try {
      const client = core.createClient({ token, repo });
      await client.checkAccess();
      state.client = client;
      // Only now, with a key that works, is the old one replaced.
      remembered = savedKey.set(token);
      el.key.value = '';
      el.keyAgain.hidden = true;
    } catch (err) {
      keyError(core.describeError(err, repo, 'connect'));
      el.key.focus();
      return;
    } finally {
      state.busy = false;
      el.connectBtn.disabled = false;
      el.connectBtn.textContent = 'Connect';
    }
    await openForm({ keep: state.formStarted });
    if (!remembered) notice('This phone can’t remember the key (private browsing?), so you will need to paste it again next time.');
  });

  el.keyRetry.addEventListener('click', () => {
    const token = savedKey.get();
    if (!token || state.busy) return;
    useKey(token);
    openForm({ keep: state.formStarted });
  });
  el.keyNew.addEventListener('click', () => {
    el.key.focus();
    el.key.scrollIntoView({ block: 'center' });
  });

  el.retry.addEventListener('click', () => openForm({ keep: state.formStarted }));

  el.forget.addEventListener('click', () => {
    if (state.busy) return;
    if (!window.confirm('Forget the GitHub key on this phone, and any photos waiting to be sent? To add photos again, you will need to paste a key.')) return;
    savedKey.clear();
    state.client = null;
    state.tree = null;
    state.formStarted = false;
    state.draftReady = false;
    state.memo = {};
    savedMemo.set(null);
    clearPhotos();
    kept.clear();
    resetChapter();
    fillDetails({});
    state.original = {};
    state.pendingEdits = null;
    setText(el.restored, '');
    notice('');
    sendError('');
    keyError('');
    el.keyAgain.hidden = true;
    show('up-connect');
    el.key.focus();
  });

  /* ---------- 1. Which project ---------- */

  function fillProjects(select, { choose = false } = {}) {
    const wanted = select === undefined ? el.project.value || core.NEW : select;
    el.project.textContent = '';
    const option = (value, text) => {
      const o = d.createElement('option');
      o.value = value;
      o.textContent = text;
      el.project.appendChild(o);
      return o;
    };
    if (choose) option('', 'Choose a project…').disabled = true;
    option(core.NEW, `New project (Project ${state.tree.next})`);
    state.tree.projects.forEach((p) => option(p.folder, core.projectLabel(p, config)));
    if (choose) el.project.value = '';
    else el.project.value = state.tree.projects.some((p) => p.folder === wanted) ? wanted : core.NEW;
  }

  const currentProject = () => (state.tree ? state.tree.projects.find((p) => p.folder === el.project.value) || null : null);

  function applyEdits(edits) {
    el.fields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(edits, field.dataset.field)) field.value = edits[field.dataset.field];
    });
  }

  let detailsRun = 0;
  /** Shows the chosen project's details. edits: typed details to put back on top (after a reload). */
  async function chooseProject(edits) {
    const run = ++detailsRun;
    sendError('');
    refreshChapters();
    state.pendingEdits = edits && Object.keys(edits).length ? edits : null;
    if (!el.project.value) {
      fillDetails({});
      state.original = {};
      setDetailsReady(false, 'Choose the project first (step 1).');
      return;
    }
    const project = currentProject();
    if (!project) {
      fillDetails(edits || {});
      state.original = {};
      state.pendingEdits = null;
      setDetailsReady(true, '');
      el.details.open = true;
      return;
    }
    el.details.open = Boolean(state.pendingEdits);
    fillDetails({});
    setDetailsReady(false, 'Loading this project’s details…');
    try {
      const text = project.info ? await state.client.readText(project.info.sha) : '';
      if (run !== detailsRun) return;
      fillDetails(core.readInfo(text, config));
      state.original = currentDetails();
      if (state.pendingEdits) applyEdits(state.pendingEdits);
      state.pendingEdits = null;
      setDetailsReady(true, '');
    } catch (err) {
      if (run !== detailsRun) return;
      if (err.kind === 'auth') {
        askForKey(core.describeError(err, repo, 'load'));
        return;
      }
      state.original = currentDetails();
      setDetailsReady(false, `Couldn’t load this project’s details, so they can’t be changed now. You can still add photos. ${core.describeError(err, repo, 'load')}`);
    }
  }

  el.project.addEventListener('change', async () => {
    await chooseProject();
    saveDraft(true);
  });

  /* ---------- 2. Chapter ---------- */

  function selectedChapter() {
    const checked = el.chips.querySelector('input[name="chapter"]:checked');
    return checked ? { key: checked.value } : null;
  }

  function chapterKey(chapter) {
    if (!chapter) return '';
    if (chapter.key.startsWith('dir:')) return core.chapterKeyOf(chapter.key.slice(4), config);
    return chapter.key;
  }

  /** Adds the project's other folders (like "Pooja room"), if it has any, as choices next to Before and After. */
  function refreshChapters() {
    el.chips.querySelectorAll('[data-dir]').forEach((chip) => chip.remove());
    const project = currentProject();
    if (project) {
      project.dirs.filter((dir) => !['before', 'after'].includes(core.chapterKeyOf(dir, config))).forEach((dir) => {
        const label = d.createElement('label');
        label.className = 'tier';
        label.dataset.dir = dir;
        const input = d.createElement('input');
        input.type = 'radio';
        input.name = 'chapter';
        input.value = `dir:${dir}`;
        const span = d.createElement('span');
        span.textContent = core.titleFromFolder(dir);
        label.append(input, span);
        el.chips.appendChild(label);
      });
    }
    const hideCover = Boolean(project && project.hasCover);
    state.photos.forEach((p) => {
      if (hideCover) p.cover = false;
      p.row.cover.checked = p.cover;
      p.row.coverLabel.hidden = hideCover;
    });
    chapterChanged();
  }

  function chapterChanged() {
    const chapter = selectedChapter();
    const key = chapterKey(chapter);
    const hints = {
      before: 'Photos of the home before you started, like the empty rooms. They show on your website in the order you add them.',
      after: 'Photos of the finished work. They show in the order you add them. Optional: give an after photo the same caption as a before photo (the caption box suggests them) and your website shows the two as a before/after slider.',
    };
    setText(el.chapterHint, hints[key] || '');
    el.captions.textContent = '';
    core.partnerCaptions(currentProject(), key, config).forEach((caption) => {
      const option = d.createElement('option');
      option.value = caption;
      el.captions.appendChild(option);
    });
    refreshWarnings();
  }

  function resetChapter() {
    el.chips.querySelectorAll('input[name="chapter"]').forEach((input) => {
      input.checked = false;
    });
    chapterChanged();
  }

  el.chips.addEventListener('change', () => {
    sendError('');
    chapterChanged();
    saveDraft();
  });

  /* ---------- 3. Photos ---------- */

  function addFiles(input) {
    const files = Array.from(input.files || []);
    input.value = '';
    state.problems = [];
    sendError('');
    setText(el.restored, '');
    for (const file of files) {
      const key = `${file.name}|${file.size}|${file.lastModified}`;
      if (state.photos.some((p) => p.key === key)) continue;
      if (state.photos.length >= core.MAX_PHOTOS) {
        state.problems.push(`You can send up to ${core.MAX_PHOTOS} photos at a time. Publish these first, then add the rest.`);
        break;
      }
      const problem = core.checkFile(file);
      if (problem) {
        state.problems.push(`${file.name}: ${problem.text}`);
        continue;
      }
      const photo = { id: state.nextId++, key, name: file.name, type: file.type, file, caption: '', cover: false, sha: '', uploaded: false, ready: false, removed: false };
      state.photos.push(photo);
      renderPhoto(photo);
      state.preparing += 1;
      state.queue = state.queue.then(() => prepare(photo));
    }
    showProblems();
    numberRows();
    updatePhotoStatus();
    refreshWarnings();
  }
  el.gallery.addEventListener('change', () => addFiles(el.gallery));
  el.camera.addEventListener('change', () => addFiles(el.camera));

  function showProblems() {
    setText(el.photoErr, state.problems.length ? `Not added:\n${state.problems.join('\n')}` : '');
  }

  function renderPhoto(photo) {
    const li = d.createElement('li');
    li.className = 'up-photo';
    const box = d.createElement('span');
    box.className = 'up-thumb-box';
    const thumb = d.createElement('img');
    thumb.className = 'up-thumb';
    thumb.alt = '';
    thumb.width = 96;
    thumb.height = 96;
    thumb.hidden = true;
    box.appendChild(thumb);
    const body = d.createElement('div');
    body.className = 'up-photo-body';
    const label = d.createElement('label');
    label.htmlFor = `up-cap-${photo.id}`;
    const caption = d.createElement('input');
    caption.type = 'text';
    caption.id = `up-cap-${photo.id}`;
    caption.maxLength = 60;
    caption.autocomplete = 'off';
    caption.placeholder = 'Like: Master wardrobe';
    caption.setAttribute('list', 'up-captions');
    caption.setAttribute('autocapitalize', 'sentences');
    caption.setAttribute('enterkeyhint', 'done');
    const warn = d.createElement('p');
    warn.className = 'hint up-warn';
    warn.id = `up-cap-${photo.id}-warn`;
    warn.hidden = true;
    caption.setAttribute('aria-describedby', warn.id);
    caption.addEventListener('input', () => {
      photo.caption = caption.value;
      refreshWarnings();
      saveDraft();
    });
    const status = d.createElement('p');
    status.className = 'up-photo-state';
    status.textContent = 'Getting ready…';
    body.append(label, caption, warn, status);
    const actions = d.createElement('div');
    actions.className = 'up-photo-actions';
    const coverLabel = d.createElement('label');
    coverLabel.className = 'up-cover';
    const cover = d.createElement('input');
    cover.type = 'checkbox';
    cover.addEventListener('change', () => {
      state.photos.forEach((p) => {
        p.cover = p === photo && cover.checked;
        p.row.cover.checked = p.cover;
      });
      refreshWarnings();
      saveDraft();
    });
    coverLabel.append(cover, d.createTextNode('Cover photo'));
    const project = currentProject();
    coverLabel.hidden = Boolean(project && project.hasCover);
    const remove = d.createElement('button');
    remove.type = 'button';
    remove.className = 'btn up-remove';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      removePhoto(photo);
      el.gallery.focus();
    });
    actions.append(coverLabel, remove);
    li.append(box, body, actions);
    el.list.appendChild(li);
    photo.row = { li, thumb, label, caption, warn, status, cover, coverLabel, remove };
  }

  /** Labels say which photo they belong to, for screen readers ("Caption for photo 2"). */
  function numberRows() {
    state.photos.forEach((photo, i) => {
      const sr = d.createElement('span');
      sr.className = 'sr';
      sr.textContent = ` for photo ${i + 1}`;
      photo.row.label.textContent = '';
      photo.row.label.append('Caption', sr, ' (optional)');
      photo.row.remove.setAttribute('aria-label', `Remove photo ${i + 1}`);
    });
  }

  function removePhoto(photo) {
    photo.removed = true;
    if (photo.thumb) URL.revokeObjectURL(photo.thumb);
    photo.row.li.remove();
    state.photos = state.photos.filter((p) => p !== photo);
    kept.remove(`photo:${photo.id}`);
    numberRows();
    updatePhotoStatus();
    refreshWarnings();
    saveDraft();
  }

  function clearPhotos() {
    state.photos.slice().forEach(removePhoto);
    state.problems = [];
    showProblems();
  }

  el.clear.addEventListener('click', () => {
    if (state.busy || !state.photos.length) return;
    if (!window.confirm('Remove all the photos waiting to be sent? Photos already on your website stay there.')) return;
    clearPhotos();
    setText(el.restored, '');
    saveDraft(true);
  });

  function updatePhotoStatus() {
    const ready = state.photos.filter((p) => p.ready).length;
    el.photoStatus.textContent = state.preparing
      ? `Getting photos ready… ${state.preparing} to go.`
      : ready ? `${ready} photo${ready === 1 ? '' : 's'} ready.` : '';
    el.clear.hidden = !state.photos.length;
  }

  async function prepare(photo) {
    try {
      if (photo.removed) return;
      const made = await makeWebPhoto(photo.file);
      if (photo.removed) {
        URL.revokeObjectURL(made.thumb);
        return;
      }
      // The same photo chosen twice is the same file for GitHub too: keep one.
      const twin = made.sha && state.photos.find((p) => p !== photo && p.ready && p.sha === made.sha);
      if (twin) {
        URL.revokeObjectURL(made.thumb);
        removePhoto(photo);
        state.problems.push(`${photo.name}: this photo is in the list already.`);
        showProblems();
        return;
      }
      Object.assign(photo, { blob: made.blob, ext: made.ext, sha: made.sha, thumb: made.thumb, ready: true, file: null });
      photo.row.thumb.src = photo.thumb;
      photo.row.thumb.hidden = false;
      photo.row.status.hidden = true;
      // Kept on the phone until it is published, so a closed page loses nothing.
      await kept.put(`photo:${photo.id}`, { kind: 'photo', id: photo.id, name: photo.name, type: photo.type, ext: photo.ext, mime: made.blob.type, sha: photo.sha, bytes: made.bytes, thumbBytes: made.thumbBytes });
      if (photo.removed) kept.remove(`photo:${photo.id}`);
      else saveDraft(true);
    } catch (err) {
      if (!photo.removed) {
        removePhoto(photo);
        state.problems.push(`${photo.name}: ${err.text || core.unreadableText(photo)}`);
        showProblems();
      }
    } finally {
      state.preparing -= 1;
      photo.file = null;
      updatePhotoStatus();
      refreshWarnings();
    }
  }

  class PhotoProblem extends Error {
    constructor(text) {
      super(text);
      this.text = text;
    }
  }

  function blobBytes(blob) {
    if (blob.arrayBuffer) return blob.arrayBuffer();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
  }

  /**
   * Redraws a photo at most 2000 px on its longest side and saves it as a new JPEG. The browser turns it
   * upright first, and the new file has none of the original's hidden data: no GPS location, no camera details.
   */
  async function makeWebPhoto(file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    try {
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      if (!width || !height) throw new PhotoProblem(core.unreadableText(file));
      if (width * height > core.MAX_PIXELS) throw new PhotoProblem(core.tooManyPixelsText(width, height));
      const blob = await drawJpeg(img, core.fitInside(width, height, config.maxSide), config.quality);
      const small = await drawJpeg(img, core.fitInside(width, height, 240), 0.7);
      // Every phone browser saves JPEG; one that can't falls back to PNG, and the file name says so.
      const ext = blob.type === 'image/png' ? '.png' : blob.type === 'image/webp' ? '.webp' : '.jpg';
      const bytes = await blobBytes(blob);
      const sha = await core.gitBlobSha(new Uint8Array(bytes)).catch(() => '');
      return { blob, ext, sha, bytes, thumbBytes: await blobBytes(small), thumb: URL.createObjectURL(small) };
    } catch (err) {
      throw err instanceof PhotoProblem ? err : new PhotoProblem(core.unreadableText(file));
    } finally {
      img.onload = null;
      img.onerror = null;
      img.removeAttribute('src');
      URL.revokeObjectURL(url);
    }
  }

  function drawJpeg(img, size, quality) {
    return new Promise((resolve, reject) => {
      const canvas = d.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('This phone has no room to prepare the photo.'));
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size.width, size.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, size.width, size.height);
      canvas.toBlob((blob) => {
        // Safari frees a canvas's memory only when it is made empty.
        canvas.width = 0;
        canvas.height = 0;
        if (blob && blob.size) resolve(blob);
        else reject(new Error('The photo couldn’t be saved.'));
      }, 'image/jpeg', quality);
    });
  }

  /** Warns about captions the website can't show, using the names the photos would get. */
  function refreshWarnings() {
    if (!state.tree || !state.photos.length) return;
    const request = { project: el.project.value, chapter: selectedChapter(), photos: state.photos.map((p) => ({ caption: p.caption, cover: p.cover, ext: p.ext })) };
    const names = core.previewNames(state.tree, request, config);
    state.photos.forEach((photo, i) => setText(photo.row.warn, core.captionProblem(photo.caption, names[i] || '')));
  }

  /* ---------- 4. Details ---------- */

  function fillDetails(values) {
    el.fields.forEach((field) => {
      field.value = values[field.dataset.field] || '';
    });
    setText(el.priceErr, '');
  }

  function currentDetails() {
    const out = {};
    el.fields.forEach((field) => {
      out[field.dataset.field] = field.value;
    });
    return out;
  }

  function setDetailsReady(ready, message) {
    state.detailsReady = ready;
    el.fields.forEach((field) => {
      field.disabled = !ready;
    });
    setText(el.detailsStatus, message);
  }

  const tidy = (key, value) => (key === 'price'
    ? String(value || '').split(/\r\n|\r|\n/).map((s) => s.trim()).filter(Boolean).join('\n')
    : String(value || '').replace(/\s+/g, ' ').trim());

  /** Only the details the owner changed, so everything else in info.txt stays exactly as it was. */
  function detailChanges() {
    if (!state.detailsReady) return {};
    const changes = {};
    Object.entries(currentDetails()).forEach(([key, value]) => {
      if (tidy(key, value) !== tidy(key, state.original[key])) changes[key] = value;
    });
    return changes;
  }

  el.price.addEventListener('input', () => setText(el.priceErr, ''));
  el.fieldsBox.addEventListener('input', () => saveDraft());

  /* ---------- Publish ---------- */

  function check(changes) {
    const isNew = el.project.value === core.NEW;
    const chapter = selectedChapter();
    if (!el.project.value) return { text: 'Choose which project the photos are for (step 1).', focus: el.project };
    if (state.preparing) return { text: 'Wait a moment: the photos are still being made ready.' };
    if (isNew && !state.photos.length) return { text: 'Add at least one photo for the new project.', focus: el.gallery };
    if (state.photos.length && !chapter) return { text: 'Choose Before or After (step 2).', focus: el.chips.querySelector('input') };
    if (Object.prototype.hasOwnProperty.call(changes, 'price')) {
      const problems = core.checkPrice(changes.price, config);
      if (problems.length) {
        el.details.open = true;
        setText(el.priceErr, problems.join('\n'));
        return { text: problems[0], focus: el.price };
      }
    }
    if (!isNew && !state.photos.length && !Object.keys(changes).length) return { text: 'Add photos, or change a detail, first.', focus: el.gallery };
    return null;
  }

  function progress(percent, text) {
    el.bar.value = Math.round(percent);
    el.progressText.textContent = text;
  }

  function onProgress({ stage, done, total }) {
    if (stage === 'check') progress(5, 'Checking whether your last publish arrived…');
    else if (stage === 'send') progress((done / (total + 1)) * 100, `Sending photo ${done + 1} of ${total}…`);
    else progress(total ? (total / (total + 1)) * 100 : 50, 'Saving to GitHub…');
  }

  function readBase64(photo) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const url = String(reader.result);
        resolve(url.slice(url.indexOf(',') + 1));
      };
      reader.onerror = () => reject(reader.error || new Error('The photo couldn’t be read.'));
      reader.readAsDataURL(photo.blob);
    });
  }

  /** Keeps the screen on while sending (where the browser allows it), so the phone doesn't sleep mid-upload. */
  async function keepScreenOn() {
    try {
      if (navigator.wakeLock && d.visibilityState === 'visible') {
        const asked = navigator.wakeLock.request('screen');
        // Never let a slow answer hold up the upload itself.
        const lock = await Promise.race([asked, new Promise((resolve) => setTimeout(resolve, 1000, null))]);
        if (!lock) {
          asked.then((late) => late.release()).catch(() => {});
          return () => {};
        }
        return () => {
          lock.release().catch(() => {});
        };
      }
    } catch (err) {
      // Not allowed here; the upload works anyway.
    }
    return () => {};
  }

  function stayHere(e) {
    e.preventDefault();
    e.returnValue = '';
  }

  el.form.addEventListener('submit', (e) => e.preventDefault());

  el.publish.addEventListener('click', async () => {
    if (state.busy) return;
    sendError('');
    const changes = detailChanges();
    const problem = check(changes);
    if (problem) {
      sendError(problem.text);
      if (problem.focus) problem.focus.focus();
      return;
    }
    const photos = state.photos.slice();
    const request = {
      project: el.project.value,
      chapter: selectedChapter(),
      photos: photos.map((p) => ({ caption: p.caption, cover: p.cover, ext: p.ext })),
      changes,
    };
    state.busy = true;
    el.forget.disabled = true;
    await saveDraft(true);
    show('up-progress');
    progress(0, photos.length ? 'Getting ready…' : 'Saving to GitHub…');
    const release = await keepScreenOn();
    window.addEventListener('beforeunload', stayHere);
    try {
      const result = await core.publish({ client: state.client, config, request, photos, readBase64, onProgress, memo: state.memo, onMemo: () => saveDraft(true) });
      await finished(result);
    } catch (err) {
      show('up-form');
      if (err.kind === 'auth') {
        askForKey(core.describeError(err, repo, 'publish'));
      } else {
        if (err.kind === 'gone') {
          // The project was renamed or removed meanwhile: show the projects as they are now, and keep the photos.
          try {
            await load({ choose: true });
          } catch (loadErr) {
            // The list stays as it was; the next publish reads GitHub again anyway.
          }
          await chooseProject();
        }
        sendError(core.describeError(err, repo, 'publish'));
      }
    } finally {
      state.busy = false;
      el.forget.disabled = false;
      window.removeEventListener('beforeunload', stayHere);
      release();
      saveDraft(true);
    }
  });

  async function finished(result) {
    const count = result.names.length;
    const photos = `${count} photo${count === 1 ? '' : 's'}`;
    const name = result.num ? `Project ${result.num}` : core.titleFromFolder(result.folder);
    let text;
    if (result.already) {
      text = `These photos are on GitHub already, in ${name}, so nothing was saved twice.${result.unchanged ? '' : ' The changed details are saved.'}`;
    } else if (result.unchanged) {
      text = `Nothing new to save: ${name} already has these details.`;
    } else if (result.isNew) {
      text = `${name} is saved with ${photos}. It will be on your website in about 2 minutes.`;
    } else if (count) {
      text = `${photos} saved to ${name}. ${count === 1 ? 'It' : 'They'} will be on your website in about 2 minutes.`;
    } else {
      text = `The details of ${name} are saved. They will be on your website in about 2 minutes.`;
    }
    // The signal was lost just as GitHub saved the last publish: it is there, and nothing was saved twice.
    if (result.earlier) text = `Your last publish arrived after all. ${text}`;
    el.doneText.textContent = text;
    el.doneLink.href = core.projectUrl(result.folder, result.num, config);
    el.doneLink.textContent = `See ${name} on your website`;
    // Only the photos that were saved leave the list (photos added since then stay for the next publish).
    const sent = new Set(result.sent || []);
    state.photos.filter((p) => p.sha && sent.has(p.sha)).forEach(removePhoto);
    state.problems = [];
    showProblems();
    setText(el.restored, '');
    // What was typed is saved now, so it isn't kept as a change any more.
    state.original = currentDetails();
    try {
      // The new commit's own files: reading the branch again could still show the old version for a moment.
      await load({ treeSha: result.tree, select: result.folder });
    } catch (err) {
      // The next publish reads GitHub again anyway.
    }
    await saveDraft(true);
    show('up-done');
    el.done.focus();
  }

  el.again.addEventListener('click', async () => {
    resetChapter();
    show('up-form');
    window.scrollTo(0, 0);
    await chooseProject();
    saveDraft(true);
  });

  /* ---------- Start ---------- */

  el.repoName.textContent = repo;
  if (!repo) {
    show('up-norepo');
    return;
  }
  const token = savedKey.get();
  if (token) {
    useKey(token);
    openForm();
  } else {
    show('up-connect');
  }
})();

/* Upload page (admin/): add a project, or photos to a project, straight from a phone.
   Photos are redrawn smaller right here in the browser, which also removes their hidden data (GPS location,
   camera details), before anything is sent. Then everything is saved to GitHub as one commit.
   The GitHub key stays on this phone (localStorage) and is only ever sent to api.github.com.
   The rules (names, info.txt, the commit) are in admin-core.js. */
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

  const el = {
    alert: $('up-alert'),
    loadingText: $('up-loading-text'),
    retry: $('up-retry'),
    connect: $('up-connect'),
    connectBtn: $('up-connect-btn'),
    key: $('up-key'),
    keyErr: $('up-key-err'),
    form: $('up-form'),
    project: $('up-project'),
    chips: $('up-chips'),
    customChip: $('up-custom-chip'),
    customField: $('up-custom-field'),
    custom: $('up-custom'),
    chapterHint: $('up-chapter-hint'),
    gallery: $('up-gallery'),
    camera: $('up-camera'),
    photoStatus: $('up-photo-status'),
    photoErr: $('up-photo-err'),
    list: $('up-photos'),
    captions: $('up-captions'),
    details: $('up-details'),
    detailsStatus: $('up-details-status'),
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
    photos: [], // { id, name, type, file, blob, ext, thumb, caption, cover, sha, ready, removed, row }
    memo: {}, // the last save, while it isn't certain that it arrived (see core.publish)
    problems: [],
    queue: Promise.resolve(),
    preparing: 0,
    busy: false,
    formStarted: false,
    nextId: 1,
  };

  /* ---------- Screens and messages ---------- */

  const SCREENS = ['up-loading', 'up-norepo', 'up-connect', 'up-form', 'up-progress', 'up-done'];
  function show(id) {
    SCREENS.forEach((screen) => {
      $(screen).hidden = screen !== id;
    });
    el.foot.hidden = !state.client || id === 'up-connect' || id === 'up-norepo';
    if (id === 'up-form') state.formStarted = true;
  }
  function setText(node, text) {
    node.textContent = text || '';
    node.hidden = !text;
  }
  const notice = (text) => setText(el.alert, text);
  const keyError = (text) => setText(el.keyErr, text);
  const sendError = (text) => setText(el.sendErr, text);

  /* ---------- Connecting this phone ---------- */

  function useKey(token) {
    state.client = core.createClient({ token, repo, branch: config.branch });
  }

  function askForKey(message) {
    savedKey.clear();
    state.client = null;
    show('up-connect');
    keyError(message || '');
  }

  async function load({ treeSha, select } = {}) {
    const sha = treeSha || (await state.client.head()).tree;
    state.tree = core.listProjects(await state.client.files(sha), config);
    fillProjects(select);
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
    if (keep) refreshChapters();
    else await chooseProject();
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
      const client = core.createClient({ token, repo, branch: config.branch });
      await client.checkAccess();
      state.client = client;
      remembered = savedKey.set(token);
      el.key.value = '';
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

  el.retry.addEventListener('click', () => openForm({ keep: state.formStarted }));

  el.forget.addEventListener('click', () => {
    if (state.busy) return;
    if (!window.confirm('Forget the GitHub key on this phone? To add photos again, you will need to paste a key.')) return;
    savedKey.clear();
    state.client = null;
    state.tree = null;
    state.formStarted = false;
    state.memo = {};
    clearPhotos();
    resetChapter();
    fillDetails({});
    state.original = {};
    notice('');
    sendError('');
    keyError('');
    show('up-connect');
    el.key.focus();
  });

  /* ---------- 1. Which project ---------- */

  function fillProjects(select) {
    const wanted = select || el.project.value || core.NEW;
    el.project.textContent = '';
    const option = (value, text) => {
      const o = d.createElement('option');
      o.value = value;
      o.textContent = text;
      el.project.appendChild(o);
    };
    option(core.NEW, `New project (Project ${state.tree.next})`);
    state.tree.projects.forEach((p) => option(p.folder, core.projectLabel(p, config)));
    el.project.value = state.tree.projects.some((p) => p.folder === wanted) ? wanted : core.NEW;
  }

  const currentProject = () => (state.tree ? state.tree.projects.find((p) => p.folder === el.project.value) || null : null);

  let detailsRun = 0;
  async function chooseProject() {
    const run = ++detailsRun;
    sendError('');
    refreshChapters();
    const project = currentProject();
    if (!project) {
      fillDetails({});
      state.original = {};
      setDetailsReady(true, '');
      el.details.open = true;
      return;
    }
    el.details.open = false;
    fillDetails({});
    setDetailsReady(false, 'Loading this project’s details…');
    try {
      const text = project.info ? await state.client.readText(project.info.sha) : '';
      if (run !== detailsRun) return;
      fillDetails(core.readInfo(text, config));
      state.original = currentDetails();
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

  el.project.addEventListener('change', () => {
    chooseProject();
  });

  /* ---------- 2. Chapter ---------- */

  function selectedChapter() {
    const checked = el.chips.querySelector('input[name="chapter"]:checked');
    if (!checked) return null;
    return checked.value === 'custom' ? { key: 'custom', name: el.custom.value } : { key: checked.value };
  }

  function chapterKey(chapter) {
    if (!chapter) return '';
    if (chapter.key === 'custom') return core.chapterKeyOf(core.cleanFolderName(chapter.name) || '-', config);
    if (chapter.key.startsWith('dir:')) return core.chapterKeyOf(chapter.key.slice(4), config);
    return chapter.key;
  }

  /** Adds the project's own chapters (like "Pooja room") as choices. */
  function refreshChapters() {
    el.chips.querySelectorAll('[data-dir]').forEach((chip) => chip.remove());
    const project = currentProject();
    if (project) {
      project.dirs.filter((dir) => core.chapterKeyOf(dir, config).startsWith('custom:')).forEach((dir) => {
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
        el.chips.insertBefore(label, el.customChip);
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
    el.customField.hidden = !(chapter && chapter.key === 'custom');
    const key = chapterKey(chapter);
    const hints = {
      before: 'Take each before photo from a spot you can find again, so the after photo can match it.',
      after: 'Give each after photo the same caption as its before photo (the caption box suggests them), or add them in the same order. Your website then shows a before/after slider.',
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
    el.custom.value = '';
    chapterChanged();
  }

  el.chips.addEventListener('change', () => {
    sendError('');
    chapterChanged();
    if (!el.customField.hidden) el.custom.focus();
  });
  el.custom.addEventListener('input', chapterChanged);

  /* ---------- 3. Photos ---------- */

  function addFiles(input) {
    const files = Array.from(input.files || []);
    input.value = '';
    state.problems = [];
    sendError('');
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
      const photo = { id: state.nextId++, key, name: file.name, type: file.type, file, caption: '', cover: false, sha: '', ready: false, removed: false };
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
    numberRows();
    updatePhotoStatus();
    refreshWarnings();
  }

  function clearPhotos() {
    state.photos.slice().forEach(removePhoto);
    state.problems = [];
    showProblems();
  }

  function updatePhotoStatus() {
    const ready = state.photos.filter((p) => p.ready).length;
    el.photoStatus.textContent = state.preparing
      ? `Getting photos ready… ${state.preparing} to go.`
      : ready ? `${ready} photo${ready === 1 ? '' : 's'} ready.` : '';
  }

  async function prepare(photo) {
    try {
      if (photo.removed) return;
      const made = await makeWebPhoto(photo.file);
      if (photo.removed) {
        URL.revokeObjectURL(made.thumb);
        return;
      }
      Object.assign(photo, made, { ready: true, file: null });
      photo.row.thumb.src = photo.thumb;
      photo.row.thumb.hidden = false;
      photo.row.status.hidden = true;
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
      const thumb = await drawJpeg(img, core.fitInside(width, height, 240), 0.7);
      // Every phone browser saves JPEG; one that can't falls back to PNG, and the file name says so.
      const ext = blob.type === 'image/png' ? '.png' : blob.type === 'image/webp' ? '.webp' : '.jpg';
      return { blob, ext, thumb: URL.createObjectURL(thumb) };
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

  /* ---------- Publish ---------- */

  function check(changes) {
    const isNew = el.project.value === core.NEW;
    const chapter = selectedChapter();
    if (state.preparing) return { text: 'Wait a moment: the photos are still being made ready.' };
    if (isNew && !state.photos.length) return { text: 'Add at least one photo for the new project.', focus: el.gallery };
    if (state.photos.length && !chapter) return { text: 'Choose what the photos are of (step 2).', focus: el.chips.querySelector('input') };
    if (state.photos.length && chapter.key === 'custom' && !core.cleanFolderName(chapter.name)) return { text: 'Type a name for the new chapter.', focus: el.custom };
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
    show('up-progress');
    progress(0, photos.length ? 'Getting ready…' : 'Saving to GitHub…');
    const release = await keepScreenOn();
    window.addEventListener('beforeunload', stayHere);
    try {
      const result = await core.publish({ client: state.client, config, request, photos, readBase64, onProgress, memo: state.memo });
      await finished(result);
    } catch (err) {
      show('up-form');
      if (err.kind === 'auth') askForKey(core.describeError(err, repo, 'publish'));
      else sendError(core.describeError(err, repo, 'publish'));
    } finally {
      state.busy = false;
      el.forget.disabled = false;
      window.removeEventListener('beforeunload', stayHere);
      release();
    }
  });

  async function finished(result) {
    const count = result.names.length;
    const photos = `${count} photo${count === 1 ? '' : 's'}`;
    const name = result.num ? `Project ${result.num}` : core.titleFromFolder(result.folder);
    let text;
    if (result.unchanged) text = `Nothing new to save: ${name} already has these details.`;
    else if (result.isNew) text = `${name} is saved with ${photos}. It will be on your website in about 2 minutes.`;
    else if (count) text = `${photos} saved to ${name}. ${count === 1 ? 'It' : 'They'} will be on your website in about 2 minutes.`;
    else text = `The details of ${name} are saved. They will be on your website in about 2 minutes.`;
    // The signal was lost just as GitHub saved the last publish: it is there, and nothing was saved twice.
    if (result.earlier) text = `Your last publish arrived after all. ${text}`;
    el.doneText.textContent = text;
    el.doneLink.href = core.projectUrl(result.folder, result.num, config);
    el.doneLink.textContent = `See ${name} on your website`;
    // Only the photos that were saved leave the list (photos added since then stay for the next publish).
    const sent = new Set(result.sent || []);
    state.photos.filter((p) => sent.has(p)).forEach(removePhoto);
    state.problems = [];
    showProblems();
    try {
      // The new commit's own files: reading the branch again could still show the old version for a moment.
      await load({ treeSha: result.tree, select: result.folder });
    } catch (err) {
      // The next publish reads GitHub again anyway.
    }
    show('up-done');
    el.done.focus();
  }

  el.again.addEventListener('click', async () => {
    resetChapter();
    show('up-form');
    window.scrollTo(0, 0);
    await chooseProject();
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

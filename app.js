/* ============================================================
   Sang Alkemis — App Logic
   ============================================================ */

(function() {
  'use strict';

  // ============================================================
  // STATE & STORAGE
  // ============================================================

  const STORAGE_KEYS = {
    CHAPTERS: 'sangalkemis_chapters_v1',
    PROGRESS: 'sangalkemis_progress_v1',
    SETTINGS: 'sangalkemis_settings_v1',
    SRS: 'sangalkemis_srs_v1',
    LAST_VIEW: 'sangalkemis_lastview_v1',
    ACTIVE_SESSION: 'sangalkemis_activesession_v1',
  };

  // Built-in chapters loaded from /chapters/ folder
  const BUILTIN_CHAPTERS = [
    'chapters/00-prolog.json',
    'chapters/01-bagian-satu.json',
  ];

  let chapters = {};      // id -> chapter object
  let progress = {};      // wordKey -> 'known' | 'learning' (default = learning if clicked at least once)
  let settings = {
    dimKnown: true,
    fontSize: 20,
  };
  let currentChapter = null;
  let activeWordUnit = null;
  let longPressTimer = null;
  let longPressTriggered = false;
  let lastClickTime = 0;
  let lastClickUnit = null;

  // SRS (Spaced Repetition System) state
  // srsData maps wordKey -> { level: 0..6, nextDue: ISO timestamp ms, lastReviewed: ms, correctCount: 0, wrongCount: 0 }
  let srsData = {};
  // Current test session state
  let testSession = null; // { queue: [keys], currentIdx: 0, results: [{key, knew}], totalCorrect: 0, newWords: 0 }
  // Last view info (for resume on app open): { view: 'library'|'reader'|'dict'|'test', chapterId?: string }
  let lastView = null;

  // ============================================================
  // STORAGE HELPERS
  // ============================================================

  function loadFromStorage() {
    try {
      const c = localStorage.getItem(STORAGE_KEYS.CHAPTERS);
      if (c) chapters = JSON.parse(c);
      const p = localStorage.getItem(STORAGE_KEYS.PROGRESS);
      if (p) progress = JSON.parse(p);
      const s = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (s) settings = Object.assign(settings, JSON.parse(s));
      const sr = localStorage.getItem(STORAGE_KEYS.SRS);
      if (sr) {
        srsData = JSON.parse(sr);
        // Migrate old entries (pre-v4): add missing `streak` field
        let migrated = false;
        for (const k in srsData) {
          if (srsData[k] && typeof srsData[k].streak === 'undefined') {
            srsData[k].streak = 0;
            migrated = true;
          }
        }
        if (migrated) saveSRS();
      }
      const lv = localStorage.getItem(STORAGE_KEYS.LAST_VIEW);
      if (lv) {
        try { lastView = JSON.parse(lv); } catch (e) { lastView = null; }
      }
    } catch (e) {
      console.error('Storage load failed:', e);
    }
  }

  function saveChapters() {
    try { localStorage.setItem(STORAGE_KEYS.CHAPTERS, JSON.stringify(chapters)); }
    catch (e) { console.error('Save chapters failed:', e); }
  }
  function saveProgress() {
    try { localStorage.setItem(STORAGE_KEYS.PROGRESS, JSON.stringify(progress)); }
    catch (e) { console.error('Save progress failed:', e); }
  }
  function saveSettings() {
    try { localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings)); }
    catch (e) { console.error('Save settings failed:', e); }
  }
  function saveSRS() {
    try { localStorage.setItem(STORAGE_KEYS.SRS, JSON.stringify(srsData)); }
    catch (e) { console.error('Save SRS failed:', e); }
  }

  function saveLastView(viewName, extra) {
    try {
      lastView = Object.assign({ view: viewName }, extra || {});
      localStorage.setItem(STORAGE_KEYS.LAST_VIEW, JSON.stringify(lastView));
    } catch (e) { console.error('Save lastView failed:', e); }
  }

  function saveActiveSession() {
    try {
      if (!testSession) {
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION);
        return;
      }
      // Serialize Sets to arrays
      const serial = {
        initialWords: testSession.initialWords,
        queue: testSession.queue,
        currentIdx: testSession.currentIdx,
        results: testSession.results,
        uniqueAnswered: Array.from(testSession.uniqueAnswered),
        totalCorrect: testSession.totalCorrect,
        totalAnswers: testSession.totalAnswers,
        newWords: testSession.newWords,
        graduatedKeys: Array.from(testSession.graduatedKeys),
        startedAt: testSession.startedAt,
      };
      localStorage.setItem(STORAGE_KEYS.ACTIVE_SESSION, JSON.stringify(serial));
    } catch (e) { console.error('Save session failed:', e); }
  }

  function loadActiveSession() {
    try {
      const s = localStorage.getItem(STORAGE_KEYS.ACTIVE_SESSION);
      if (!s) return null;
      const data = JSON.parse(s);
      // Check session is from today; if older than 18 hours, discard
      const ageMs = Date.now() - (data.startedAt || 0);
      if (ageMs > 18 * 60 * 60 * 1000) {
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION);
        return null;
      }
      return {
        initialWords: data.initialWords || [],
        queue: data.queue || [],
        currentIdx: data.currentIdx || 0,
        results: data.results || [],
        uniqueAnswered: new Set(data.uniqueAnswered || []),
        totalCorrect: data.totalCorrect || 0,
        totalAnswers: data.totalAnswers || 0,
        newWords: data.newWords || 0,
        graduatedKeys: new Set(data.graduatedKeys || []),
        startedAt: data.startedAt || Date.now(),
      };
    } catch (e) {
      console.error('Load session failed:', e);
      return null;
    }
  }

  function clearActiveSession() {
    try { localStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION); }
    catch (e) {}
  }

  // Word key: normalize for consistent lookup
  function wordKey(id) {
    return id.toLowerCase().replace(/[.,;:!?¡¿"'\u201C\u201D\u2026]/g, '').trim();
  }

  // ============================================================
  // CHAPTER LOADING
  // ============================================================

  async function loadBuiltinChapters() {
    for (const url of BUILTIN_CHAPTERS) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        if (data && data.id) {
          // Only add if not already imported (user imports take precedence)
          if (!chapters[data.id]) {
            chapters[data.id] = data;
          }
        }
      } catch (e) {
        console.log('Could not load', url, e.message);
      }
    }
    saveChapters();
  }

  // ============================================================
  // LIBRARY VIEW
  // ============================================================

  function renderLibrary() {
    const list = document.getElementById('chapter-list');
    const ids = Object.keys(chapters).sort();

    if (ids.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          No chapters yet.<br>
          Tap <b>Import chapter</b> and choose a JSON file.
        </div>`;
      return;
    }

    list.innerHTML = '';
    ids.forEach(id => {
      const ch = chapters[id];
      const stats = chapterStats(ch);
      const card = document.createElement('div');
      card.className = 'chapter-card';
      card.innerHTML = `
        <button class="ch-delete" title="Delete" data-del="${id}">×</button>
        <div class="ch-num">${ch.number || ''}</div>
        <div class="ch-title">${escapeHtml(ch.title || id)}</div>
        <div class="ch-meta">${stats.uniqueWords} unique words · ${stats.totalWords} total</div>
      `;
      card.addEventListener('click', (e) => {
        if (e.target.dataset.del) return;
        openChapter(id);
      });
      card.querySelector('[data-del]').addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Delete "${ch.title || id}"?\n(Your progress will be preserved.)`)) {
          delete chapters[id];
          saveChapters();
          renderLibrary();
          toast('Chapter deleted');
        }
      });
      list.appendChild(card);
    });
  }

  function chapterStats(ch) {
    let total = 0, known = 0, seen = 0;
    const seenKeys = new Set();
    (ch.tokens || []).forEach(sentence => {
      if (typeof sentence !== 'object' || !sentence || !sentence.t) return;
      (sentence.t || []).forEach(tok => {
        if (Array.isArray(tok)) {
          total++;
          const k = wordKey(tok[0]);
          if (!seenKeys.has(k)) {
            seenKeys.add(k);
          }
        }
      });
    });
    const uniqueCount = seenKeys.size;
    let uniqueKnown = 0;
    seenKeys.forEach(k => { if (progress[k] === 'known') uniqueKnown++; });
    return {
      totalWords: total,
      uniqueWords: uniqueCount,
      uniqueKnown: uniqueKnown,
    };
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  // ============================================================
  // READER VIEW
  // ============================================================

  function openChapter(id) {
    const ch = chapters[id];
    if (!ch) return;
    currentChapter = ch;
    document.getElementById('chapter-title').textContent = ch.title || id;
    const stats = chapterStats(ch);
    document.getElementById('chapter-progress').textContent =
      `${stats.uniqueWords} unique words · ${stats.uniqueKnown} known`;
    renderStory(ch);
    showView('reader-view');
    window.scrollTo(0, 0);
  }

  function renderStory(ch) {
    const story = document.getElementById('story');
    story.innerHTML = '';
    document.documentElement.style.setProperty('--base-font-size', settings.fontSize + 'px');

    let para = document.createElement('p');
    let sentenceIdx = 0;

    (ch.tokens || []).forEach(token => {
      // Paragraph break
      if (token === 'PARA') {
        if (para.childNodes.length > 0) {
          story.appendChild(para);
        }
        para = document.createElement('p');
        return;
      }

      // Sentence object: { t: [tokens], en: "english translation", dialog: bool }
      if (typeof token === 'object' && token.t) {
        const wrapper = token.dialog
          ? (() => { const s = document.createElement('span'); s.className = 'dialog'; return s; })()
          : para;

        const sentenceEn = token.en || '';
        const sentenceId = token.t
          .map(tok => Array.isArray(tok) ? tok[0] : tok)
          .join(' ').replace(/\s+([.,;:!?\u201D])/g, '$1');

        token.t.forEach(tok => {
          if (typeof tok === 'string') {
            const span = document.createElement('span');
            span.className = 'punct';
            span.textContent = tok;
            wrapper.appendChild(span);
            if (/^[.,;:!?\u201D]$/.test(tok)) {
              wrapper.appendChild(document.createTextNode(' '));
            }
          } else if (Array.isArray(tok)) {
            const [id, en] = tok;
            const unit = makeWordUnit(id, en, sentenceId, sentenceEn);
            wrapper.appendChild(unit);
            wrapper.appendChild(document.createTextNode(' '));
          }
        });

        if (token.dialog) para.appendChild(wrapper);
        sentenceIdx++;
      }
    });

    if (para.childNodes.length > 0) story.appendChild(para);
    applyKnownStyling();
  }

  function makeWordUnit(id, en, sentenceId, sentenceEn) {
    const unit = document.createElement('span');
    unit.className = 'word-unit';
    unit.dataset.key = wordKey(id);
    unit.dataset.id = id;
    unit.dataset.en = en;
    unit.dataset.sentenceId = sentenceId;
    unit.dataset.sentenceEn = sentenceEn;

    const w = document.createElement('span');
    w.className = 'word';
    w.textContent = id;
    const slot = document.createElement('span');
    slot.className = 'slot';
    slot.textContent = en;
    unit.appendChild(w);
    unit.appendChild(slot);

    attachWordHandlers(unit);
    return unit;
  }

  function applyKnownStyling() {
    document.querySelectorAll('.word-unit').forEach(unit => {
      const k = unit.dataset.key;
      if (progress[k] === 'known' && settings.dimKnown) {
        unit.classList.add('known');
      } else {
        unit.classList.remove('known');
      }
    });
  }

  // ============================================================
  // WORD INTERACTIONS
  // ============================================================

  function attachWordHandlers(unit) {
    const word = unit.querySelector('.word');
    let pressX = 0, pressY = 0;
    let moved = false;
    let touchHandled = false;       // touch already processed this gesture
    let suppressMouseUntil = 0;     // ignore synthetic mouse events after touch
    let localLongPressTimer = null;
    let localLongPressTriggered = false;

    function startPress(point) {
      pressX = point.clientX;
      pressY = point.clientY;
      moved = false;
      localLongPressTriggered = false;
      clearTimeout(localLongPressTimer);
      localLongPressTimer = setTimeout(() => {
        localLongPressTriggered = true;
        word.classList.add('long-pressing');
        if (navigator.vibrate) navigator.vibrate(30);
        showSentence(unit);
      }, 500);
    }

    function movePress(point) {
      const dx = Math.abs(point.clientX - pressX);
      const dy = Math.abs(point.clientY - pressY);
      if (dx > 10 || dy > 10) {
        moved = true;
        clearTimeout(localLongPressTimer);
      }
    }

    function endPress() {
      clearTimeout(localLongPressTimer);
      word.classList.remove('long-pressing');
      if (moved) return;
      if (localLongPressTriggered) return;  // long-press already fired showSentence
      handleTap();
    }

    function handleTap() {
      const now = Date.now();
      const isDouble = lastClickUnit === unit && (now - lastClickTime) < 350;

      if (isDouble) {
        toggleKnown(unit);
        lastClickUnit = null;
        lastClickTime = 0;
      } else {
        lastClickUnit = unit;
        lastClickTime = now;
        setTimeout(() => {
          if (lastClickUnit === unit && lastClickTime === now) {
            toggleWordTranslation(unit);
            lastClickUnit = null;
          }
        }, 350);
      }
    }

    // -------- TOUCH EVENTS (mobile) --------
    // touchstart must NOT be passive for preventDefault() in touchend to work in some browsers
    word.addEventListener('touchstart', (e) => {
      touchHandled = true;
      startPress(e.touches[0]);
    }, { passive: true });

    word.addEventListener('touchmove', (e) => {
      movePress(e.touches[0]);
    }, { passive: true });

    word.addEventListener('touchend', (e) => {
      // Block synthetic mouse events from firing for the next 600ms
      suppressMouseUntil = Date.now() + 600;
      // Prevent the browser's emulated click/mouse events for this gesture
      // Only call preventDefault if event is cancelable (won't be if touchstart was passive)
      if (e.cancelable) e.preventDefault();
      endPress();
    });

    word.addEventListener('touchcancel', () => {
      clearTimeout(localLongPressTimer);
      word.classList.remove('long-pressing');
    });

    // -------- MOUSE EVENTS (desktop only) --------
    // These are ignored if a touch event just fired (Android emulates mouse after touch)
    word.addEventListener('mousedown', (e) => {
      if (Date.now() < suppressMouseUntil) return;
      touchHandled = false;
      startPress(e);
    });

    word.addEventListener('mousemove', (e) => {
      if (touchHandled) return;
      movePress(e);
    });

    word.addEventListener('mouseup', (e) => {
      if (Date.now() < suppressMouseUntil) return;
      if (touchHandled) { touchHandled = false; return; }
      endPress();
    });

    word.addEventListener('mouseleave', () => {
      clearTimeout(localLongPressTimer);
      word.classList.remove('long-pressing');
    });

    // Block synthetic click that some Android browsers still send
    word.addEventListener('click', (e) => {
      if (Date.now() < suppressMouseUntil) {
        e.preventDefault();
        e.stopPropagation();
      }
    });

    word.addEventListener('contextmenu', e => e.preventDefault());
  }

  function toggleWordTranslation(unit) {
    if (activeWordUnit && activeWordUnit !== unit) {
      activeWordUnit.classList.remove('visible');
      activeWordUnit.querySelector('.word').classList.remove('active');
    }
    if (activeWordUnit === unit) {
      unit.classList.remove('visible');
      unit.querySelector('.word').classList.remove('active');
      activeWordUnit = null;
    } else {
      unit.classList.add('visible');
      unit.querySelector('.word').classList.add('active');
      activeWordUnit = unit;
    }
  }

  function toggleKnown(unit) {
    const k = unit.dataset.key;
    if (progress[k] === 'known') {
      delete progress[k];
      toast('Marked as "learning" again');
    } else {
      progress[k] = 'known';
      toast(`"${unit.dataset.id}" marked as known`);
    }
    saveProgress();
    // Apply to all instances of this word in current view
    document.querySelectorAll(`.word-unit[data-key="${cssEscape(k)}"]`).forEach(u => {
      if (progress[k] === 'known' && settings.dimKnown) {
        u.classList.add('known');
      } else {
        u.classList.remove('known');
      }
    });
    // Update chapter progress display
    if (currentChapter) {
      const stats = chapterStats(currentChapter);
      document.getElementById('chapter-progress').textContent =
        `${stats.uniqueWords} unique words · ${stats.uniqueKnown} known`;
    }
  }

  function cssEscape(s) {
    return s.replace(/["\\]/g, '\\$&');
  }

  function showSentence(unit) {
    const bar = document.getElementById('sentence-bar');
    document.getElementById('sentence-id').textContent = unit.dataset.sentenceId;
    document.getElementById('sentence-en').textContent = unit.dataset.sentenceEn || '(no translation)';
    bar.classList.remove('hidden');
  }

  function hideSentence() {
    document.getElementById('sentence-bar').classList.add('hidden');
  }

  // ============================================================
  // IMPORT / EXPORT
  // ============================================================

  function handleImport(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.id || !data.title || !Array.isArray(data.tokens)) {
          throw new Error('Invalid format. File must contain id, title and tokens.');
        }
        chapters[data.id] = data;
        saveChapters();
        renderLibrary();
        toast(`"${data.title}" imported`);
      } catch (err) {
        alert('Import failed: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  // ============================================================
  // DICTIONARY
  // ============================================================

  // Build a unified dictionary from all chapters.
  // For each unique word key, collect all (id, translation) pairs found.
  function buildDictionary() {
    const dict = new Map(); // key -> { id (display), translations: Map<en, count> }

    Object.values(chapters).forEach(ch => {
      (ch.tokens || []).forEach(sentence => {
        if (typeof sentence !== 'object' || !sentence || !sentence.t) return;
        sentence.t.forEach(tok => {
          if (!Array.isArray(tok)) return;
          const [id, en] = tok;
          const k = wordKey(id);
          if (!k) return;
          if (!dict.has(k)) {
            dict.set(k, {
              key: k,
              display: id.toLowerCase(),
              translations: new Map(),
            });
          }
          const entry = dict.get(k);
          // Prefer the longer/lowercase display form
          if (id.length >= entry.display.length && id === id.toLowerCase()) {
            entry.display = id;
          }
          const tNorm = (en || '').trim();
          if (tNorm) {
            entry.translations.set(tNorm, (entry.translations.get(tNorm) || 0) + 1);
          }
        });
      });
    });

    // Convert to sorted array
    const arr = Array.from(dict.values());
    // Indonesian alphabetical sort using locale
    arr.sort((a, b) => a.display.localeCompare(b.display, 'id', { sensitivity: 'base' }));
    return arr;
  }

  let dictData = [];           // full dictionary (built on open)
  let dictFilter = 'all';      // 'all' | 'learning' | 'known'
  let dictSearchTerm = '';

  function openDictionary() {
    dictData = buildDictionary();
    dictSearchTerm = '';
    dictFilter = 'all';
    document.getElementById('dict-search').value = '';
    document.querySelectorAll('input[name="dict-filter"]').forEach(r => {
      r.checked = (r.value === 'all');
    });
    renderDictionary();
    showView('dict-view');
    window.scrollTo(0, 0);
  }

  function renderDictionary() {
    const list = document.getElementById('dict-list');
    const search = dictSearchTerm.toLowerCase().trim();

    // Filter entries
    const filtered = dictData.filter(entry => {
      // Filter by known/learning status
      const isKnown = progress[entry.key] === 'known';
      if (dictFilter === 'known' && !isKnown) return false;
      if (dictFilter === 'learning' && isKnown) return false;

      // Filter by search term
      if (search) {
        if (entry.display.toLowerCase().includes(search)) return true;
        // Search in translations too
        for (const t of entry.translations.keys()) {
          if (t.toLowerCase().includes(search)) return true;
        }
        return false;
      }
      return true;
    });

    document.getElementById('dict-count').textContent =
      `${filtered.length} of ${dictData.length} words`;

    if (filtered.length === 0) {
      list.innerHTML = `<div class="dict-empty">No words match.</div>`;
      return;
    }

    // Group by first letter
    let html = '';
    let currentLetter = '';
    filtered.forEach(entry => {
      const firstLetter = entry.display.charAt(0).toUpperCase();
      if (firstLetter !== currentLetter) {
        currentLetter = firstLetter;
        html += `<div class="dict-letter-header">${escapeHtml(currentLetter)}</div>`;
      }
      const isKnown = progress[entry.key] === 'known';
      // Build translation display: most-frequent first, comma-separated
      const sortedT = Array.from(entry.translations.entries())
        .sort((a, b) => b[1] - a[1]);
      const transHtml = sortedT.map(([t, count]) => {
        const countLabel = count > 1 ? `<span class="count">×${count}</span>` : '';
        return `${escapeHtml(t)}${countLabel}`;
      }).join(', ');

      html += `
        <div class="dict-entry ${isKnown ? 'known' : ''}" data-key="${escapeHtml(entry.key)}">
          <div class="dict-word">${escapeHtml(entry.display)}</div>
          <div class="dict-translations">${transHtml}</div>
          <button class="dict-mark" aria-label="Toggle known">${isKnown ? '✓' : '○'}</button>
        </div>`;
    });

    list.innerHTML = html;

    // Attach click handlers
    list.querySelectorAll('.dict-entry').forEach(el => {
      const key = el.dataset.key;
      el.addEventListener('click', () => {
        toggleKnownByKey(key);
        const isKnown = progress[key] === 'known';
        el.classList.toggle('known', isKnown);
        el.querySelector('.dict-mark').textContent = isKnown ? '✓' : '○';
      });
    });
  }

  function toggleKnownByKey(key) {
    if (progress[key] === 'known') {
      delete progress[key];
    } else {
      progress[key] = 'known';
    }
    saveProgress();
  }

  // ============================================================
  // SPACED REPETITION SYSTEM (SRS)
  // ============================================================

  // Intervals in milliseconds for each level
  // Level 0 = brand new, never reviewed (due immediately)
  // Level 1 = reviewed once correctly, next in 1 day
  // ... etc.
  // SRS intervals for GRADUATED cards (already learned, in long-term review)
  // Level 0 = not graduated yet (still in today's learning phase)
  // Level 1 = graduated today, comes back tomorrow
  // Level 2-6 = increasing intervals
  const SRS_INTERVALS_MS = [
    0,                          // L0: learning phase (handled separately, not by nextDue)
    1  * 24 * 60 * 60 * 1000,   // L1: 1 day
    3  * 24 * 60 * 60 * 1000,   // L2: 3 days
    7  * 24 * 60 * 60 * 1000,   // L3: 7 days
    14 * 24 * 60 * 60 * 1000,   // L4: 14 days
    30 * 24 * 60 * 60 * 1000,   // L5: 30 days
    90 * 24 * 60 * 60 * 1000,   // L6: 90 days (mastered)
  ];
  const SRS_MAX_LEVEL = SRS_INTERVALS_MS.length - 1;

  // Graduation: a NEW word needs this many correct-in-a-row in today's
  // learning phase before it graduates to the SRS (= comes back tomorrow).
  const GRADUATION_REQUIRED_STREAK = 2;

  // Re-injection delays within a session (in card-positions ahead)
  // After the user answers, where do we put the same card back in the queue?
  // TIGHTENED in v5: shorter delays so user sees the word again before forgetting it.
  // Pimsleur-style: very soon, then medium, then a bit longer.
  const LEARNING_DELAY_WRONG = 1;          // wrong → next or one after
  const LEARNING_DELAY_FIRST_CORRECT = 3;  // first correct → see it again very soon
  const LEARNING_DELAY_LATER_CORRECT = 6;  // later correct → moderate gap before final test

  // Indonesian grammatical particles and very common function words to EXCLUDE
  const TEST_EXCLUDED_WORDS = new Set([
    'yang', 'itu', 'ini', 'tadi', 'tu', 'nya',
    'di', 'ke', 'dari', 'pada', 'untuk', 'oleh', 'dengan',
    'aku', 'ku', 'mu', 'kau', 'kamu', 'engkau', 'ia', 'dia', 'kita', 'kami', 'mereka', 'kalian',
    'dan', 'atau', 'tapi', 'tetapi', 'jika', 'kalau', 'karena', 'sebab', 'maka', 'jadi', 'lalu', 'kemudian',
    'ketika', 'saat', 'sebelum', 'setelah', 'sesudah', 'sambil', 'meski', 'meskipun', 'walau', 'walaupun',
    'bahwa', 'agar', 'supaya', 'sehingga', 'hingga', 'sampai',
    'lah', 'kah', 'pun', 'tah',
    'tidak', 'tak', 'bukan', 'jangan', 'belum',
    'ya', 'sudah',
    'ada', 'akan', 'mau', 'bisa', 'dapat',
  ]);

  function isTestableWord(key) {
    if (!key) return false;
    if (key.length < 3) return false;
    if (TEST_EXCLUDED_WORDS.has(key)) return false;
    return true;
  }

  // Get all testable words with their frequency across all chapters
  function getAllTestableWordsByFrequency() {
    const freq = new Map();
    Object.values(chapters).forEach(ch => {
      (ch.tokens || []).forEach(sentence => {
        if (typeof sentence !== 'object' || !sentence || !sentence.t) return;
        sentence.t.forEach(tok => {
          if (!Array.isArray(tok)) return;
          const k = wordKey(tok[0]);
          if (!isTestableWord(k)) return;
          if (!freq.has(k)) {
            freq.set(k, { key: k, count: 0, display: tok[0].toLowerCase() });
          }
          freq.get(k).count++;
        });
      });
    });
    const arr = Array.from(freq.values());
    arr.sort((a, b) => b.count - a.count);
    return arr;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Get/create an SRS entry. New entries start with level=0 (learning phase).
  function getSrsEntry(key) {
    if (!srsData[key]) {
      srsData[key] = {
        level: 0,           // 0 = learning phase, 1-6 = graduated SRS
        streak: 0,          // consecutive correct in current learning phase
        nextDue: 0,         // when (timestamp ms) it's due again for graduated cards
        lastReviewed: 0,
        correctCount: 0,
        wrongCount: 0,
      };
    }
    return srsData[key];
  }

  // Pick up to N words for a new session.
  // Priorities:
  //  1. Words due for SRS review (graduated, level>=1, nextDue<=now) - randomized
  //  2. Words currently in learning phase (level=0, already started) - randomized
  //  3. New words (no entry yet) - by frequency
  function pickSessionWords(sessionSize = 10) {
    const now = Date.now();
    const allWords = getAllTestableWordsByFrequency();

    const dueGraduated = [];
    const inLearning = [];
    const brandNew = [];

    for (const w of allWords) {
      const e = srsData[w.key];
      if (!e) {
        brandNew.push(w);
      } else if (e.level === 0) {
        inLearning.push(w);
      } else if (e.nextDue <= now) {
        dueGraduated.push(w);
      }
    }

    const picks = [];

    // Add due graduated (shuffled) up to limit
    const shuffledDue = shuffle(dueGraduated);
    for (const w of shuffledDue) {
      if (picks.length >= sessionSize) break;
      picks.push(w.key);
    }
    // Add in-learning words (shuffled) up to limit
    const shuffledLearning = shuffle(inLearning);
    for (const w of shuffledLearning) {
      if (picks.length >= sessionSize) break;
      picks.push(w.key);
    }
    // Fill with brand new (in frequency order)
    for (const w of brandNew) {
      if (picks.length >= sessionSize) break;
      picks.push(w.key);
    }

    return picks;
  }

  // Within-session re-injection: when user answers a card during the
  // learning phase, decide where to put it back in the queue (or remove it).
  function reinjectCard(session, key, knew) {
    const entry = getSrsEntry(key);

    if (entry.level >= 1) {
      // GRADUATED card being reviewed today
      if (knew) {
        // Promote level, schedule next due far in the future
        entry.level = Math.min(entry.level + 1, SRS_MAX_LEVEL);
        entry.nextDue = Date.now() + SRS_INTERVALS_MS[entry.level];
        // Done with this card for this session
        if (entry.level >= SRS_MAX_LEVEL) {
          progress[key] = 'known';
          saveProgress();
        }
        return null; // remove from queue
      } else {
        // Demote back to learning phase
        entry.level = 0;
        entry.streak = 0;
        entry.nextDue = 0;
        // Re-inject soon
        return LEARNING_DELAY_WRONG;
      }
    } else {
      // LEARNING phase (level 0)
      if (knew) {
        entry.streak = (entry.streak || 0) + 1;
        if (entry.streak >= GRADUATION_REQUIRED_STREAK) {
          // Graduate! Move to level 1 (due tomorrow)
          entry.level = 1;
          entry.streak = 0;
          entry.nextDue = Date.now() + SRS_INTERVALS_MS[1];
          // Mark as graduated in this session
          session.graduatedKeys.add(key);
          return null; // remove from queue
        }
        // Not yet graduated - put it back, further away
        return entry.streak === 1 ? LEARNING_DELAY_FIRST_CORRECT : LEARNING_DELAY_LATER_CORRECT;
      } else {
        entry.streak = 0; // reset streak
        return LEARNING_DELAY_WRONG;
      }
    }
  }

  // ============================================================
  // TEST VIEW (vocabulary test)
  // ============================================================

  function openTestView() {
    showView('test-view');
    // If an in-memory session is mid-flight, jump straight to the card
    if (testSession && testSession.queue && testSession.queue.length > 0) {
      showCurrentCard();
    } else {
      renderTestStart();
    }
  }

  function renderTestStart() {
    document.getElementById('test-start').classList.remove('hidden');
    document.getElementById('test-card-screen').classList.add('hidden');
    document.getElementById('test-summary').classList.add('hidden');
    document.getElementById('test-progress').textContent = '';

    const now = Date.now();
    const allWords = getAllTestableWordsByFrequency();
    const dueCount = allWords.filter(w => {
      const e = srsData[w.key];
      return e && e.level >= 1 && e.nextDue <= now;
    }).length;
    const newCount = allWords.filter(w => !srsData[w.key]).length;
    const learningCount = allWords.filter(w => {
      const e = srsData[w.key];
      return e && e.level === 0;
    }).length;
    const masteredCount = allWords.filter(w => {
      const e = srsData[w.key];
      return e && e.level >= SRS_MAX_LEVEL;
    }).length;
    const reviewingCount = allWords.filter(w => {
      const e = srsData[w.key];
      return e && e.level >= 1 && e.level < SRS_MAX_LEVEL;
    }).length;

    let nextDueText = '';
    if (dueCount === 0 && newCount === 0 && learningCount === 0) {
      const future = allWords
        .map(w => srsData[w.key])
        .filter(e => e && e.level >= 1 && e.nextDue > now)
        .sort((a, b) => a.nextDue - b.nextDue);
      if (future.length > 0) {
        const nextMs = future[0].nextDue - now;
        const hours = Math.round(nextMs / (60 * 60 * 1000));
        const days = Math.round(nextMs / (24 * 60 * 60 * 1000));
        if (days >= 1) nextDueText = `Next review in ${days} day${days === 1 ? '' : 's'}.`;
        else nextDueText = `Next review in ${hours} hour${hours === 1 ? '' : 's'}.`;
      }
    }

    const totalTestable = allWords.length;
    const nothingToReview = dueCount === 0 && newCount === 0 && learningCount === 0;

    document.getElementById('test-status-info').innerHTML = `
      <span class="stat-line"><b>${dueCount}</b> word${dueCount === 1 ? '' : 's'} due for review</span>
      <span class="stat-line"><b>${learningCount}</b> currently learning (in progress)</span>
      <span class="stat-line"><b>${newCount}</b> new word${newCount === 1 ? '' : 's'} ready to learn</span>
      <span class="stat-line"><b>${reviewingCount}</b> reviewing · <b>${masteredCount}</b> mastered · <b>${totalTestable}</b> total</span>
      ${nextDueText ? `<span class="stat-line" style="margin-top:0.5rem">${nextDueText}</span>` : ''}
    `;

    // Check for resumable session
    const stored = loadActiveSession();
    const resumeContainer = document.getElementById('test-resume-container');
    if (stored && stored.queue && stored.queue.length > 0) {
      const remaining = stored.queue.length;
      const total = stored.initialWords.length;
      const graduated = stored.graduatedKeys.size;
      resumeContainer.innerHTML = `
        <div class="resume-info">
          You have an unfinished session: <b>${graduated} / ${total}</b> graduated,
          <b>${remaining}</b> card${remaining === 1 ? '' : 's'} left in the queue.
        </div>
        <button id="test-resume-btn" class="action-btn primary big-btn">Continue session</button>
        <button id="test-discard-btn" class="action-btn small">Start fresh instead</button>
      `;
      resumeContainer.classList.remove('hidden');
      document.getElementById('test-size-choices').classList.add('hidden');
      // Wire up new buttons
      document.getElementById('test-resume-btn').addEventListener('click', () => {
        testSession = stored;
        showCurrentCard();
      });
      document.getElementById('test-discard-btn').addEventListener('click', () => {
        clearActiveSession();
        renderTestStart();
      });
    } else {
      resumeContainer.innerHTML = '';
      resumeContainer.classList.add('hidden');
      document.getElementById('test-size-choices').classList.remove('hidden');
      // Configure size buttons
      const sizeButtons = document.querySelectorAll('.test-size-btn');
      sizeButtons.forEach(btn => {
        if (nothingToReview) {
          btn.disabled = true;
          btn.style.opacity = '0.4';
          btn.style.cursor = 'not-allowed';
        } else {
          btn.disabled = false;
          btn.style.opacity = '';
          btn.style.cursor = '';
        }
      });
      if (nothingToReview) {
        document.getElementById('test-nothing-msg').classList.remove('hidden');
      } else {
        document.getElementById('test-nothing-msg').classList.add('hidden');
      }
    }
  }

  // Begin a new session.
  // mode = 'auto' (default): pick new/due words
  // mode = 'repeat': use the same word set as last session (today's words again)
  // size = number of unique words to start with (default 10)
  function beginTestSession(mode, size) {
    const sessionSize = size || 10;
    let initialWords;
    if (mode === 'repeat' && testSession && testSession.initialWords && testSession.initialWords.length > 0) {
      // Reset learning state for these words so user can practice them again
      initialWords = testSession.initialWords.slice();
      for (const k of initialWords) {
        const e = srsData[k];
        if (e) {
          e.streak = 0;
          // If it had graduated (level 1), demote to learning so it'll be repeated
          if (e.level === 1) {
            e.level = 0;
            e.nextDue = 0;
          }
        }
      }
      saveSRS();
    } else {
      initialWords = pickSessionWords(sessionSize);
    }

    if (initialWords.length === 0) {
      toast('No words to test. Read more first!');
      return;
    }

    // Count how many of these are brand new (never seen) BEFORE creating entries
    let newWordsAdded = 0;
    for (const k of initialWords) {
      if (!srsData[k]) newWordsAdded++;
      // Initialize entries for new words
      getSrsEntry(k);
    }
    saveSRS();

    testSession = {
      initialWords: initialWords.slice(),  // The N we started with (preserved)
      queue: shuffle(initialWords.slice()),// Working queue, gets re-injected
      currentIdx: 0,
      results: [],                          // every answer in order
      uniqueAnswered: new Set(),           // unique keys reviewed
      totalCorrect: 0,
      totalAnswers: 0,
      newWords: newWordsAdded,
      graduatedKeys: new Set(),            // keys graduated this session
      startedAt: Date.now(),
    };
    saveActiveSession();
    showCurrentCard();
  }

  function showCurrentCard() {
    if (!testSession) return;
    const idx = testSession.currentIdx;
    if (idx >= testSession.queue.length) {
      showTestSummary();
      return;
    }

    document.getElementById('test-start').classList.add('hidden');
    document.getElementById('test-summary').classList.add('hidden');
    document.getElementById('test-card-screen').classList.remove('hidden');

    // Progress: how many UNIQUE words have graduated/completed out of initial 10
    const completed = testSession.graduatedKeys.size;
    const total = testSession.initialWords.length;
    document.getElementById('test-progress').textContent =
      `${completed} / ${total} learned`;

    const key = testSession.queue[idx];
    const entry = findDictEntryByKey(key);

    const card = document.getElementById('test-card');
    card.classList.remove('revealed');
    document.getElementById('test-card-back').classList.add('hidden');
    document.getElementById('test-actions').classList.add('hidden');
    card.querySelector('.test-card-front').style.display = '';

    document.getElementById('test-word-id').textContent = entry ? entry.display : key;
    document.getElementById('test-word-id-small').textContent = entry ? entry.display : key;

    if (entry) {
      const sortedT = Array.from(entry.translations.entries()).sort((a, b) => b[1] - a[1]);
      const transHtml = sortedT.map(([t, count]) => {
        const countLabel = count > 1 ? `<span class="count">×${count}</span>` : '';
        return `${escapeHtml(t)}${countLabel}`;
      }).join(', ');
      document.getElementById('test-translations').innerHTML = transHtml;
    } else {
      document.getElementById('test-translations').textContent = '—';
    }
  }

  function findDictEntryByKey(key) {
    if (!dictData || dictData.length === 0) {
      dictData = buildDictionary();
    }
    return dictData.find(e => e.key === key);
  }

  function revealCard() {
    const card = document.getElementById('test-card');
    if (card.classList.contains('revealed')) return;
    card.classList.add('revealed');
    document.getElementById('test-card-back').classList.remove('hidden');
    document.getElementById('test-actions').classList.remove('hidden');
    card.querySelector('.test-card-front').style.display = 'none';
  }

  function answerCard(knew) {
    if (!testSession) return;
    const idx = testSession.currentIdx;
    if (idx >= testSession.queue.length) return;

    const key = testSession.queue[idx];
    const entry = getSrsEntry(key);
    entry.lastReviewed = Date.now();
    if (knew) entry.correctCount++;
    else entry.wrongCount++;

    testSession.uniqueAnswered.add(key);
    testSession.totalAnswers++;
    if (knew) testSession.totalCorrect++;
    testSession.results.push({ key, knew, time: Date.now() });

    const delay = reinjectCard(testSession, key, knew);

    // Remove current card from queue
    testSession.queue.splice(idx, 1);

    if (delay !== null) {
      // Re-insert further down
      const insertAt = Math.min(idx + delay, testSession.queue.length);
      testSession.queue.splice(insertAt, 0, key);
    }

    saveSRS();
    saveActiveSession();

    // currentIdx stays the same (we removed the current one; next card slides into idx)
    setTimeout(() => showCurrentCard(), 200);
  }

  function showTestSummary() {
    document.getElementById('test-card-screen').classList.add('hidden');
    document.getElementById('test-summary').classList.remove('hidden');
    document.getElementById('test-progress').textContent = '';
    // Session reached its end (queue empty) — clear the persisted state
    clearActiveSession();

    const totalAnswers = testSession.totalAnswers;
    const correct = testSession.totalCorrect;
    const wrong = totalAnswers - correct;
    const pct = totalAnswers > 0 ? Math.round((correct / totalAnswers) * 100) : 0;

    const graduatedCount = testSession.graduatedKeys.size;
    const totalInitial = testSession.initialWords.length;
    const allGraduated = graduatedCount >= totalInitial;

    document.getElementById('test-summary-stats').innerHTML = `
      <span class="big-num">${graduatedCount} / ${totalInitial}</span>
      <span class="label">words learned today</span>
      <div class="row">
        <div>
          <span class="big-num" style="font-size:1.8rem">${totalAnswers}</span>
          <span class="label">cards answered (${pct}% correct)</span>
        </div>
        <div>
          <span class="big-num" style="font-size:1.8rem">${testSession.newWords}</span>
          <span class="label">new words introduced</span>
        </div>
      </div>
      ${allGraduated
        ? `<div style="margin-top:1rem;color:var(--success);font-style:italic">✦ All ${totalInitial} words graduated! Come back tomorrow to review them.</div>`
        : `<div style="margin-top:1rem;color:var(--ink-soft);font-style:italic">${totalInitial - graduatedCount} word${totalInitial - graduatedCount === 1 ? ' is' : 's are'} still in learning. Continue this session to graduate them.</div>`
      }
    `;

    // Configure summary buttons based on session state
    const restartBtn = document.getElementById('test-restart-btn');
    const finishBtn = document.getElementById('test-finish-btn');
    const repeatBtn = document.getElementById('test-repeat-btn');

    if (allGraduated) {
      // All words graduated → main option is to repeat them, secondary is new session
      restartBtn.textContent = 'Start new session';
      restartBtn.classList.remove('primary');
      restartBtn.classList.add('action-btn');
      if (repeatBtn) {
        repeatBtn.style.display = '';
        repeatBtn.classList.add('primary');
      }
    } else {
      // Some still in learning → main option is continue (which is restart with same)
      restartBtn.textContent = "Continue with today's words";
      restartBtn.classList.add('primary');
      if (repeatBtn) {
        repeatBtn.style.display = 'none';
      }
    }
  }

  // ============================================================
  // STATS MODAL
  // ============================================================

  function showStats() {
    const totalKnown = Object.values(progress).filter(v => v === 'known').length;
    const totalUnique = new Set();
    Object.values(chapters).forEach(ch => {
      (ch.tokens || []).forEach(sentence => {
        if (typeof sentence !== 'object' || !sentence.t) return;
        sentence.t.forEach(tok => {
          if (Array.isArray(tok)) totalUnique.add(wordKey(tok[0]));
        });
      });
    });
    const totalChapters = Object.keys(chapters).length;
    const pct = totalUnique.size > 0 ? Math.round((totalKnown / totalUnique.size) * 100) : 0;

    document.getElementById('stats-content').innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${totalChapters}</div>
          <div class="stat-label">chapters available</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${totalUnique.size}</div>
          <div class="stat-label">unique words</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${totalKnown}</div>
          <div class="stat-label">marked as known</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${pct}%</div>
          <div class="stat-label">overall progress</div>
        </div>
      </div>
    `;
    document.getElementById('stats-modal').classList.remove('hidden');
  }

  // ============================================================
  // VIEW MANAGEMENT
  // ============================================================

  function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(viewId).classList.remove('hidden');
    if (viewId === 'library-view') {
      renderLibrary();
      saveLastView('library');
    } else if (viewId === 'dict-view') {
      saveLastView('dict');
    } else if (viewId === 'test-view') {
      saveLastView('test');
    } else if (viewId === 'reader-view') {
      saveLastView('reader', { chapterId: currentChapter && currentChapter.id });
    }
  }

  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.classList.add('hidden'), 300);
    }, 1800);
  }

  // ============================================================
  // EVENT BINDINGS
  // ============================================================

  document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-input').click();
  });
  document.getElementById('import-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleImport(file);
    e.target.value = '';
  });
  document.getElementById('stats-btn').addEventListener('click', showStats);
  document.getElementById('dict-btn').addEventListener('click', openDictionary);
  document.getElementById('dict-back-btn').addEventListener('click', () => {
    showView('library-view');
  });
  document.getElementById('dict-search').addEventListener('input', (e) => {
    dictSearchTerm = e.target.value;
    renderDictionary();
  });
  document.querySelectorAll('input[name="dict-filter"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      dictFilter = e.target.value;
      renderDictionary();
    });
  });

  // Test view bindings
  document.getElementById('test-start-btn').addEventListener('click', openTestView);
  document.getElementById('test-back-btn').addEventListener('click', () => {
    // Don't drop testSession here — it might be in progress and resumable later.
    // Just navigate away. Active session is already persisted in localStorage.
    showView('dict-view');
  });
  // Size choice buttons — replace the single "start" button
  document.querySelectorAll('.test-size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const size = parseInt(btn.dataset.size, 10) || 10;
      beginTestSession('auto', size);
    });
  });
  document.getElementById('test-card').addEventListener('click', revealCard);
  document.getElementById('test-right-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    answerCard(true);
  });
  document.getElementById('test-wrong-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    answerCard(false);
  });
  document.getElementById('test-restart-btn').addEventListener('click', () => {
    // If some words from current session are not yet graduated, continue with same.
    // Otherwise start a fresh session with the same size as before.
    if (testSession) {
      const graduated = testSession.graduatedKeys.size;
      const total = testSession.initialWords.length;
      if (graduated < total) {
        beginTestSession('repeat', total);
        return;
      }
      beginTestSession('auto', total);
      return;
    }
    beginTestSession('auto', 10);
  });
  document.getElementById('test-repeat-btn').addEventListener('click', () => {
    const size = (testSession && testSession.initialWords.length) || 10;
    beginTestSession('repeat', size);
  });
  document.getElementById('test-finish-btn').addEventListener('click', () => {
    testSession = null;
    clearActiveSession();
    showView('dict-view');
  });

  document.getElementById('reset-btn').addEventListener('click', () => {
    if (confirm('Really delete all progress? (Chapters will be kept.)')) {
      progress = {};
      srsData = {};
      testSession = null;
      saveProgress();
      saveSRS();
      clearActiveSession();
      toast('Progress reset');
      renderLibrary();
    }
  });
  document.getElementById('back-btn').addEventListener('click', () => {
    if (activeWordUnit) {
      activeWordUnit.classList.remove('visible');
      activeWordUnit.querySelector('.word').classList.remove('active');
      activeWordUnit = null;
    }
    hideSentence();
    showView('library-view');
  });
  document.getElementById('settings-btn').addEventListener('click', () => {
    document.getElementById('setting-dim-known').checked = settings.dimKnown;
    document.getElementById('setting-fontsize').value = settings.fontSize;
    document.getElementById('settings-modal').classList.remove('hidden');
  });
  document.getElementById('setting-dim-known').addEventListener('change', (e) => {
    settings.dimKnown = e.target.checked;
    saveSettings();
    applyKnownStyling();
  });
  document.getElementById('setting-fontsize').addEventListener('input', (e) => {
    settings.fontSize = parseInt(e.target.value, 10);
    document.documentElement.style.setProperty('--base-font-size', settings.fontSize + 'px');
    saveSettings();
  });
  document.getElementById('reset-chapter-btn').addEventListener('click', () => {
    if (!currentChapter) return;
    if (confirm('Reset progress for this chapter?')) {
      const keysInChapter = new Set();
      (currentChapter.tokens || []).forEach(s => {
        if (typeof s !== 'object' || !s.t) return;
        s.t.forEach(tok => {
          if (Array.isArray(tok)) keysInChapter.add(wordKey(tok[0]));
        });
      });
      keysInChapter.forEach(k => delete progress[k]);
      saveProgress();
      applyKnownStyling();
      toast('Progress reset');
    }
  });
  document.getElementById('close-sentence').addEventListener('click', hideSentence);

  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.target.closest('.modal').classList.add('hidden');
    });
  });
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  });

  // Click on empty space (in story) closes active translation
  document.getElementById('story').addEventListener('click', (e) => {
    if (!e.target.closest('.word-unit') && activeWordUnit) {
      activeWordUnit.classList.remove('visible');
      activeWordUnit.querySelector('.word').classList.remove('active');
      activeWordUnit = null;
    }
  });

  // ============================================================
  // INIT
  // ============================================================

  async function init() {
    loadFromStorage();
    await loadBuiltinChapters();
    // Restore last view if it makes sense
    if (lastView && lastView.view) {
      if (lastView.view === 'reader' && lastView.chapterId && chapters[lastView.chapterId]) {
        openChapter(lastView.chapterId);
        return;
      }
      if (lastView.view === 'dict') {
        openDictionary();
        return;
      }
      if (lastView.view === 'test') {
        // If a saved session exists, restore it into memory so the test view
        // jumps straight to the current card rather than the start screen.
        const stored = loadActiveSession();
        if (stored && stored.queue && stored.queue.length > 0) {
          testSession = stored;
        }
        openTestView();
        return;
      }
    }
    showView('library-view');
  }

  init();

})();

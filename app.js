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
  document.getElementById('reset-btn').addEventListener('click', () => {
    if (confirm('Really delete all progress? (Chapters will be kept.)')) {
      progress = {};
      saveProgress();
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
    showView('library-view');
  }

  init();

})();

/* ── State ─────────────────────────────────────────────── */
let decks = [];          // [{ id, name, emoji, cards: [{q,a}] }]
let activeDeckId = null; // deck open in Study tab
let studyIndex = 0;
let studyOrder = [];
let quizDeckId = null;
let quizQuestions = [];
let quizIndex = 0;
let quizCorrect = 0;
let quizMode = 'choice'; // 'choice' | 'tf'
let exportFmt = 'json';

/* ── Storage ───────────────────────────────────────────── */
function save() {
  chrome.storage.local.set({ flashdecks: decks });
}

function load(cb) {
  chrome.storage.local.get('flashdecks', (r) => {
    decks = r.flashdecks || [];
    cb();
  });
}

/* ── Utils ─────────────────────────────────────────────── */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getDeck(id) {
  return decks.find(d => d.id === id);
}

let toastTimer;
function toast(msg, duration = 2200) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

/* ── Tab switching ─────────────────────────────────────── */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'study') renderStudyDeckPicker();
    if (btn.dataset.tab === 'quiz') renderQuizDeckPicker();
    if (btn.dataset.tab === 'import') renderExportSelect();
  });
});

/* ── Segmented control (Import/Export) ─────────────────── */
document.querySelectorAll('.seg-btn[data-seg]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.seg-btn[data-seg]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('seg-import').style.display = btn.dataset.seg === 'import' ? '' : 'none';
    document.getElementById('seg-export').style.display = btn.dataset.seg === 'export' ? '' : 'none';
    if (btn.dataset.seg === 'export') renderExportSelect();
  });
});

/* ── Quiz mode segmented ───────────────────────────────── */
document.querySelectorAll('.seg-btn[data-quiz-mode]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.seg-btn[data-quiz-mode]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    quizMode = btn.dataset.quizMode;
  });
});

/* ── Export format segmented ───────────────────────────── */
document.querySelectorAll('.seg-btn[data-export-fmt]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.seg-btn[data-export-fmt]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    exportFmt = btn.dataset.exportFmt;
  });
});

/* ══════════════════════════════════════════════════════════
   DECKS TAB
   ══════════════════════════════════════════════════════════ */
document.getElementById('create-deck-btn').addEventListener('click', () => {
  const name = document.getElementById('deck-name-input').value.trim();
  if (!name) { toast('Enter a deck name'); return; }
  const emoji = document.getElementById('deck-emoji-input').value.trim() || '📖';
  decks.push({ id: uid(), name, emoji, cards: [] });
  save();
  document.getElementById('deck-name-input').value = '';
  document.getElementById('deck-emoji-input').value = '';
  renderDeckList();
  toast('Deck created ✓');
});

function renderDeckList() {
  const inner = document.getElementById('deck-list-inner');
  if (!decks.length) {
    inner.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>No decks yet.<br>Create one above or import a file.</p></div>`;
    return;
  }
  inner.innerHTML = decks.map(d => `
    <div class="deck-item" data-id="${d.id}">
      <div class="deck-emoji">${d.emoji}</div>
      <div class="deck-info">
        <div class="deck-name">${esc(d.name)}</div>
        <div class="deck-count">${d.cards.length} card${d.cards.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="deck-actions" onclick="event.stopPropagation()">
        <button class="icon-btn" title="Study" onclick="openStudy('${d.id}')">🃏</button>
        <button class="icon-btn" title="Quiz" onclick="openQuiz('${d.id}')">✏️</button>
        <button class="icon-btn" title="Delete" onclick="deleteDeck('${d.id}')">🗑️</button>
      </div>
    </div>
  `).join('');
  updateHeaderSubtitle();
}

function deleteDeck(id) {
  if (!confirm('Delete this deck?')) return;
  decks = decks.filter(d => d.id !== id);
  save();
  renderDeckList();
  toast('Deck deleted');
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function updateHeaderSubtitle() {
  const total = decks.reduce((s, d) => s + d.cards.length, 0);
  document.getElementById('header-subtitle').textContent =
    `${decks.length} deck${decks.length !== 1 ? 's' : ''} · ${total} card${total !== 1 ? 's' : ''}`;
}

/* ══════════════════════════════════════════════════════════
   STUDY TAB
   ══════════════════════════════════════════════════════════ */
function renderStudyDeckPicker() {
  const el = document.getElementById('study-deck-list');
  if (!decks.length) {
    el.innerHTML = `<div class="empty-state" style="padding:16px"><p>No decks available.</p></div>`;
    return;
  }
  el.innerHTML = decks.map(d => `
    <div class="deck-item" style="cursor:pointer" onclick="openStudy('${d.id}')">
      <div class="deck-emoji">${d.emoji}</div>
      <div class="deck-info">
        <div class="deck-name">${esc(d.name)}</div>
        <div class="deck-count">${d.cards.length} cards</div>
      </div>
      <span style="color:var(--blue);font-size:13px;font-weight:600">Study →</span>
    </div>
  `).join('');
}

function openStudy(deckId) {
  // Switch to study tab first
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelector('[data-tab="study"]').classList.add('active');
  document.getElementById('panel-study').classList.add('active');

  activeDeckId = deckId;
  const deck = getDeck(deckId);
  if (!deck || !deck.cards.length) {
    toast('This deck has no cards yet');
    document.getElementById('study-area').style.display = 'none';
    document.getElementById('study-deck-picker').style.display = '';
    return;
  }
  document.getElementById('study-deck-picker').style.display = 'none';
  document.getElementById('study-area').style.display = '';
  studyOrder = deck.cards.map((_, i) => i);
  studyIndex = 0;
  showStudyCard();
  renderCardList();
}

function showStudyCard() {
  const deck = getDeck(activeDeckId);
  if (!deck) return;
  const card = deck.cards[studyOrder[studyIndex]];
  document.getElementById('card-front-text').textContent = card.q;
  document.getElementById('card-back-text').textContent = card.a;
  document.getElementById('flashcard').classList.remove('flipped');
  const total = studyOrder.length;
  document.getElementById('study-counter').textContent = `${studyIndex + 1} / ${total}`;
  document.getElementById('study-progress').style.width = `${((studyIndex + 1) / total) * 100}%`;
}

window.flipCard = function () {
  document.getElementById('flashcard').classList.toggle('flipped');
};

document.getElementById('study-prev').addEventListener('click', () => {
  if (studyIndex > 0) { studyIndex--; showStudyCard(); }
});
document.getElementById('study-next').addEventListener('click', () => {
  const deck = getDeck(activeDeckId);
  if (deck && studyIndex < studyOrder.length - 1) { studyIndex++; showStudyCard(); }
});
document.getElementById('study-shuffle').addEventListener('click', () => {
  studyOrder = shuffle(studyOrder);
  studyIndex = 0;
  showStudyCard();
  toast('Shuffled 🔀');
});

/* keyboard nav inside study */
document.addEventListener('keydown', (e) => {
  if (!document.querySelector('[data-tab="study"].active')) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') document.getElementById('study-next').click();
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') document.getElementById('study-prev').click();
  if (e.key === ' ') { e.preventDefault(); flipCard(); }
});

/* Add card */
document.getElementById('add-card-btn').addEventListener('click', () => {
  const q = document.getElementById('add-q').value.trim();
  const a = document.getElementById('add-a').value.trim();
  if (!q || !a) { toast('Fill in both fields'); return; }
  const deck = getDeck(activeDeckId);
  if (!deck) return;
  deck.cards.push({ q, a });
  save();
  document.getElementById('add-q').value = '';
  document.getElementById('add-a').value = '';
  studyOrder = deck.cards.map((_, i) => i);
  renderCardList();
  showStudyCard();
  toast('Card added ✓');
});

function renderCardList() {
  const deck = getDeck(activeDeckId);
  if (!deck) return;
  const inner = document.getElementById('card-list-inner');
  if (!deck.cards.length) {
    inner.innerHTML = `<div style="padding:12px 16px;color:var(--label3);font-size:13px">No cards yet.</div>`;
    return;
  }
  inner.innerHTML = deck.cards.map((c, i) => `
    <div class="card-row" id="card-row-${i}">
      <div class="card-row-num">${i + 1}</div>
      <div class="card-row-content">
        <div class="card-row-q">${esc(c.q)}</div>
        <div class="card-row-a">${esc(c.a)}</div>
      </div>
      <button class="card-row-del" onclick="editCard(${i})" title="Edit">✏️</button>
      <button class="card-row-del" onclick="deleteCard(${i})" title="Delete">✕</button>
    </div>
  `).join('');
}

window.editCard = function (idx) {
  const deck = getDeck(activeDeckId);
  if (!deck) return;
  const c = deck.cards[idx];
  const row = document.getElementById('card-row-' + idx);
  if (!row) return;
  row.innerHTML = `
    <div class="card-row-num">${idx + 1}</div>
    <div class="card-row-content">
      <input type="text" id="edit-q-${idx}" value="${esc(c.q)}" style="margin-bottom:6px">
      <textarea id="edit-a-${idx}" style="min-height:50px">${esc(c.a)}</textarea>
      <div class="btn-row" style="margin-top:6px">
        <button class="btn btn-green btn-sm" onclick="saveCard(${idx})">Save</button>
        <button class="btn btn-ghost btn-sm" onclick="renderCardList()">Cancel</button>
      </div>
    </div>
  `;
};

window.saveCard = function (idx) {
  const deck = getDeck(activeDeckId);
  if (!deck) return;
  const q = document.getElementById('edit-q-' + idx).value.trim();
  const a = document.getElementById('edit-a-' + idx).value.trim();
  if (!q || !a) { toast('Both fields required'); return; }
  deck.cards[idx] = { q, a };
  save();
  renderCardList();
  showStudyCard();
  toast('Card updated ✓');
};

window.deleteCard = function (idx) {
  const deck = getDeck(activeDeckId);
  if (!deck) return;
  deck.cards.splice(idx, 1);
  save();
  studyOrder = deck.cards.map((_, i) => i);
  if (studyIndex >= studyOrder.length) studyIndex = Math.max(0, studyOrder.length - 1);
  if (deck.cards.length) showStudyCard();
  renderCardList();
};

/* ══════════════════════════════════════════════════════════
   QUIZ TAB
   ══════════════════════════════════════════════════════════ */
function renderQuizDeckPicker() {
  const el = document.getElementById('quiz-deck-list');
  if (!decks.length) {
    el.innerHTML = `<div class="empty-state" style="padding:16px"><p>No decks available.</p></div>`;
    return;
  }
  el.innerHTML = decks.map(d => `
    <div class="deck-item" style="cursor:pointer" onclick="openQuiz('${d.id}')">
      <div class="deck-emoji">${d.emoji}</div>
      <div class="deck-info">
        <div class="deck-name">${esc(d.name)}</div>
        <div class="deck-count">${d.cards.length} cards</div>
      </div>
      <span style="color:var(--blue);font-size:13px;font-weight:600">Quiz →</span>
    </div>
  `).join('');
}

function openQuiz(deckId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelector('[data-tab="quiz"]').classList.add('active');
  document.getElementById('panel-quiz').classList.add('active');

  const deck = getDeck(deckId);
  if (!deck || deck.cards.length < 2) { toast('Need at least 2 cards for quiz'); return; }
  quizDeckId = deckId;
  startQuiz();
}

function startQuiz() {
  const deck = getDeck(quizDeckId);
  if (quizMode === 'tf') {
    quizQuestions = shuffle(deck.cards).map((card, i) => {
      // 50/50 show the real answer or a wrong one from another card
      const isTrue = Math.random() < 0.5;
      let shown = card.a;
      if (!isTrue) {
        const others = deck.cards.filter(c => c.a !== card.a);
        if (others.length) shown = shuffle(others)[0].a;
        else return { mode: 'tf', q: card.q, shown: card.a, answerTrue: true };
      }
      return { mode: 'tf', q: card.q, shown, answerTrue: shown === card.a };
    });
  } else {
    quizQuestions = shuffle(deck.cards).map((card, i) => {
      const wrongPool = deck.cards.filter((_, j) => j !== deck.cards.indexOf(card));
      const wrongs = shuffle(wrongPool).slice(0, 3).map(c => c.a);
      const options = shuffle([card.a, ...wrongs]);
      return { mode: 'choice', q: card.q, correct: card.a, options };
    });
  }
  quizIndex = 0;
  quizCorrect = 0;
  document.getElementById('quiz-deck-picker').style.display = 'none';
  document.getElementById('quiz-area').style.display = '';
  document.getElementById('quiz-results').style.display = 'none';
  showQuizQuestion();
}

function showQuizQuestion() {
  const q = quizQuestions[quizIndex];
  const total = quizQuestions.length;
  document.getElementById('quiz-counter').textContent = `${quizIndex + 1} / ${total}`;
  document.getElementById('quiz-progress').style.width = `${((quizIndex + 1) / total) * 100}%`;

  const optEl = document.getElementById('quiz-options');
  if (q.mode === 'tf') {
    document.getElementById('quiz-question-text').innerHTML =
      `${esc(q.q)}<div style="margin-top:12px;font-size:13px;font-weight:600;color:var(--label3)">Answer shown:</div>` +
      `<div style="margin-top:4px;font-size:15px;color:var(--blue)">"${esc(q.shown)}"</div>`;
    optEl.innerHTML = `
      <button class="quiz-option" style="text-align:center;font-weight:600" onclick="answerTF(this, true)">✅ True</button>
      <button class="quiz-option" style="text-align:center;font-weight:600" onclick="answerTF(this, false)">❌ False</button>
    `;
  } else {
    document.getElementById('quiz-question-text').textContent = q.q;
    optEl.innerHTML = q.options.map(opt => `
      <button class="quiz-option" onclick="answerQuiz(this, '${esc(opt)}', '${esc(q.correct)}')">${esc(opt)}</button>
    `).join('');
  }
}

window.answerTF = function (btn, chosen) {
  const q = quizQuestions[quizIndex];
  const opts = document.querySelectorAll('.quiz-option');
  opts.forEach(o => o.disabled = true);
  const correct = chosen === q.answerTrue;
  if (correct) { btn.classList.add('correct'); quizCorrect++; }
  else {
    btn.classList.add('wrong');
    // highlight the correct button
    opts[q.answerTrue ? 0 : 1].classList.add('correct');
  }
  setTimeout(() => {
    quizIndex++;
    if (quizIndex >= quizQuestions.length) showQuizResults();
    else showQuizQuestion();
  }, 900);
};

window.answerQuiz = function (btn, chosen, correct) {
  const opts = document.querySelectorAll('.quiz-option');
  opts.forEach(o => {
    o.disabled = true;
    if (o.textContent === correct) o.classList.add('correct');
  });
  if (chosen === correct) {
    btn.classList.add('correct');
    quizCorrect++;
  } else {
    btn.classList.add('wrong');
  }
  setTimeout(() => {
    quizIndex++;
    if (quizIndex >= quizQuestions.length) showQuizResults();
    else showQuizQuestion();
  }, 900);
};

function showQuizResults() {
  document.getElementById('quiz-area').style.display = 'none';
  document.getElementById('quiz-results').style.display = '';
  const total = quizQuestions.length;
  const pct = Math.round((quizCorrect / total) * 100);
  document.getElementById('score-pct').textContent = pct + '%';
  document.getElementById('score-correct').textContent = quizCorrect;
  document.getElementById('score-wrong').textContent = total - quizCorrect;
  document.getElementById('score-total').textContent = total;
  // Animate ring
  const circumference = 276.46;
  const offset = circumference - (pct / 100) * circumference;
  const circle = document.getElementById('score-circle');
  circle.style.transition = 'stroke-dashoffset 0.8s ease';
  circle.style.stroke = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--orange)' : 'var(--red)';
  requestAnimationFrame(() => { circle.style.strokeDashoffset = offset; });
}

document.getElementById('quiz-retry-btn').addEventListener('click', () => {
  document.getElementById('quiz-results').style.display = 'none';
  document.getElementById('quiz-area').style.display = '';
  startQuiz();
});
document.getElementById('quiz-back-btn').addEventListener('click', () => {
  document.getElementById('quiz-results').style.display = 'none';
  document.getElementById('quiz-deck-picker').style.display = '';
  renderQuizDeckPicker();
});

/* ══════════════════════════════════════════════════════════
   IMPORT TAB
   ══════════════════════════════════════════════════════════ */

/* Drag & drop */
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

function handleFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const ext = file.name.split('.').pop().toLowerCase();
    let deckName = file.name.replace(/\.[^.]+$/, '');
    if (ext === 'json') {
      importJSON(text);
    } else {
      document.getElementById('csv-paste').value = text;
      if (!document.getElementById('import-deck-name').value)
        document.getElementById('import-deck-name').value = deckName;
      toast('File loaded — click Import Cards');
    }
  };
  reader.readAsText(file);
}

function importJSON(text) {
  try {
    const data = JSON.parse(text);
    // Support: single deck object, array of decks, or array of {q,a} cards
    if (Array.isArray(data)) {
      if (data[0] && data[0].cards) {
        // Array of deck objects
        data.forEach(d => {
          if (!d.name || !Array.isArray(d.cards)) return;
          decks.push({ id: uid(), name: d.name, emoji: d.emoji || '📖', cards: d.cards });
        });
        save(); renderDeckList();
        toast(`Imported ${data.length} deck(s) ✓`);
      } else if (data[0] && (data[0].q || data[0].question)) {
        // Array of cards
        const cards = data.map(c => ({ q: c.q || c.question || '', a: c.a || c.answer || '' }));
        const name = document.getElementById('import-deck-name').value.trim() || 'Imported Deck';
        decks.push({ id: uid(), name, emoji: '📥', cards });
        save(); renderDeckList();
        toast(`Imported ${cards.length} cards ✓`);
      }
    } else if (data.name && data.cards) {
      decks.push({ id: uid(), name: data.name, emoji: data.emoji || '📖', cards: data.cards });
      save(); renderDeckList();
      toast(`Imported "${data.name}" ✓`);
    } else {
      toast('Unrecognized JSON format');
    }
  } catch {
    toast('Invalid JSON file');
  }
}

document.getElementById('parse-csv-btn').addEventListener('click', () => {
  const raw = document.getElementById('csv-paste').value.trim();
  if (!raw) { toast('Paste some data first'); return; }
  const sep = document.getElementById('csv-sep').value;
  const deckName = document.getElementById('import-deck-name').value.trim() || 'Imported Deck';
  const cards = parseCSV(raw, sep);
  if (!cards.length) { toast('No cards found — check separator'); return; }
  decks.push({ id: uid(), name: deckName, emoji: '📥', cards });
  save();
  renderDeckList();
  document.getElementById('csv-paste').value = '';
  document.getElementById('import-deck-name').value = '';
  toast(`Imported ${cards.length} card(s) ✓`);
});

function parseCSV(text, sep) {
  const cards = [];
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  for (const line of lines) {
    const parts = line.split(sep);
    if (parts.length < 2) continue;
    const q = parts[0].trim().replace(/^["']|["']$/g, '');
    const a = parts.slice(1).join(sep).trim().replace(/^["']|["']$/g, '');
    if (q && a) cards.push({ q, a });
  }
  return cards;
}

/* ── Export ─────────────────────────────────────────────── */
function renderExportSelect() {
  const sel = document.getElementById('export-deck-select');
  if (!decks.length) {
    sel.innerHTML = '<option>No decks</option>';
    return;
  }
  sel.innerHTML = decks.map(d => `<option value="${d.id}">${d.emoji} ${d.name}</option>`).join('');
}

function getExportData(deck) {
  if (exportFmt === 'json') {
    return JSON.stringify({ name: deck.name, emoji: deck.emoji, cards: deck.cards }, null, 2);
  } else {
    const rows = deck.cards.map(c => `"${c.q.replace(/"/g,'""')}","${c.a.replace(/"/g,'""')}"`);
    return 'Question,Answer\n' + rows.join('\n');
  }
}

function downloadText(content, filename) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('export-download-btn').addEventListener('click', () => {
  const id = document.getElementById('export-deck-select').value;
  const deck = getDeck(id);
  if (!deck) { toast('No deck selected'); return; }
  const ext = exportFmt === 'json' ? 'json' : 'csv';
  downloadText(getExportData(deck), `${deck.name}.${ext}`);
  toast('Downloaded ✓');
});

document.getElementById('export-copy-btn').addEventListener('click', async () => {
  const id = document.getElementById('export-deck-select').value;
  const deck = getDeck(id);
  if (!deck) { toast('No deck selected'); return; }
  await navigator.clipboard.writeText(getExportData(deck));
  toast('Copied to clipboard ✓');
});

document.getElementById('export-all-btn').addEventListener('click', () => {
  if (!decks.length) { toast('No decks to export'); return; }
  downloadText(JSON.stringify(decks, null, 2), 'flashdeck-all.json');
  toast('All decks downloaded ✓');
});

/* ══════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════ */
load(() => {
  renderDeckList();
  updateHeaderSubtitle();
});

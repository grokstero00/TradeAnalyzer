/*
 * CCNA exam simulator — engine and UI.
 * Data comes from CCNA.days (see registry.js and days/*.js).
 * Progress, history and imported days are kept in localStorage.
 */
(function () {
  'use strict';

  const CCNA = window.CCNA;
  const R = CCNA.rng;
  const STORE_KEY = 'ccna-exam-sim:v1';
  const LETTERS = 'ABCDEFGHIJ';
  const CHOOSE = { 2: 'two', 3: 'three', 4: 'four', 5: 'five' };
  const GEN_PER_GENERATOR = 2;
  const HISTORY_LIMIT = 30;

  // ---------------------------------------------------------------- storage

  function defaults() {
    return {
      settings: {
        mode: 'exam',
        days: [],
        count: 50,
        minutesPerQ: 1.2,
        shuffle: true,
        generated: true,
        source: 'all',
        passScore: 825,
      },
      qstats: {},
      history: [],
      customDays: [],
      current: null,
    };
  }

  function loadStore() {
    const base = defaults();
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return base;
      const data = JSON.parse(raw);
      return Object.assign(base, data, { settings: Object.assign(base.settings, data.settings) });
    } catch (e) {
      return base;
    }
  }

  let db = loadStore();

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(db));
    } catch (e) {
      /* storage unavailable or full: the app keeps working for this session */
    }
  }

  // ---------------------------------------------------------------- helpers

  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'html') n.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else if (typeof v === 'boolean') n[k] = v;
        else n.setAttribute(k, v);
      }
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      n.append(kid.nodeType ? kid : String(kid));
    }
    return n;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  }

  /* Minimal markup for question text: `code`, **bold**, line breaks. */
  function fmt(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\n/g, '<br>');
  }

  function plain(s) {
    return String(s).replace(/[`*]/g, '');
  }

  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function clock(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  function dateStr(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  function plural(n, one, few, many) {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  function daysLabel(list) {
    const s = list.slice().sort((a, b) => a - b);
    const parts = [];
    for (let i = 0; i < s.length; i++) {
      let j = i;
      while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
      parts.push(i === j ? `${s[i]}` : `${s[i]}–${s[j]}`);
      i = j;
    }
    return parts.join(', ');
  }

  function toast(text) {
    const t = el('div', { class: 'toast', role: 'status' }, text);
    document.body.append(t);
    setTimeout(() => t.remove(), 2400);
  }

  let modalEl = null;
  function openModal(title, body, actions) {
    closeModal();
    const box = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      el('h2', null, title),
      body ? el('div', { class: 'muted' }, body) : null,
      el('div', { class: 'row' }, el('div', { class: 'spacer' }),
        actions.map((a) => el('button', {
          class: 'btn ' + (a.cls || ''),
          onclick: () => { closeModal(); if (a.run) a.run(); },
        }, a.label))));
    modalEl = el('div', { class: 'modal-back', onclick: (e) => { if (e.target === modalEl) closeModal(); } }, box);
    document.body.append(modalEl);
    const btns = box.querySelectorAll('button');
    if (btns.length) btns[btns.length - 1].focus();
  }
  function closeModal() {
    if (modalEl) modalEl.remove();
    modalEl = null;
  }

  // ---------------------------------------------------------------- bank

  const index = new Map();

  function sortedDays() {
    return Object.values(CCNA.days).sort((a, b) => a.day - b.day);
  }

  function rebuildIndex() {
    index.clear();
    for (const d of sortedDays()) for (const q of d.questions) index.set(q.id, { q, day: d.day });
  }

  /* An imported day either adds a new day or appends questions to an existing one. */
  function applyCustomDay(def) {
    const existing = CCNA.days[def.day];
    if (existing && !existing.custom) {
      const merged = Object.assign({}, existing, {
        questions: existing.questions.concat(def.questions || []),
      });
      CCNA.registerDay(merged, { source: `импорт (день ${def.day})` });
      CCNA.days[def.day].extended = true;
    } else {
      CCNA.registerDay(def, { custom: true, source: `импорт (день ${def.day})` });
    }
  }

  function loadScript(src) {
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.head.append(s);
    });
  }

  // ---------------------------------------------------------------- grading

  function correctAnswer(q) {
    switch (q.type) {
      case 'single':
      case 'multi':
      case 'match':
        return clone(q.answer);
      case 'order':
        return q.items.map((_, i) => i);
      case 'fill':
        return q.answer[0];
    }
  }

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/,/g, '').replace(/\s+/g, ' ').trim();
  }

  function isAnswered(q, a) {
    if (a == null) return false;
    switch (q.type) {
      case 'single': return Number.isInteger(a);
      case 'multi': return a.length > 0;
      case 'match': return a.some((x) => x != null);
      case 'order': return true;
      case 'fill': return norm(a) !== '';
    }
    return false;
  }

  function isCorrect(q, a) {
    switch (q.type) {
      case 'single':
        return a === q.answer;
      case 'multi':
        return Array.isArray(a) && a.length === q.answer.length && q.answer.every((x) => a.includes(x));
      case 'match':
        return Array.isArray(a) && q.answer.every((t, i) => a[i] === t);
      case 'order': {
        const cur = a || q.view;
        return cur.every((x, i) => x === i);
      }
      case 'fill': {
        const n = norm(a);
        if (!n) return false;
        const nz = n.replace(/ /g, '');
        return q.answer.some((x) => norm(x) === n || norm(x).replace(/ /g, '') === nz);
      }
    }
    return false;
  }

  // ---------------------------------------------------------------- exam building

  function staticPool(dayNums, s) {
    const out = [];
    for (const n of dayNums) {
      const d = CCNA.days[n];
      if (!d) continue;
      for (const q of d.questions) {
        const st = db.qstats[q.id];
        if (s.source === 'unseen' && st && st.seen) continue;
        if (s.source === 'wrong' && !(st && st.lastWrong)) continue;
        out.push({ q, day: n });
      }
    }
    return out;
  }

  function generatedCount(dayNums, s) {
    if (!s.generated || s.source !== 'all') return 0;
    return dayNums.reduce((acc, n) => acc + (CCNA.days[n] ? CCNA.days[n].generators.length * GEN_PER_GENERATOR : 0), 0);
  }

  function generatedPool(dayNums, s) {
    const out = [];
    if (!s.generated || s.source !== 'all') return out;
    for (const n of dayNums) {
      const d = CCNA.days[n];
      if (!d) continue;
      for (const g of d.generators) {
        const ids = new Set();
        for (let i = 0, tries = 0; i < GEN_PER_GENERATOR && tries < 20; tries++) {
          let q;
          try {
            q = g.make(R);
          } catch (e) {
            console.warn('Generator failed', g.id, e);
            break;
          }
          if (!q || CCNA.validateQuestion(q) || ids.has(q.id)) continue;
          ids.add(q.id);
          out.push({ q, day: n, generated: true });
          i++;
        }
      }
    }
    return out;
  }

  function instantiate(entry, shuffleOn) {
    const q = clone(entry.q);
    q.day = entry.day;
    q.generated = !!entry.generated || q.id.startsWith('gen-');
    const n = q.type === 'match' ? q.targets.length : (q.options || q.items || []).length;
    const ids = [...Array(n).keys()];
    if (q.type === 'single' || q.type === 'multi') {
      q.view = shuffleOn && !q.fixedOrder ? R.shuffle(ids) : ids;
    } else if (q.type === 'match') {
      q.view = shuffleOn ? R.shuffle(ids) : ids;
    } else if (q.type === 'order') {
      let v;
      do v = R.shuffle(ids); while (v.every((x, i) => x === i));
      q.view = v;
    }
    return q;
  }

  function startExam(entries, title) {
    const s = db.settings;
    if (!entries.length) {
      toast('Нет вопросов для выбранных условий');
      return;
    }
    const questions = entries.map((e) => instantiate(e, s.shuffle));
    const n = questions.length;
    db.current = {
      id: Date.now(),
      title,
      mode: s.mode,
      days: [...new Set(questions.map((q) => q.day))].sort((a, b) => a - b),
      questions,
      answers: Array(n).fill(null),
      marked: Array(n).fill(false),
      revealed: Array(n).fill(false),
      idx: 0,
      timeLimit: s.mode === 'exam' ? Math.max(60, Math.round(n * s.minutesPerQ * 60)) : 0,
      elapsed: 0,
    };
    save();
    go('exam');
  }

  function startFromSettings() {
    const s = db.settings;
    const days = s.days.filter((d) => CCNA.days[d]);
    const pool = staticPool(days, s).concat(generatedPool(days, s));
    const count = Math.min(Math.max(1, s.count | 0), pool.length);
    startExam(R.shuffle(pool).slice(0, count), `Дни ${daysLabel(days)}`);
  }

  // ---------------------------------------------------------------- finishing

  /* History stores bank questions by id and keeps full copies only of generated ones. */
  function packQuestion(q) {
    if (q.generated || !index.has(q.id)) return q;
    return { ref: q.id, day: q.day, view: q.view };
  }

  function unpackQuestion(p) {
    if (!p.ref) return p;
    const hit = index.get(p.ref);
    if (!hit) {
      return { id: p.ref, day: p.day, type: 'single', question: '(Этот вопрос удалён из банка.)', options: ['—', '—'], answer: 0, view: [0, 1] };
    }
    const q = clone(hit.q);
    q.day = p.day;
    const n = q.type === 'match' ? q.targets.length : (q.options || q.items || []).length;
    q.view = Array.isArray(p.view) && p.view.length === n ? p.view : [...Array(n).keys()];
    return q;
  }

  function finish(timeUp) {
    const ex = db.current;
    if (!ex) return;
    const result = ex.questions.map((q, i) => isCorrect(q, ex.answers[i]));
    const correct = result.filter(Boolean).length;
    const total = ex.questions.length;
    const score = Math.round((1000 * correct) / total);
    const now = Date.now();

    ex.questions.forEach((q, i) => {
      if (q.generated) return;
      const st = db.qstats[q.id] || { seen: 0, correct: 0 };
      st.seen++;
      if (result[i]) st.correct++;
      st.lastWrong = !result[i];
      st.last = now;
      db.qstats[q.id] = st;
    });

    const entry = {
      id: ex.id,
      date: now,
      title: ex.title,
      mode: ex.mode,
      days: ex.days,
      total,
      correct,
      score,
      passScore: db.settings.passScore,
      passed: score >= db.settings.passScore,
      elapsed: ex.elapsed,
      timeLimit: ex.timeLimit,
      timeUp: !!timeUp,
      questions: ex.questions.map(packQuestion),
      answers: ex.answers,
      marked: ex.marked,
      result,
    };
    db.history.unshift(entry);
    db.history = db.history.slice(0, HISTORY_LIMIT);
    db.current = null;
    save();
    resultId = entry.id;
    resultFilter = 'all';
    go('results');
    if (timeUp) toast('Время вышло — экзамен завершён');
  }

  function confirmFinish() {
    const ex = db.current;
    const unanswered = ex.questions.filter((q, i) => !isAnswered(q, ex.answers[i])).length;
    const marked = ex.marked.filter(Boolean).length;
    const notes = [];
    if (unanswered) notes.push(`Без ответа: ${unanswered}.`);
    if (marked) notes.push(`Отмечено для проверки: ${marked}.`);
    openModal('Завершить экзамен?', (notes.join(' ') || 'На все вопросы даны ответы.') + ' После завершения ответы изменить нельзя.', [
      { label: 'Вернуться' },
      { label: 'Завершить и оценить', cls: 'primary', run: () => finish(false) },
    ]);
  }

  // ---------------------------------------------------------------- routing

  const app = document.getElementById('app');
  let view = 'home';
  let resultId = null;
  let resultFilter = 'all';
  let reviewFilter = 'all';
  let bankDay = null;
  let importText = '';

  function go(v) {
    view = v;
    render();
    window.scrollTo(0, 0);
  }

  function render() {
    const page = {
      home: viewHome,
      exam: viewExam,
      review: viewReview,
      results: viewResults,
      history: viewHistory,
      bank: viewBank,
    };
    if ((view === 'exam' || view === 'review') && !db.current) view = 'home';
    const content = (page[view] || viewHome)();
    app.replaceChildren(...[
      topbar(),
      el('main', null, el('div', { class: 'wrap' }, content)),
      view === 'exam' ? examToolbar() : null,
      view === 'review' ? reviewToolbar() : null,
    ].filter(Boolean));
  }

  function topbar() {
    const days = sortedDays();
    const nums = days.map((d) => d.day);
    const sub = nums.length ? `Jeremy's IT Lab · ${nums.length === 1 ? 'день' : 'дни'} ${daysLabel(nums)}` : '';
    const navBtn = (v, label) => el('button', {
      'aria-current': view === v ? 'page' : null,
      onclick: () => go(v),
    }, label);
    const inExam = view === 'exam' || view === 'review';
    return el('header', { class: 'topbar' }, el('div', { class: 'wrap' },
      el('div', { class: 'brand' }, el('b', null, 'CCNA Exam Simulator'), el('span', null, sub)),
      inExam
        ? el('nav', { class: 'nav' }, el('button', { onclick: () => go('home') }, 'Пауза и выход'))
        : el('nav', { class: 'nav' }, navBtn('home', 'Экзамен'), navBtn('history', 'История'), navBtn('bank', 'Банк вопросов')),
    ));
  }

  // ---------------------------------------------------------------- home

  function viewHome() {
    const s = db.settings;
    const days = sortedDays();
    const selected = new Set(s.days.filter((d) => CCNA.days[d]));
    const dayNums = [...selected];
    const poolSize = staticPool(dayNums, s).length + generatedCount(dayNums, s);
    const count = Math.min(Math.max(1, s.count | 0), poolSize);
    const minutes = Math.round(count * s.minutesPerQ);

    const out = [];

    if (db.current) {
      const ex = db.current;
      const answered = ex.questions.filter((q, i) => isAnswered(q, ex.answers[i])).length;
      out.push(el('div', { class: 'banner' },
        el('div', null,
          el('b', null, 'Незавершённый экзамен'),
          el('div', { class: 'small muted' },
            `${ex.title} · ${ex.mode === 'exam' ? 'экзамен' : 'обучение'} · отвечено ${answered} из ${ex.questions.length}` +
            (ex.timeLimit ? ` · осталось ${clock(ex.timeLimit - ex.elapsed)}` : ''))),
        el('div', { class: 'spacer' }),
        el('button', {
          class: 'btn danger',
          onclick: () => openModal('Отменить экзамен?', 'Ответы этого экзамена не сохранятся и не попадут в историю.', [
            { label: 'Нет' },
            { label: 'Отменить экзамен', cls: 'primary', run: () => { db.current = null; save(); render(); } },
          ]),
        }, 'Отменить'),
        el('button', { class: 'btn primary', onclick: () => go('exam') }, 'Продолжить'),
      ));
    }

    if (CCNA.errors.length) {
      out.push(el('div', { class: 'banner warn' },
        el('div', null,
          el('b', null, `Пропущено вопросов с ошибками: ${CCNA.errors.length}`),
          el('div', { class: 'small' }, CCNA.errors.slice(0, 6).join(' · ')))));
    }

    // Day list
    const dayRows = days.map((d) => {
      const total = d.questions.length;
      const learned = d.questions.filter((q) => db.qstats[q.id] && db.qstats[q.id].seen && !db.qstats[q.id].lastWrong).length;
      const pct = total ? Math.round((100 * learned) / total) : 0;
      const id = `day-${d.day}`;
      return el('label', { class: 'day-row', for: id },
        el('input', {
          type: 'checkbox',
          id,
          checked: selected.has(d.day),
          onchange: (e) => {
            const set = new Set(db.settings.days);
            if (e.target.checked) set.add(d.day); else set.delete(d.day);
            db.settings.days = [...set].sort((a, b) => a - b);
            save();
            render();
          },
        }),
        el('span', { class: 'day-num' }, `Day ${String(d.day).padStart(2, '0')}`),
        el('span', { class: 'day-title' },
          el('b', null, d.title, d.custom ? ' ' : null, d.custom ? el('span', { class: 'tag' }, 'импорт') : null,
            d.extended ? ' ' : null, d.extended ? el('span', { class: 'tag' }, '+ импорт') : null),
          el('span', null, d.titleRu || d.topics.join(', '))),
        el('span', { class: 'day-meta' },
          `${total} вопр.${d.generators.length ? ' + ген.' : ''}`,
          el('div', { class: 'mastery', title: `Освоено ${learned} из ${total}` }, el('i', { style: `width:${pct}%` })),
        ),
      );
    });

    const setDays = (list) => { db.settings.days = list; save(); render(); };
    const daysPanel = el('section', { class: 'panel stack' },
      el('div', { class: 'row' },
        el('div', null, el('div', { class: 'eyebrow' }, 'Шаг 1'), el('h2', null, 'Дни курса')),
        el('div', { class: 'spacer' }),
        el('button', { class: 'btn', onclick: () => setDays(days.map((d) => d.day)) }, 'Все'),
        el('button', { class: 'btn', onclick: () => setDays([]) }, 'Снять'),
      ),
      el('div', { class: 'days' }, dayRows),
      el('div', { class: 'small muted' }, 'Полоска справа — доля вопросов дня, на которые вы ответили верно в последний раз.'),
    );

    // Settings
    const set = (k, v) => { db.settings[k] = v; save(); render(); };
    const segBtn = (k, v, label) => el('button', { 'aria-pressed': String(s[k] === v), onclick: () => set(k, v) }, label);

    const countInput = el('input', {
      class: 'input',
      id: 'count',
      type: 'number',
      min: '1',
      max: String(Math.max(1, poolSize)),
      value: String(count),
      onchange: (e) => set('count', Math.max(1, parseInt(e.target.value, 10) || 1)),
    });
    const timeInput = el('input', {
      class: 'input',
      id: 'mpq',
      type: 'number',
      min: '0.3',
      max: '5',
      step: '0.1',
      value: String(s.minutesPerQ),
      onchange: (e) => set('minutesPerQ', Math.min(5, Math.max(0.3, parseFloat(e.target.value) || 1.2))),
    });
    const sourceSel = el('select', { class: 'input', id: 'source', onchange: (e) => set('source', e.target.value) },
      el('option', { value: 'all' }, 'Все вопросы'),
      el('option', { value: 'unseen' }, 'Только новые (ещё не встречались)'),
      el('option', { value: 'wrong' }, 'Только ошибки (последний ответ неверный)'));
    sourceSel.value = s.source;
    const passInput = el('input', {
      class: 'input',
      id: 'pass',
      type: 'number',
      min: '300',
      max: '1000',
      step: '5',
      value: String(s.passScore),
      onchange: (e) => set('passScore', Math.min(1000, Math.max(300, parseInt(e.target.value, 10) || 825))),
    });

    const settingsPanel = el('section', { class: 'panel stack' },
      el('div', null, el('div', { class: 'eyebrow' }, 'Шаг 2'), el('h2', null, 'Параметры')),
      el('div', { class: 'field' },
        el('span', { class: 'label' }, 'Режим'),
        el('div', { class: 'seg' }, segBtn('mode', 'exam', 'Экзамен'), segBtn('mode', 'study', 'Обучение')),
        el('span', { class: 'small muted' }, s.mode === 'exam'
          ? 'Таймер, ответы и пояснения — только после завершения. Как на реальном экзамене.'
          : 'Без таймера. Ответ и пояснение можно посмотреть сразу после каждого вопроса.'),
      ),
      el('div', { class: 'field' },
        el('label', { for: 'count' }, `Количество вопросов (доступно ${poolSize})`),
        el('div', { class: 'row' },
          el('div', { style: 'flex:1;min-width:90px' }, countInput),
          [10, 25, 50].map((n) => el('button', { class: 'btn', onclick: () => set('count', n) }, String(n))),
          el('button', { class: 'btn', onclick: () => set('count', 9999) }, 'Все'),
        ),
      ),
      s.mode === 'exam' ? el('div', { class: 'field' },
        el('label', { for: 'mpq' }, 'Минут на вопрос'),
        timeInput,
        el('span', { class: 'small muted' }, 'На реальном CCNA 200-301: около 100 вопросов за 120 минут, то есть ~1.2 минуты на вопрос.'),
      ) : null,
      el('div', { class: 'field' }, el('label', { for: 'source' }, 'Какие вопросы брать'), sourceSel),
      el('label', { class: 'check', for: 'gen' },
        el('input', { type: 'checkbox', id: 'gen', checked: s.generated, onchange: (e) => set('generated', e.target.checked) }),
        el('span', null, 'Добавлять сгенерированные задачи', el('div', { class: 'small muted' }, 'Двоичные числа, классы, сетевые и broadcast-адреса, IHL — новые значения в каждом экзамене.'))),
      el('label', { class: 'check', for: 'shuf' },
        el('input', { type: 'checkbox', id: 'shuf', checked: s.shuffle, onchange: (e) => set('shuffle', e.target.checked) }),
        el('span', null, 'Перемешивать варианты ответов')),
      el('div', { class: 'field' },
        el('label', { for: 'pass' }, 'Проходной балл (из 1000)'),
        passInput),
      el('div', { class: 'summary-line' },
        poolSize
          ? `${count} ${plural(count, 'вопрос', 'вопроса', 'вопросов')} · ${s.mode === 'exam' ? `${minutes} мин` : 'без лимита'} · проходной ${s.passScore}/1000`
          : 'Выберите хотя бы один день с вопросами'),
      el('button', { class: 'btn primary big', disabled: !poolSize, onclick: startFromSettings }, 'Начать экзамен'),
    );

    out.push(el('div', { class: 'home-grid' }, daysPanel, el('div', { class: 'stack' }, settingsPanel, statsPanel())));
    out.push(importPanel());
    return el('div', { class: 'stack' }, out);
  }

  function statsPanel() {
    const h = db.history;
    const last = h.slice(0, 5);
    const ids = Object.keys(db.qstats);
    const seen = ids.length;
    const totalQ = index.size;
    return el('section', { class: 'panel stack' },
      el('h3', null, 'Прогресс'),
      el('div', { class: 'small' },
        `Пройдено экзаменов: ${h.length}. Встречено вопросов из банка: ${Math.min(seen, totalQ)} из ${totalQ}.`),
      last.length ? el('div', { class: 'table-wrap' }, el('table', { class: 'data' },
        el('tbody', null, last.map((e) => el('tr', { class: 'click', onclick: () => { resultId = e.id; resultFilter = 'all'; go('results'); } },
          el('td', { class: 'small muted' }, dateStr(e.date)),
          el('td', null, `${e.score}`),
          el('td', null, el('span', { class: 'verdict-pill ' + (e.passed ? 'pass' : 'fail') }, e.passed ? 'PASS' : 'FAIL'))))))) : null,
      seen ? el('button', {
        class: 'btn danger',
        onclick: () => openModal('Сбросить статистику?', 'Будут удалены история экзаменов и статистика по вопросам. Импортированные дни останутся.', [
          { label: 'Отмена' },
          { label: 'Сбросить', cls: 'primary', run: () => { db.qstats = {}; db.history = []; save(); render(); toast('Статистика сброшена'); } },
        ]),
      }, 'Сбросить статистику') : null,
    );
  }

  const TEMPLATE_JSON = JSON.stringify({
    day: 13,
    title: 'Life of a Packet',
    titleRu: 'Жизнь пакета',
    questions: [
      {
        id: 'd13-01',
        type: 'single',
        question: 'When R1 forwards a packet to the next hop, which addresses does it change?',
        options: ['Source and destination IP', 'Source and destination MAC', 'Only the destination IP', 'None'],
        answer: 1,
        explanation: 'MAC-адреса меняются на каждом участке, IP-адреса остаются прежними.',
      },
      {
        id: 'd13-02',
        type: 'fill',
        question: 'Type the command that displays the ARP table on a Cisco router.',
        answer: ['show arp', 'show ip arp'],
        explanation: '`show arp` показывает сопоставления IP → MAC.',
      },
    ],
  }, null, 2);

  function importPanel() {
    const ta = el('textarea', {
      class: 'input',
      id: 'import-json',
      placeholder: 'Вставьте JSON дня (объект или массив объектов)…',
      oninput: (e) => { importText = e.target.value; },
    });
    ta.value = importText;
    const file = el('input', {
      type: 'file',
      id: 'import-file',
      accept: '.json,application/json',
      onchange: (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => importDays(String(reader.result));
        reader.readAsText(f);
      },
    });
    const tpl = el('pre', { class: 'code' }, TEMPLATE_JSON);

    const custom = db.customDays;
    return el('section', { class: 'panel stack' },
      el('div', null, el('div', { class: 'eyebrow' }, 'Расширение'), el('h2', null, 'Добавить день курса')),
      el('p', { class: 'small muted', style: 'margin:0;max-width:75ch' },
        'Прошли новый день курса? Добавьте вопросы JSON-файлом или вставкой текста. Новый номер дня появится в списке; ' +
        'номер существующего дня дополнит его вопросы. Данные хранятся в этом браузере. ' +
        'Чтобы день стал частью банка насовсем, создайте файл days/dayNN.js по шаблону days/_template.js (см. README).'),
      ta,
      el('div', { class: 'row' },
        el('button', { class: 'btn primary', onclick: () => importDays(ta.value) }, 'Добавить из текста'),
        el('label', { class: 'btn', for: 'import-file' }, 'Выбрать .json файл'),
        file,
      ),
      el('details', null,
        el('summary', { class: 'small', style: 'cursor:pointer' }, 'Шаблон JSON и типы вопросов'),
        el('div', { class: 'stack', style: 'margin-top:10px' },
          el('div', { class: 'small muted' },
            'Типы: single (answer — индекс), multi (answer — массив индексов), match (items, targets, answer — индекс target для каждого item), ' +
            'order (items в правильном порядке), fill (answer — список допустимых ответов). Поле exhibit — вывод CLI или схема. Индексы начинаются с 0.'),
          tpl,
          el('div', { class: 'row' }, el('button', {
            class: 'btn',
            onclick: () => {
              navigator.clipboard.writeText(TEMPLATE_JSON).then(() => toast('Шаблон скопирован'), () => {
                ta.value = TEMPLATE_JSON;
                importText = TEMPLATE_JSON;
                ta.focus();
                ta.select();
              });
            },
          }, 'Копировать шаблон')),
        )),
      custom.length ? el('div', { class: 'stack' },
        el('h3', null, 'Импортированные'),
        custom.map((d) => el('div', { class: 'row' },
          el('span', { class: 'day-num' }, `Day ${String(d.day).padStart(2, '0')}`),
          el('span', null, d.title || ''),
          el('span', { class: 'small muted' }, `${(d.questions || []).length} вопр.`),
          el('div', { class: 'spacer' }),
          el('button', {
            class: 'btn danger',
            onclick: () => openModal(`Удалить импорт дня ${d.day}?`, 'Вопросы из этого импорта пропадут из банка. Встроенные вопросы дня останутся.', [
              { label: 'Отмена' },
              { label: 'Удалить', cls: 'primary', run: () => { db.customDays = db.customDays.filter((x) => x !== d); save(); location.reload(); } },
            ]),
          }, 'Удалить')))) : null,
    );
  }

  function importDays(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      toast('Не удалось прочитать JSON: ' + e.message);
      return;
    }
    const list = Array.isArray(data) ? data : [data];
    const before = CCNA.errors.length;
    let added = 0;
    for (const def of list) {
      if (!def || !Number.isInteger(def.day) || !Array.isArray(def.questions)) {
        toast('В каждом дне нужны поля day (число) и questions (массив)');
        return;
      }
      const errs = [];
      def.questions.forEach((q) => {
        const p = CCNA.validateQuestion(q);
        if (p) errs.push(`${q && q.id ? q.id : '?'}: ${p}`);
        else if (index.has(q.id)) errs.push(`${q.id}: такой id уже есть в банке`);
      });
      if (errs.length) {
        openModal(`Ошибки в дне ${def.day}`, errs.slice(0, 8).join('\n'), [{ label: 'Понятно', cls: 'primary' }]);
        return;
      }
      db.customDays = db.customDays.filter((x) => !(x.day === def.day && x.title === def.title));
      db.customDays.push(def);
      applyCustomDay(def);
      if (!db.settings.days.includes(def.day)) db.settings.days.push(def.day);
      added += def.questions.length;
    }
    CCNA.errors.length = before;
    rebuildIndex();
    importText = '';
    save();
    render();
    toast(`Добавлено вопросов: ${added}`);
  }

  // ---------------------------------------------------------------- question rendering

  function questionText(q) {
    let text = q.question;
    if (q.type === 'multi' && !/choose/i.test(text)) text += ` (Choose ${CHOOSE[q.answer.length] || q.answer.length}.)`;
    return text;
  }

  function hintFor(q) {
    switch (q.type) {
      case 'single': return 'Выберите один ответ.';
      case 'multi': return `Выберите ${q.answer.length} ${plural(q.answer.length, 'ответ', 'ответа', 'ответов')}.`;
      case 'match': return 'Сопоставьте каждый элемент слева с вариантом справа.';
      case 'order': return 'Расставьте элементы в правильном порядке кнопками ↑ ↓.';
      case 'fill': return 'Введите ответ. Регистр и лишние пробелы не учитываются.';
    }
    return '';
  }

  /*
   * opts.locked  — inputs disabled
   * opts.reveal  — mark correct / incorrect parts
   * opts.onChange(answer, rerender)
   */
  function renderQuestion(q, ans, opts) {
    const o = opts || {};
    const wrap = el('div', { class: 'question' + (o.locked ? ' locked' : '') });
    if (q.exhibit) {
      wrap.append(el('div', null, el('div', { class: 'exhibit-label' }, 'Exhibit'), el('pre', { class: 'exhibit' }, q.exhibit)));
    }
    wrap.append(el('div', { class: 'q-text', html: fmt(questionText(q)) }));
    if (!o.locked) wrap.append(el('div', { class: 'q-hint' }, hintFor(q)));

    if (q.type === 'single' || q.type === 'multi') {
      const multi = q.type === 'multi';
      const chosen = multi ? ans || [] : ans;
      const list = el('div', { class: 'opts', role: multi ? 'group' : 'radiogroup' });
      q.view.forEach((oi, pos) => {
        const checked = multi ? chosen.includes(oi) : chosen === oi;
        const right = multi ? q.answer.includes(oi) : q.answer === oi;
        const cls = ['opt'];
        if (checked) cls.push('sel');
        if (o.reveal && right) cls.push('ok');
        if (o.reveal && checked && !right) cls.push('bad');
        const id = `q${q.id}-o${oi}`;
        const input = el('input', {
          type: multi ? 'checkbox' : 'radio',
          name: `q-${q.id}`,
          id,
          checked,
          disabled: !!o.locked,
          'data-oi': String(oi),
          onchange: () => {
            const picked = [...list.querySelectorAll('input:checked')].map((x) => Number(x.dataset.oi));
            if (o.onChange) o.onChange(multi ? picked : picked[0], true);
          },
        });
        list.append(el('label', { class: cls.join(' '), for: id },
          input,
          el('span', { class: 'letter' }, LETTERS[pos] + '.'),
          el('span', { html: fmt(q.options[oi]) }),
          o.reveal && (right || checked) ? el('span', { class: 'mark' }, right ? '✓' : '✗') : el('span'),
        ));
      });
      wrap.append(list);
    }

    if (q.type === 'match') {
      const cur = ans || q.items.map(() => null);
      const box = el('div', { class: 'match' });
      q.items.forEach((item, i) => {
        const sel = el('select', {
          class: 'input',
          disabled: !!o.locked,
          'aria-label': plain(item),
          'data-i': String(i),
          onchange: () => {
            const arr = [...box.querySelectorAll('select')].map((s) => (s.value === '' ? null : Number(s.value)));
            if (o.onChange) o.onChange(arr, false);
          },
        }, el('option', { value: '' }, '— выберите —'), q.view.map((ti) => el('option', { value: String(ti) }, plain(q.targets[ti]))));
        sel.value = cur[i] == null ? '' : String(cur[i]);
        const ok = cur[i] === q.answer[i];
        const cls = 'match-row' + (o.reveal ? (ok ? ' ok' : ' bad') : '');
        box.append(el('div', { class: cls },
          el('div', { class: 'item', html: fmt(item) }),
          sel,
          o.reveal && !ok ? el('div', { class: 'fix' }, '✓ ' + plain(q.targets[q.answer[i]])) : null,
        ));
      });
      wrap.append(box);
    }

    if (q.type === 'order') {
      const cur = ans || q.view;
      const move = (pos, dir) => {
        const arr = cur.slice();
        const j = pos + dir;
        [arr[pos], arr[j]] = [arr[j], arr[pos]];
        if (o.onChange) o.onChange(arr, true);
      };
      const list = el('ol', { class: 'order' });
      cur.forEach((idx, pos) => {
        const cls = o.reveal ? (idx === pos ? 'ok' : 'bad') : '';
        list.append(el('li', { class: cls },
          el('span', { class: 'pos' }, String(pos + 1)),
          el('span', { html: fmt(q.items[idx]) }),
          o.locked ? el('span') : el('span', { class: 'moves' },
            el('button', { type: 'button', 'aria-label': 'Выше', disabled: pos === 0, onclick: () => move(pos, -1) }, '↑'),
            el('button', { type: 'button', 'aria-label': 'Ниже', disabled: pos === cur.length - 1, onclick: () => move(pos, 1) }, '↓')),
        ));
      });
      wrap.append(list);
    }

    if (q.type === 'fill') {
      const input = el('input', {
        class: 'input fill-input',
        id: `fill-${q.id}`,
        type: 'text',
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: 'false',
        disabled: !!o.locked,
        placeholder: 'Ваш ответ',
        oninput: (e) => { if (o.onChange) o.onChange(e.target.value, false); },
      });
      input.value = ans || '';
      const cls = o.reveal ? (isCorrect(q, ans) ? ' ok' : ' bad') : '';
      wrap.append(el('div', { class: 'fill-wrap' + cls }, el('span', { class: 'prompt' }, '>'), input));
    }
    return wrap;
  }

  function explainEl(q, ans, opts) {
    const o = opts || {};
    const ok = isCorrect(q, ans);
    const answered = isAnswered(q, ans);
    const box = el('div', { class: 'explain ' + (o.neutral ? '' : ok ? 'ok' : 'bad') });
    if (!o.neutral) box.append(el('div', { class: 'verdict' }, ok ? 'Верно' : answered ? 'Неверно' : 'Нет ответа'));
    if (q.type === 'fill') {
      box.append(el('div', { class: 'small' }, 'Правильный ответ: ', el('code', null, q.answer[0]),
        q.answer.length > 1 ? el('span', { class: 'muted' }, ` · также принимается: ${q.answer.slice(1).join(' | ')}`) : null));
    }
    if (q.type === 'order' && (!ok || o.neutral)) {
      box.append(el('div', { class: 'small' }, 'Правильный порядок: ', q.items.map(plain).join(' → ')));
    }
    if (q.explanation) box.append(el('div', { html: fmt(q.explanation), style: 'margin-top:6px' }));
    box.append(el('div', { class: 'small muted', style: 'margin-top:8px' },
      `Day ${q.day}` + (CCNA.days[q.day] ? ` · ${CCNA.days[q.day].title}` : '') + ` · ${q.id}`));
    return box;
  }

  // ---------------------------------------------------------------- exam view

  function viewExam() {
    const ex = db.current;
    const i = ex.idx;
    const q = ex.questions[i];
    const n = ex.questions.length;
    const locked = ex.revealed[i];
    const answered = ex.questions.filter((qq, k) => isAnswered(qq, ex.answers[k])).length;

    const onChange = (a, rerender) => {
      ex.answers[i] = a;
      save();
      if (rerender) render();
      else {
        const c = document.getElementById('answered');
        if (c) c.textContent = `Отвечено ${ex.questions.filter((qq, k) => isAnswered(qq, ex.answers[k])).length}/${n}`;
      }
    };

    const panel = el('section', { class: 'panel stack' },
      renderQuestion(q, ex.answers[i], { locked, reveal: locked, onChange }),
      locked ? explainEl(q, ex.answers[i]) : null,
    );

    return el('div', null,
      el('div', { class: 'exam-head' },
        el('div', { class: 'qno' }, `Вопрос ${i + 1} `, el('span', { class: 'muted' }, `из ${n}`)),
        el('span', { class: 'tag' }, `Day ${q.day}`),
        ex.marked[i] ? el('span', { class: 'tag', style: 'background:var(--flag-soft);color:var(--flag)' }, 'Отмечен') : null,
        el('div', { class: 'spacer' }),
        el('span', { class: 'small muted', id: 'answered' }, `Отвечено ${answered}/${n}`),
        el('span', { class: 'timer', id: 'timer' }, timerText()),
      ),
      el('div', { class: 'progress' }, el('i', { style: `width:${((i + 1) / n) * 100}%` })),
      panel,
    );
  }

  function timerText() {
    const ex = db.current;
    if (!ex) return '';
    return ex.timeLimit ? clock(ex.timeLimit - ex.elapsed) : clock(ex.elapsed);
  }

  function gotoQ(i) {
    const ex = db.current;
    ex.idx = Math.max(0, Math.min(ex.questions.length - 1, i));
    save();
    go('exam');
  }

  function toggleMark() {
    const ex = db.current;
    ex.marked[ex.idx] = !ex.marked[ex.idx];
    save();
    render();
  }

  function reveal() {
    const ex = db.current;
    ex.revealed[ex.idx] = true;
    save();
    render();
  }

  function examToolbar() {
    const ex = db.current;
    const i = ex.idx;
    const last = i === ex.questions.length - 1;
    return el('div', { class: 'toolbar' }, el('div', { class: 'wrap' },
      el('button', { class: 'btn', disabled: i === 0, onclick: () => gotoQ(i - 1) }, '← Назад'),
      el('button', { class: 'btn' + (ex.marked[i] ? ' flagged' : ''), onclick: toggleMark, 'aria-pressed': String(!!ex.marked[i]) },
        ex.marked[i] ? 'Снять отметку' : 'Отметить', el('kbd', null, 'M')),
      el('button', { class: 'btn', onclick: () => go('review') }, 'Обзор'),
      ex.mode === 'study' && !ex.revealed[i] ? el('button', { class: 'btn', onclick: reveal }, 'Проверить', el('kbd', null, 'Enter')) : null,
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn danger', onclick: confirmFinish }, 'Завершить'),
      last
        ? el('button', { class: 'btn primary', onclick: () => go('review') }, 'К обзору →')
        : el('button', { class: 'btn primary', onclick: () => gotoQ(i + 1) }, 'Далее →'),
    ));
  }

  // ---------------------------------------------------------------- item review

  function viewReview() {
    const ex = db.current;
    const n = ex.questions.length;
    const answered = ex.questions.map((q, i) => isAnswered(q, ex.answers[i]));
    const show = ex.questions.map((q, i) =>
      reviewFilter === 'all' || (reviewFilter === 'marked' && ex.marked[i]) || (reviewFilter === 'open' && !answered[i]));
    const cells = ex.questions.map((q, i) => {
      if (!show[i]) return null;
      const cls = ['cell'];
      if (ex.revealed[i]) cls.push(isCorrect(q, ex.answers[i]) ? 'ok' : 'bad');
      else if (answered[i]) cls.push('answered');
      if (ex.marked[i]) cls.push('marked');
      return el('button', { class: cls.join(' '), onclick: () => gotoQ(i), 'aria-label': `Вопрос ${i + 1}` },
        String(i + 1), el('small', null, answered[i] ? 'ответ' : '—'));
    });
    const seg = (v, label) => el('button', { 'aria-pressed': String(reviewFilter === v), onclick: () => { reviewFilter = v; render(); } }, label);
    const a = answered.filter(Boolean).length;
    const m = ex.marked.filter(Boolean).length;
    return el('div', { class: 'stack' },
      el('div', { class: 'exam-head' },
        el('h1', null, 'Обзор вопросов'),
        el('div', { class: 'spacer' }),
        el('span', { class: 'timer', id: 'timer' }, timerText())),
      el('div', { class: 'row' },
        el('div', { class: 'seg' }, seg('all', `Все (${n})`), seg('open', `Без ответа (${n - a})`), seg('marked', `Отмеченные (${m})`))),
      el('section', { class: 'panel stack' },
        el('div', { class: 'grid-items' }, cells),
        el('div', { class: 'legend' },
          el('span', null, el('i', { class: 'a' }), 'есть ответ'),
          el('span', null, el('i'), 'без ответа'),
          el('span', null, el('i', { class: 'm' }), 'отмечен')),
      ),
    );
  }

  function reviewToolbar() {
    const ex = db.current;
    return el('div', { class: 'toolbar' }, el('div', { class: 'wrap' },
      el('button', { class: 'btn', onclick: () => go('exam') }, `← К вопросу ${ex.idx + 1}`),
      el('button', {
        class: 'btn',
        disabled: !ex.marked.some(Boolean),
        onclick: () => gotoQ(ex.marked.findIndex(Boolean)),
      }, 'Первый отмеченный'),
      el('button', {
        class: 'btn',
        disabled: ex.questions.every((q, i) => isAnswered(q, ex.answers[i])),
        onclick: () => gotoQ(ex.questions.findIndex((q, i) => !isAnswered(q, ex.answers[i]))),
      }, 'Первый без ответа'),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn primary', onclick: confirmFinish }, 'Завершить экзамен'),
    ));
  }

  // ---------------------------------------------------------------- results

  function viewResults() {
    const entry = db.history.find((h) => h.id === resultId);
    if (!entry) return el('div', { class: 'panel' }, 'Результат не найден.');
    const questions = entry.questions.map(unpackQuestion);
    const pct = Math.round((100 * entry.correct) / entry.total);
    const passCls = entry.passed ? 'pass' : 'fail';

    // per-day breakdown
    const byDay = new Map();
    questions.forEach((q, i) => {
      const r = byDay.get(q.day) || { total: 0, ok: 0 };
      r.total++;
      if (entry.result[i]) r.ok++;
      byDay.set(q.day, r);
    });
    const dayRows = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([d, r]) => {
      const p = Math.round((100 * r.ok) / r.total);
      const lvl = p >= 82.5 ? 'hi' : p >= 60 ? 'mid' : 'lo';
      return el('tr', null,
        el('td', { class: 'day-num' }, `Day ${String(d).padStart(2, '0')}`),
        el('td', null, CCNA.days[d] ? CCNA.days[d].title : ''),
        el('td', null, `${r.ok}/${r.total}`),
        el('td', { style: 'width:30%' }, el('div', { class: 'bar' }, el('i', { class: lvl, style: `width:${p}%` }))),
        el('td', null, `${p}%`));
    });

    const missed = questions.map((q, i) => ({ q, i })).filter(({ i }) => !entry.result[i]);
    const retake = () => {
      startExam(missed.map(({ q }) => ({ q, day: q.day, generated: q.generated })), `Работа над ошибками · дни ${daysLabel([...new Set(missed.map(({ q }) => q.day))])}`);
    };

    const seg = (v, label) => el('button', { 'aria-pressed': String(resultFilter === v), onclick: () => { resultFilter = v; render(); } }, label);
    const list = questions.map((q, i) => {
      const ok = entry.result[i];
      if (resultFilter === 'wrong' && ok) return null;
      if (resultFilter === 'marked' && !entry.marked[i]) return null;
      const d = el('details', { class: 'qdetail' },
        el('summary', null,
          el('span', { class: 'n' }, `#${i + 1}`),
          el('span', { class: 'r ' + (ok ? 'ok' : 'bad') }, ok ? '✓' : '✗'),
          el('span', { class: 's' }, plain(questionText(q))),
          el('span', { class: 'tag' }, `D${q.day}`)));
      // Render the body lazily on first open: long exams stay fast.
      d.addEventListener('toggle', () => {
        if (d.open && !d.querySelector('.body')) {
          d.append(el('div', { class: 'body stack' },
            renderQuestion(q, entry.answers[i], { locked: true, reveal: true }),
            explainEl(q, entry.answers[i])));
        }
      }, { once: false });
      return d;
    });

    const passPos = entry.passScore / 10;
    return el('div', { class: 'stack' },
      el('div', null, el('div', { class: 'eyebrow' }, `${entry.mode === 'exam' ? 'Экзамен' : 'Обучение'} · ${dateStr(entry.date)}`), el('h1', null, entry.title || 'Результат')),
      el('section', { class: 'panel' },
        el('div', { class: 'score-card' },
          el('div', null,
            el('div', { class: 'score-num' }, String(entry.score), el('small', null, ' / 1000')),
            el('div', { style: 'margin-top:8px' }, el('span', { class: 'verdict-pill ' + passCls }, entry.passed ? 'PASS' : 'FAIL'))),
          el('div', { class: 'stack', style: 'gap:6px' },
            el('div', null, `Правильно ${entry.correct} из ${entry.total} (${pct}%). Проходной балл ${entry.passScore}.`),
            el('div', { class: 'small muted' },
              `Время: ${clock(entry.elapsed)}` + (entry.timeLimit ? ` из ${clock(entry.timeLimit)}` : '') + (entry.timeUp ? ' · время вышло' : '') +
              ` · Дни: ${daysLabel(entry.days)}`),
            el('div', { class: 'scale', role: 'img', 'aria-label': `Балл ${entry.score} из 1000, проходной ${entry.passScore}` },
              el('div', { class: 'fill ' + passCls, style: `width:${entry.score / 10}%` }),
              el('div', { class: 'pass-mark', style: `left:${passPos}%` }, el('span', null, String(entry.passScore))),
              el('div', { class: 'ticks' }, el('span', null, '0'), el('span', null, '500'), el('span', null, '1000'))),
          )),
      ),
      el('div', { class: 'row' },
        missed.length ? el('button', { class: 'btn primary', onclick: retake }, `Повторить ошибки (${missed.length})`) : null,
        el('button', { class: 'btn', onclick: () => go('home') }, 'Новый экзамен'),
        el('button', { class: 'btn', onclick: () => go('history') }, 'История'),
      ),
      el('section', { class: 'panel stack' },
        el('h2', null, 'Результат по дням'),
        el('div', { class: 'table-wrap' }, el('table', { class: 'data' },
          el('thead', null, el('tr', null, el('th', null, 'День'), el('th', null, 'Тема'), el('th', null, 'Верно'), el('th', null, ''), el('th', null, '%'))),
          el('tbody', null, dayRows))),
      ),
      el('section', { class: 'stack' },
        el('div', { class: 'row' },
          el('h2', null, 'Разбор вопросов'),
          el('div', { class: 'spacer' }),
          el('div', { class: 'seg' },
            seg('all', `Все (${entry.total})`),
            seg('wrong', `Ошибки (${missed.length})`),
            seg('marked', `Отмеченные (${entry.marked.filter(Boolean).length})`))),
        el('div', { class: 'stack', style: 'gap:8px' }, list),
      ),
    );
  }

  // ---------------------------------------------------------------- history

  function viewHistory() {
    const h = db.history;
    if (!h.length) {
      return el('section', { class: 'panel stack' },
        el('h1', null, 'История'),
        el('p', { class: 'muted' }, 'Здесь появятся завершённые экзамены с баллом и разбором каждого вопроса.'),
        el('div', null, el('button', { class: 'btn primary', onclick: () => go('home') }, 'Начать экзамен')));
    }
    return el('div', { class: 'stack' },
      el('div', { class: 'row' },
        el('h1', null, 'История'),
        el('div', { class: 'spacer' }),
        el('button', {
          class: 'btn danger',
          onclick: () => openModal('Очистить историю?', 'Список экзаменов будет удалён. Статистика по вопросам сохранится.', [
            { label: 'Отмена' },
            { label: 'Очистить', cls: 'primary', run: () => { db.history = []; save(); render(); } },
          ]),
        }, 'Очистить')),
      el('section', { class: 'panel' }, el('div', { class: 'table-wrap' }, el('table', { class: 'data' },
        el('thead', null, el('tr', null,
          el('th', null, 'Дата'), el('th', null, 'Экзамен'), el('th', null, 'Режим'), el('th', null, 'Верно'), el('th', null, 'Балл'), el('th', null, ''))),
        el('tbody', null, h.map((e) => el('tr', { class: 'click', onclick: () => { resultId = e.id; resultFilter = 'all'; go('results'); } },
          el('td', { class: 'small' }, dateStr(e.date)),
          el('td', null, e.title || `Дни ${daysLabel(e.days)}`),
          el('td', { class: 'small muted' }, e.mode === 'exam' ? 'экзамен' : 'обучение'),
          el('td', null, `${e.correct}/${e.total}`),
          el('td', null, String(e.score)),
          el('td', null, el('span', { class: 'verdict-pill ' + (e.passed ? 'pass' : 'fail') }, e.passed ? 'PASS' : 'FAIL')))))))),
    );
  }

  // ---------------------------------------------------------------- bank

  function viewBank() {
    const days = sortedDays();
    if (!days.length) return el('div', { class: 'panel' }, 'Банк пуст.');
    if (!CCNA.days[bankDay]) bankDay = days[0].day;
    const d = CCNA.days[bankDay];
    const sel = el('select', { class: 'input', id: 'bank-day', onchange: (e) => { bankDay = Number(e.target.value); render(); } },
      days.map((x) => el('option', { value: String(x.day) }, `Day ${x.day} — ${x.title} (${x.questions.length})`)));
    sel.value = String(bankDay);
    const list = d.questions.map((raw, k) => {
      const q = instantiate({ q: raw, day: d.day }, false);
      const st = db.qstats[q.id];
      const det = el('details', { class: 'qdetail' },
        el('summary', null,
          el('span', { class: 'n' }, `${k + 1}`),
          el('span', { class: 'r ' + (st ? (st.lastWrong ? 'bad' : 'ok') : '') }, st ? (st.lastWrong ? '✗' : '✓') : '·'),
          el('span', { class: 's' }, plain(questionText(q))),
          el('span', { class: 'tag' }, q.type)));
      det.addEventListener('toggle', () => {
        if (det.open && !det.querySelector('.body')) {
          det.append(el('div', { class: 'body stack' },
            renderQuestion(q, correctAnswer(q), { locked: true, reveal: true }),
            explainEl(q, correctAnswer(q), { neutral: true }),
            st ? el('div', { class: 'small muted' }, `Встречался ${st.seen} раз, верно ${st.correct}.`) : null));
        }
      });
      return det;
    });
    return el('div', { class: 'stack' },
      el('div', { class: 'row' },
        el('h1', null, 'Банк вопросов'),
        el('div', { class: 'spacer' }),
        el('div', { style: 'min-width:0;flex:1 1 280px;max-width:420px' }, sel)),
      el('p', { class: 'muted small', style: 'margin:0' },
        `${d.titleRu ? d.titleRu + '. ' : ''}${d.topics.length ? 'Темы: ' + d.topics.join(', ') + '.' : ''}` +
        (d.generators.length ? ` Плюс генераторы: ${d.generators.map((g) => g.title || g.id).join(', ')}.` : '')),
      el('div', { class: 'stack', style: 'gap:8px' }, list),
      d.generators.length ? el('div', null, el('button', {
        class: 'btn',
        onclick: () => {
          db.settings.days = [d.day];
          db.settings.source = 'all';
          db.settings.generated = true;
          db.settings.mode = 'study';
          db.settings.count = 9999;
          save();
          startFromSettings();
        },
      }, `Тренировка дня ${d.day} в режиме обучения`)) : null,
    );
  }

  // ---------------------------------------------------------------- keyboard & timer

  document.addEventListener('keydown', (e) => {
    if (modalEl) {
      if (e.key === 'Escape') closeModal();
      return;
    }
    if (view !== 'exam' || !db.current) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' && e.target.type === 'text') return;
    if (tag === 'TEXTAREA' || tag === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return;
    const ex = db.current;
    const q = ex.questions[ex.idx];
    const k = e.key.toLowerCase();
    if (k === 'arrowright') { if (ex.idx < ex.questions.length - 1) gotoQ(ex.idx + 1); e.preventDefault(); }
    else if (k === 'arrowleft') { if (ex.idx > 0) gotoQ(ex.idx - 1); e.preventDefault(); }
    else if (k === 'm') toggleMark();
    else if (k === 'enter' && ex.mode === 'study' && !ex.revealed[ex.idx] && tag !== 'BUTTON') reveal();
    else if ((q.type === 'single' || q.type === 'multi') && !ex.revealed[ex.idx] && k.length === 1) {
      const pos = LETTERS.toLowerCase().indexOf(k);
      if (pos < 0 || pos >= q.view.length) return;
      const oi = q.view[pos];
      if (q.type === 'single') ex.answers[ex.idx] = oi;
      else {
        const cur = new Set(ex.answers[ex.idx] || []);
        if (cur.has(oi)) cur.delete(oi); else cur.add(oi);
        ex.answers[ex.idx] = [...cur];
      }
      save();
      render();
    }
  });

  setInterval(() => {
    const ex = db.current;
    if (!ex || (view !== 'exam' && view !== 'review')) return;
    ex.elapsed++;
    const t = document.getElementById('timer');
    if (t) {
      t.textContent = timerText();
      t.classList.toggle('low', !!ex.timeLimit && ex.timeLimit - ex.elapsed <= 300);
    }
    if (ex.timeLimit && ex.elapsed >= ex.timeLimit) {
      closeModal();
      finish(true);
      return;
    }
    if (ex.elapsed % 5 === 0) save();
  }, 1000);

  window.addEventListener('pagehide', save);

  // ---------------------------------------------------------------- boot

  async function boot() {
    const results = await Promise.all((CCNA.manifest || []).map((f) => loadScript('days/' + f)));
    results.forEach((ok, i) => { if (!ok) CCNA.errors.push(`Не удалось загрузить days/${CCNA.manifest[i]}`); });
    for (const def of db.customDays) applyCustomDay(def);
    rebuildIndex();
    const all = sortedDays().map((d) => d.day);
    db.settings.days = db.settings.days.filter((d) => CCNA.days[d]);
    if (!db.settings.days.length) db.settings.days = all;
    render();
  }

  boot();
})();

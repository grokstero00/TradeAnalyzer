/*
 * Question-bank registry.
 *
 * Every course day lives in its own file under days/ and calls
 * CCNA.registerDay({...}). The list of files to load is in days/manifest.js.
 * See README.md for the question format.
 */
(function () {
  'use strict';

  const TYPES = ['single', 'multi', 'match', 'order', 'fill'];

  function isIdx(v, len) {
    return Number.isInteger(v) && v >= 0 && v < len;
  }

  function validateQuestion(q) {
    if (!q || typeof q !== 'object') return 'вопрос не является объектом';
    if (typeof q.id !== 'string' || !q.id) return 'нет поля id';
    if (!TYPES.includes(q.type)) return `неизвестный type "${q.type}"`;
    if (typeof q.question !== 'string' || !q.question) return 'нет текста question';
    switch (q.type) {
      case 'single':
        if (!Array.isArray(q.options) || q.options.length < 2) return 'нужно минимум 2 options';
        if (!isIdx(q.answer, q.options.length)) return 'answer должен быть индексом варианта';
        break;
      case 'multi':
        if (!Array.isArray(q.options) || q.options.length < 3) return 'нужно минимум 3 options';
        if (!Array.isArray(q.answer) || q.answer.length < 2) return 'answer должен быть массивом из 2+ индексов';
        if (!q.answer.every((a) => isIdx(a, q.options.length))) return 'индекс в answer вне диапазона';
        break;
      case 'match':
        if (!Array.isArray(q.items) || q.items.length < 2) return 'нужно минимум 2 items';
        if (!Array.isArray(q.targets) || q.targets.length < 2) return 'нужно минимум 2 targets';
        if (!Array.isArray(q.answer) || q.answer.length !== q.items.length) return 'answer должен иметь столько же элементов, сколько items';
        if (!q.answer.every((a) => isIdx(a, q.targets.length))) return 'индекс в answer вне диапазона targets';
        break;
      case 'order':
        if (!Array.isArray(q.items) || q.items.length < 3) return 'нужно минимум 3 items (в правильном порядке)';
        break;
      case 'fill':
        if (typeof q.answer === 'string') q.answer = [q.answer];
        if (!Array.isArray(q.answer) || !q.answer.length) return 'answer должен быть списком допустимых ответов';
        break;
    }
    return null;
  }

  const rng = {
    int(min, max) {
      return min + Math.floor(Math.random() * (max - min + 1));
    },
    pick(arr) {
      return arr[Math.floor(Math.random() * arr.length)];
    },
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    /* Builds a single-choice question from the correct value and distractors. */
    choice(correct, distractors) {
      const uniq = [];
      for (const d of distractors) {
        const s = String(d);
        if (s !== String(correct) && !uniq.includes(s)) uniq.push(s);
      }
      const options = rng.shuffle([String(correct), ...uniq.slice(0, 3)]);
      return { options, answer: options.indexOf(String(correct)) };
    },
  };

  /* IPv4 helpers for question generators. */
  const ipv4 = {
    toInt(str) {
      return str.split('.').reduce((acc, o) => acc * 256 + Number(o), 0);
    },
    toStr(n) {
      return [24, 16, 8, 0].map((s) => Math.floor(n / 2 ** s) % 256).join('.');
    },
    maskStr(prefix) {
      return ipv4.toStr(prefix === 0 ? 0 : 2 ** 32 - 2 ** (32 - prefix));
    },
    network(ip, prefix) {
      const size = 2 ** (32 - prefix);
      return Math.floor(ipv4.toInt(ip) / size) * size;
    },
    broadcast(ip, prefix) {
      return ipv4.network(ip, prefix) + 2 ** (32 - prefix) - 1;
    },
    /* "172" -> "128 + 32 + 8 + 4" */
    weights(n) {
      const parts = [];
      for (let w = 128; w >= 1; w /= 2) if (n & w) parts.push(w);
      return parts.join(' + ');
    },
    random(R, prefix) {
      const first = prefix === 8 ? R.int(1, 126) : prefix === 16 ? R.int(128, 191) : R.int(192, 223);
      return `${first}.${R.int(0, 255)}.${R.int(0, 255)}.${R.int(1, 254)}`;
    },
  };

  window.CCNA = {
    days: {},
    manifest: [],
    errors: [],
    rng,
    ipv4,
    TYPES,
    validateQuestion,

    registerDay(def, meta) {
      const source = (meta && meta.source) || `day ${def && def.day}`;
      if (!def || !Number.isInteger(def.day) || def.day < 1) {
        this.errors.push(`${source}: поле day должно быть целым числом ≥ 1`);
        return false;
      }
      const seen = new Set();
      for (const other of Object.values(this.days)) {
        if (other.day !== def.day) other.questions.forEach((q) => seen.add(q.id));
      }
      const valid = [];
      for (const q of def.questions || []) {
        const problem = validateQuestion(q) || (seen.has(q.id) ? 'повторяющийся id' : null);
        if (problem) {
          this.errors.push(`День ${def.day}, ${q && q.id ? q.id : '?'}: ${problem}`);
          continue;
        }
        seen.add(q.id);
        valid.push(q);
      }
      this.days[def.day] = {
        day: def.day,
        title: def.title || `Day ${def.day}`,
        titleRu: def.titleRu || '',
        topics: def.topics || [],
        questions: valid,
        generators: Array.isArray(def.generators) ? def.generators : [],
        custom: !!(meta && meta.custom),
      };
      return true;
    },
  };
})();

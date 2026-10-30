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

  function validateLab(lab) {
    if (!lab || typeof lab !== 'object') return 'лаба не является объектом';
    if (typeof lab.id !== 'string' || !lab.id) return 'нет поля id';
    if (typeof lab.title !== 'string') return 'нет поля title';
    if (!Array.isArray(lab.devices) || !lab.devices.length) return 'нужен список devices';
    if (!(lab.tasks || []).length && !(lab.questions || []).length) return 'нужны tasks или questions';
    const names = new Set(lab.devices.map((d) => d.name));
    for (const l of lab.links || []) {
      if (!names.has(l[0]) || !names.has(l[2])) return `связь ${l.join(' ')} ссылается на неизвестное устройство`;
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
    hosts(prefix) {
      return prefix >= 31 ? 2 ** (32 - prefix) : 2 ** (32 - prefix) - 2;
    },
    /* Smallest prefix whose subnet fits `hosts` usable addresses. */
    prefixFor(hosts) {
      let p = 30;
      while (p > 0 && 2 ** (32 - p) - 2 < hosts) p--;
      return p;
    },
    /* Random subnetting task (network / broadcast / first / last / hosts) for one of `prefixes`. */
    subnetTask(R, prefixes, tag) {
      const p = R.pick(prefixes);
      const ip = ipv4.random(R, p >= 24 ? 24 : p >= 16 ? 16 : 8);
      const netN = ipv4.network(ip, p);
      const bcN = ipv4.broadcast(ip, p);
      const net = ipv4.toStr(netN);
      const bc = ipv4.toStr(bcN);
      const mask = ipv4.maskStr(p);
      const why = `Маска /${p} = ${mask}. Сеть ${net}, broadcast ${bc}, хосты ${ipv4.toStr(netN + 1)} – ${ipv4.toStr(bcN - 1)}.`;
      const kind = R.pick(['network', 'broadcast', 'first', 'last', 'hosts']);
      const base = { id: `gen-${tag}-${kind}-${ip}-${p}`, type: 'fill' };
      switch (kind) {
        case 'network':
          return Object.assign(base, { question: `Host ${ip}/${p}. What is the network (subnet) address?`, answer: [net], explanation: why });
        case 'broadcast':
          return Object.assign(base, { question: `Host ${ip}/${p}. What is the broadcast address of its subnet?`, answer: [bc], explanation: why });
        case 'first':
          return Object.assign(base, { question: `Host ${ip}/${p}. What is the first usable host address of its subnet?`, answer: [ipv4.toStr(netN + 1)], explanation: why });
        case 'last':
          return Object.assign(base, { question: `Host ${ip}/${p}. What is the last usable host address of its subnet?`, answer: [ipv4.toStr(bcN - 1)], explanation: why });
        default:
          return Object.assign(base, {
            question: `How many usable host addresses are in a /${p} subnet (mask ${mask})? (number)`,
            answer: [String(ipv4.hosts(p))],
            explanation: `Бит хоста: 32 − ${p} = ${32 - p}. 2^${32 - p} − 2 = ${ipv4.hosts(p)}.`,
          });
      }
    },
    random(R, prefix) {
      const first = prefix === 8 ? R.int(1, 126) : prefix === 16 ? R.int(128, 191) : R.int(192, 223);
      return `${first}.${R.int(0, 255)}.${R.int(0, 255)}.${R.int(1, 254)}`;
    },
  };

  window.CCNA = {
    days: {},
    labs: {},
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
      const labs = [];
      for (const lab of def.labs || []) {
        const problem = validateLab(lab) || (this.labs[lab.id] && this.labs[lab.id].day !== def.day ? 'повторяющийся id лабы' : null);
        if (problem) {
          this.errors.push(`День ${def.day}, лаба ${lab && lab.id ? lab.id : '?'}: ${problem}`);
          continue;
        }
        labs.push(lab);
        this.labs[lab.id] = { lab, day: def.day };
      }
      this.days[def.day] = {
        day: def.day,
        title: def.title || `Day ${def.day}`,
        titleRu: def.titleRu || '',
        topics: def.topics || [],
        questions: valid,
        generators: Array.isArray(def.generators) ? def.generators : [],
        labs,
        custom: !!(meta && meta.custom),
      };
      return true;
    },
  };
})();

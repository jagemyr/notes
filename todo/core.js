/*
 * Todo (jagemyr) – logik utan gränssnitt: läsa/skriva anteckningens text,
 * datum och upprepning. Fungerar både i webbläsaren (window.TodoCore) och i Node (tester).
 *
 * Textformat, en uppgift per rad (läsbart även i vanliga editorn):
 *   - [ ] Köp mjölk
 *   - [ ] Ta ut soporna 🔁 varje vecka 📅 2026-10-20
 *   - [x] Ring tandläkaren ✅ 2026-10-18
 */
(function (root) {
  'use strict';

  var RECURRENCES = [
    { key: 'dagligen', label: 'Dagligen' },
    { key: 'vardagar', label: 'Vardagar' },
    { key: 'varje vecka', label: 'Varje vecka' },
    { key: 'varannan vecka', label: 'Varannan vecka' },
    { key: 'varje månad', label: 'Varje månad' },
    { key: 'varje år', label: 'Varje år' }
  ];

  var WEEKDAYS = ['sön', 'mån', 'tis', 'ons', 'tors', 'fre', 'lör'];
  var MONTHS = ['jan', 'feb', 'mars', 'apr', 'maj', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'dec'];

  var TASK_RE = /^\s*[-*+]\s+\[( |x|X)\]\s?(.*)$/;
  var BULLET_RE = /^\s*[-*+]\s+(.*)$/;
  var RECUR_RE = /\s*🔁\s*(dagligen|vardagar|varje vecka|varannan vecka|varje månad|varje år)/i;
  var DUE_RE = /\s*📅\s*(\d{4}-\d{2}-\d{2})/;
  var DONE_RE = /\s*✅\s*(\d{4}-\d{2}-\d{2})/;

  // ---------- Datum (lokal tid, format ÅÅÅÅ-MM-DD) ----------

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function toIso(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function fromIso(iso) {
    var p = iso.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function today(now) {
    return toIso(now || new Date());
  }

  function addMonths(d, n) {
    var day = d.getDate();
    var r = new Date(d.getFullYear(), d.getMonth() + n, 1);
    var last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
    r.setDate(Math.min(day, last));
    return r;
  }

  function daysBetween(fromIsoDate, toIsoDate) {
    var a = fromIso(fromIsoDate);
    var b = fromIso(toIsoDate);
    return Math.round((b - a) / 86400000);
  }

  /** Nästa datum efter iso enligt upprepningsregeln. */
  function advance(iso, recur) {
    var d = fromIso(iso);
    switch (recur) {
      case 'dagligen':
        d.setDate(d.getDate() + 1);
        break;
      case 'vardagar':
        do {
          d.setDate(d.getDate() + 1);
        } while (d.getDay() === 0 || d.getDay() === 6);
        break;
      case 'varje vecka':
        d.setDate(d.getDate() + 7);
        break;
      case 'varannan vecka':
        d.setDate(d.getDate() + 14);
        break;
      case 'varje månad':
        d = addMonths(d, 1);
        break;
      case 'varje år':
        d = addMonths(d, 12);
        break;
      default:
        return null;
    }
    return toIso(d);
  }

  // ---------- Läsa och skriva text ----------

  function parse(text) {
    var tasks = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      if (!line.trim()) {
        return;
      }
      var done = false;
      var rest;
      var m = TASK_RE.exec(line);
      if (m) {
        done = m[1] !== ' ';
        rest = m[2];
      } else {
        var b = BULLET_RE.exec(line);
        rest = b ? b[1] : line.trim();
      }

      var recur = null;
      var due = null;
      var doneDate = null;
      var r;
      if ((r = RECUR_RE.exec(rest))) {
        recur = r[1].toLowerCase();
        rest = rest.replace(RECUR_RE, '');
      }
      if ((r = DUE_RE.exec(rest))) {
        due = r[1];
        rest = rest.replace(DUE_RE, '');
      }
      if ((r = DONE_RE.exec(rest))) {
        doneDate = r[1];
        rest = rest.replace(DONE_RE, '');
      }

      var title = rest.trim();
      if (!title) {
        return;
      }
      tasks.push({ title: title, done: done, recur: recur, due: due, doneDate: done ? doneDate : null });
    });
    return tasks;
  }

  function serializeTask(t) {
    var line = '- [' + (t.done ? 'x' : ' ') + '] ' + t.title.replace(/\s*\n\s*/g, ' ').trim();
    if (t.recur) line += ' 🔁 ' + t.recur;
    if (t.due) line += ' 📅 ' + t.due;
    if (t.done && t.doneDate) line += ' ✅ ' + t.doneDate;
    return line;
  }

  function serialize(tasks) {
    return tasks.map(serializeTask).join('\n');
  }

  // ---------- Avbockning och återkommande ----------

  function complete(task, todayIso) {
    task.done = true;
    task.doneDate = todayIso;
  }

  function uncomplete(task) {
    task.done = false;
    task.doneDate = null;
  }

  /**
   * Datum då en avbockad återkommande uppgift kommer tillbaka:
   * första förekomsten efter avbockningsdagen, räknat från uppgiftens datum.
   */
  function returnDate(task) {
    if (!task.recur || !task.done) {
      return null;
    }
    var doneOn = task.doneDate || task.due;
    if (!doneOn) {
      return null;
    }
    var next = advance(task.due || doneOn, task.recur);
    var guard = 0;
    while (next <= doneOn && guard < 5000) {
      next = advance(next, task.recur);
      guard++;
    }
    return next;
  }

  /** Öppnar återkommande uppgifter vars nästa datum har kommit. Returnerar true om något ändrades. */
  function rollover(tasks, todayIso) {
    var changed = false;
    tasks.forEach(function (t) {
      var back = returnDate(t);
      if (back && back <= todayIso) {
        // Hoppa fram till senaste förekomsten fram till idag, så att en lång
        // frånvaro inte ger en uppgift som varit förfallen i månader.
        var guard = 0;
        var next = advance(back, t.recur);
        while (next <= todayIso && guard < 5000) {
          back = next;
          next = advance(back, t.recur);
          guard++;
        }
        t.done = false;
        t.doneDate = null;
        t.due = back;
        changed = true;
      }
    });
    return changed;
  }

  // ---------- Text för visning ----------

  function recurLabel(key) {
    for (var i = 0; i < RECURRENCES.length; i++) {
      if (RECURRENCES[i].key === key) return RECURRENCES[i].label;
    }
    return key;
  }

  function formatDate(iso, todayIso) {
    var diff = daysBetween(todayIso, iso);
    if (diff === 0) return 'Idag';
    if (diff === 1) return 'Imorgon';
    if (diff === -1) return 'Igår';
    var d = fromIso(iso);
    var s = WEEKDAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
    if (d.getFullYear() !== fromIso(todayIso).getFullYear()) {
      s += ' ' + d.getFullYear();
    }
    return s;
  }

  /** 'overdue' | 'today' | 'upcoming' | null */
  function dueStatus(task, todayIso) {
    if (task.done || !task.due) return null;
    if (task.due < todayIso) return 'overdue';
    if (task.due === todayIso) return 'today';
    return 'upcoming';
  }

  function preview(tasks) {
    var open = tasks.filter(function (t) { return !t.done; });
    var head = open.length + ' kvar';
    if (!open.length) {
      return tasks.length ? 'Allt klart' : 'Tom lista';
    }
    var titles = open.slice(0, 3).map(function (t) { return t.title; }).join(', ');
    return (head + ': ' + titles).slice(0, 90);
  }

  var api = {
    RECURRENCES: RECURRENCES,
    parse: parse,
    serialize: serialize,
    complete: complete,
    uncomplete: uncomplete,
    returnDate: returnDate,
    rollover: rollover,
    advance: advance,
    today: today,
    formatDate: formatDate,
    recurLabel: recurLabel,
    dueStatus: dueStatus,
    preview: preview
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.TodoCore = api;
  }
})(typeof self !== 'undefined' ? self : this);

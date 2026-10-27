/*
 * NWO (jagemyr) – mall för Standard Notes med fälten
 * Företag, Vara, Fraktbolag och Bedömt levdatum.
 *
 * Fälten sparas som vanlig text i anteckningen, en rad per fält:
 *
 *   Företag: Exempelbolaget
 *   Vara: Skruvdragare
 *   Fraktbolag: PostNord
 *   Bedömt levdatum: 2026-11-03
 *
 * Rader som inte är fält (t.ex. något som skrivits i en annan editor)
 * sparas oförändrade under fälten.
 */
(function () {
  'use strict';

  var VERSION = '1.0.1';
  var NOT_CONNECTED_HINT_MS = 2500;
  var PREVIEW_LENGTH = 90;
  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

  // Ordningen här är ordningen i anteckningen. Alias gör att rader skrivna för hand också känns igen.
  var FIELDS = [
    { key: 'foretag', label: 'Företag', aliases: ['foretag', 'företag'] },
    { key: 'vara', label: 'Vara', aliases: ['vara'] },
    { key: 'fraktbolag', label: 'Fraktbolag', aliases: ['fraktbolag', 'frakt'] },
    { key: 'levdatum', label: 'Bedömt levdatum', aliases: ['bedömt levdatum', 'bedomt levdatum', 'bedömt leveransdatum', 'levdatum', 'leveransdatum'] }
  ];

  var el = {
    notice: document.getElementById('notice'),
    lockedBanner: document.getElementById('locked-banner'),
    inputs: Array.prototype.slice.call(document.querySelectorAll('[data-key]')),
    date: document.getElementById('levdatum'),
    clearDate: document.getElementById('clear-date'),
    when: document.getElementById('when'),
    filled: document.getElementById('filled'),
    saveState: document.getElementById('save-state')
  };

  var state = {
    connected: false,
    note: null,
    locked: false,
    values: emptyValues(),
    rest: '',
    lastSentText: null,
    // De senaste texterna vi själva har sparat. En sparning kan komma tillbaka från appen
    // efter att man har skrivit vidare, och ska då inte skriva över fälten.
    sentTexts: []
  };

  // ---------- Textformat ----------

  function emptyValues() {
    var values = {};
    FIELDS.forEach(function (f) { values[f.key] = ''; });
    return values;
  }

  function fieldByLabel(label) {
    var wanted = label.trim().toLowerCase();
    for (var i = 0; i < FIELDS.length; i++) {
      if (FIELDS[i].aliases.indexOf(wanted) !== -1) return FIELDS[i];
    }
    return null;
  }

  function parse(text) {
    var values = emptyValues();
    var seen = {};
    var rest = [];
    String(text || '').replace(/\r\n?/g, '\n').split('\n').forEach(function (line) {
      var m = /^\s*([^:]{1,40}?)\s*:(.*)$/.exec(line);
      var field = m && fieldByLabel(m[1]);
      if (field && !seen[field.key]) {
        seen[field.key] = true;
        values[field.key] = m[2].trim();
      } else {
        rest.push(line);
      }
    });
    while (rest.length && !rest[0].trim()) rest.shift();
    while (rest.length && !rest[rest.length - 1].trim()) rest.pop();
    return { values: values, rest: rest.join('\n') };
  }

  function serialize(values, rest) {
    var lines = FIELDS.map(function (f) {
      var v = oneLine(values[f.key]);
      return f.label + ':' + (v ? ' ' + v : '');
    });
    if (rest) lines.push('', rest);
    return lines.join('\n');
  }

  function oneLine(value) {
    return String(value || '').replace(/\s*\n\s*/g, ' ').trim();
  }

  // ---------- Datum ----------

  /** "2026-11-03" → { y, m, d } eller null om det inte är ett riktigt datum. */
  function parseIso(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    var check = new Date(Date.UTC(y, mo - 1, d));
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
    return { y: y, m: mo, d: d };
  }

  function daysFromToday(date) {
    var now = new Date();
    var today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((Date.UTC(date.y, date.m - 1, date.d) - today) / 86400000);
  }

  function longDate(date) {
    var js = new Date(date.y, date.m - 1, date.d);
    var opts = { weekday: 'long', day: 'numeric', month: 'long' };
    if (date.y !== new Date().getFullYear()) opts.year = 'numeric';
    var text;
    try {
      text = js.toLocaleDateString('sv-SE', opts);
    } catch (e) {
      text = date.d + ' ' + MONTHS[date.m - 1] + ' ' + date.y;
    }
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function shortDate(date) {
    var text = date.d + ' ' + MONTHS[date.m - 1];
    return date.y !== new Date().getFullYear() ? text + ' ' + date.y : text;
  }

  function relative(days) {
    if (days === 0) return 'idag';
    if (days === 1) return 'imorgon';
    if (days === -1) return 'igår';
    if (days > 1) return 'om ' + days + ' dagar';
    return 'för ' + (-days) + ' dagar sedan';
  }

  // ---------- Diagnos (visas bara om Standard Notes inte svarar) ----------

  var diagInfo = { errors: [], messages: 0, lastMessage: '' };
  window.addEventListener('error', function (e) {
    diagInfo.errors.push(String(e.message || e).slice(0, 120));
  });
  window.addEventListener('unhandledrejection', function (e) {
    diagInfo.errors.push('promise: ' + String(e.reason).slice(0, 100));
  });
  window.addEventListener('message', function (e) {
    diagInfo.messages++;
    var d = e.data, kind = typeof d;
    if (kind === 'string') { try { d = JSON.parse(d); kind = 'json-sträng'; } catch (x) { /* ren sträng */ } }
    diagInfo.lastMessage = 'origin=' + e.origin + ' typ=' + kind + (d && d.action ? ' action=' + d.action : '');
  }, true);

  function diagText() {
    var m = /Chrome\/([\d.]+)/.exec(navigator.userAgent);
    var ref = '';
    try { ref = document.referrer ? new URL(document.referrer).origin : '(tom)'; } catch (e) { ref = '(ogiltig)'; }
    return [
      'Version: ' + VERSION,
      'WebView: ' + (m ? 'Chrome ' + m[1] : navigator.userAgent.slice(0, 80)),
      'I iframe: ' + (window.parent !== window),
      'Referrer: ' + ref,
      'Meddelanden mottagna: ' + diagInfo.messages + (diagInfo.lastMessage ? ' (senast ' + diagInfo.lastMessage + ')' : ''),
      'Fel: ' + (diagInfo.errors.length ? diagInfo.errors.join(' | ') : 'inga')
    ].join('\n');
  }

  // ---------- Anslutning ----------

  var relay = new ComponentRelay({
    targetWindow: window,
    options: { coallesedSaving: true, coallesedSavingDelay: 250 },
    onReady: function () {
      state.connected = true;
      el.notice.hidden = true;
      setSaveState('', '');
    }
  });

  setTimeout(function () {
    if (!state.connected) {
      el.notice.hidden = false;
      document.getElementById('diag').textContent = diagText();
      setSaveState('Ej ansluten', 'error');
    }
  }, NOT_CONNECTED_HINT_MS);

  // ---------- Från Standard Notes ----------

  relay.streamContextItem(function (note) {
    var isNewNote = !state.note || state.note.uuid !== note.uuid;
    var wasLocked = state.locked;
    state.note = note;
    state.locked = isLocked(note);

    if (isNewNote) {
      state.lastSentText = null;
      state.sentTexts = [];
      setSaveState('', '');
    }

    var textChanged = false;
    if (!note.isMetadataUpdate) {
      var incoming = (note.content && note.content.text) || '';
      // Vår egen sparning som kommer tillbaka ska inte skriva över det man håller på att skriva.
      var isEcho = !isNewNote && (state.sentTexts.indexOf(incoming) !== -1 || incoming === serialize(state.values, state.rest));
      if (!isEcho) {
        var parsed = parse(incoming);
        state.values = parsed.values;
        state.rest = parsed.rest;
        textChanged = true;
      }
    }

    if (isNewNote || textChanged || wasLocked !== state.locked) {
      render(isNewNote);
    }
  });

  function isLocked(note) {
    // Egen uppslagning: relayens getItemAppDataValue kraschar om domänen saknas i appData.
    var appData = note.content && note.content.appData;
    var sn = appData && appData['org.standardnotes.sn'];
    return Boolean(sn && sn.locked);
  }

  // ---------- Till Standard Notes ----------

  function save() {
    if (!state.note || state.locked) return;
    var note = state.note;
    var text = serialize(state.values, state.rest);
    var previewText = preview(state.values);
    setSaveState('Sparar…', '');
    relay.saveItemWithPresave(note, function () {
      note.content.text = text;
      note.content.preview_plain = previewText;
      note.content.preview_html = null;
      state.lastSentText = text;
      state.sentTexts.push(text);
      if (state.sentTexts.length > 20) state.sentTexts.shift();
    }, function () {
      if (state.note && state.note.uuid === note.uuid) {
        setSaveState('Sparat', 'saved');
      }
    });
  }

  /** Förhandsvisningen i anteckningslistan, t.ex. "Skruvdragare · Exempelbolaget · PostNord · lev 3 nov". */
  function preview(values) {
    var parts = [values.vara, values.foretag, values.fraktbolag].map(oneLine).filter(Boolean);
    if (values.levdatum) {
      var date = parseIso(values.levdatum);
      parts.push('lev ' + (date ? shortDate(date) : oneLine(values.levdatum)));
    }
    return parts.join(' · ').slice(0, PREVIEW_LENGTH);
  }

  // ---------- Händelser ----------

  el.inputs.forEach(function (input, index) {
    var onEdit = function () {
      if (state.locked || !state.note) return;
      var value = input.value;
      if (state.values[input.dataset.key] === value) return;
      state.values[input.dataset.key] = value;
      if (input.type === 'date') renderDate();
      renderFilled();
      save();
    };
    input.addEventListener('input', onEdit);
    // Vissa Android-datumväljare skickar bara change.
    input.addEventListener('change', onEdit);

    // Enter hoppar till nästa fält (ingen <form>, se README).
    input.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' || input.type === 'date') return;
      event.preventDefault();
      setTimeout(function () {
        var next = el.inputs[index + 1];
        if (next) next.focus(); else input.blur();
      }, 0);
    });
  });

  el.clearDate.addEventListener('click', function () {
    if (state.locked || !state.note) return;
    state.values.levdatum = '';
    el.date.value = '';
    renderDate();
    renderFilled();
    save();
  });

  // Uppdatera "om N dagar" när man kommer tillbaka till appen en annan dag.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) renderDate();
  });

  // ---------- Rendering ----------

  function render(isNewNote) {
    el.lockedBanner.hidden = !state.locked;
    el.inputs.forEach(function (input) {
      var key = input.dataset.key;
      var value = state.values[key] || '';
      if (input.type === 'date') {
        // Datumväljaren kan bara visa ÅÅÅÅ-MM-DD; annan text står kvar i anteckningen och visas under fältet.
        var iso = parseIso(value) ? value : '';
        if (input.value !== iso) input.value = iso;
        input.disabled = !state.note || state.locked;
      } else {
        if (input.value !== value) input.value = value;
        input.disabled = !state.note;
        input.readOnly = state.locked;
      }
    });
    renderDate();
    renderFilled();
    if (isNewNote) {
      var page = document.querySelector('.page');
      if (page) page.scrollTop = 0;
    }
  }

  function renderDate() {
    var value = state.values.levdatum || '';
    var date = parseIso(value);
    el.date.classList.toggle('empty', !el.date.value);
    el.clearDate.hidden = !value || state.locked;

    el.when.textContent = '';
    if (!value) {
      el.when.hidden = true;
      return;
    }
    el.when.hidden = false;
    if (!date) {
      el.when.textContent = 'I anteckningen står: ' + value;
      return;
    }
    var days = daysFromToday(date);
    var rel = document.createElement('span');
    rel.textContent = relative(days);
    if (days < 0) rel.className = 'late';
    else if (days <= 1) rel.className = 'soon';
    el.when.appendChild(document.createTextNode(longDate(date) + ' · '));
    el.when.appendChild(rel);
  }

  function renderFilled() {
    var count = FIELDS.filter(function (f) { return oneLine(state.values[f.key]); }).length;
    el.filled.textContent = count + ' av ' + FIELDS.length + ' ifyllda';
  }

  function setSaveState(label, kind) {
    el.saveState.textContent = label;
    el.saveState.className = 'save-state' + (kind ? ' ' + kind : '');
  }
})();

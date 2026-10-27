/*
 * NWO (jagemyr) – mall för Standard Notes med fälten
 * Företag, Varor, Fraktbolag, Beställd, Skickad och Bedömt levdatum.
 *
 * Fälten sparas som vanlig text i anteckningen, en rad per fält och en Vara-rad per vara:
 *
 *   Företag: Exempelbolaget
 *   Vara: Skruvdragare
 *   Vara: Bitsats
 *   Fraktbolag: PostNord
 *   Beställd: 2026-10-27
 *   Skickad: 2026-10-29
 *   Bedömt levdatum: 2026-11-03
 *
 * Rader som inte är fält (t.ex. något som skrivits i en annan editor)
 * sparas oförändrade under fälten.
 */
(function () {
  'use strict';

  var VERSION = '1.2.0';
  var NOT_CONNECTED_HINT_MS = 2500;
  var PREVIEW_LENGTH = 90;
  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

  // Ordningen här är ordningen i anteckningen. Alias gör att rader skrivna för hand också känns igen.
  var FIELDS = [
    { key: 'foretag', label: 'Företag', aliases: ['foretag', 'företag'] },
    // multi: fältet kan förekomma flera gånger, en rad per vara.
    { key: 'vara', label: 'Vara', multi: true, aliases: ['vara', 'varor'] },
    { key: 'fraktbolag', label: 'Fraktbolag', aliases: ['fraktbolag', 'frakt'] },
    { key: 'bestalld', label: 'Beställd', aliases: ['beställd', 'bestalld', 'beställt', 'beställning', 'beställningsdatum', 'orderdatum'] },
    { key: 'skickad', label: 'Skickad', aliases: ['skickad', 'skickat', 'skickades', 'skickat datum', 'avsänd'] },
    // late: ett passerat datum visas i rött (leveransen borde ha kommit).
    { key: 'levdatum', label: 'Bedömt levdatum', late: true, aliases: ['bedömt levdatum', 'bedomt levdatum', 'bedömt leveransdatum', 'levdatum', 'leveransdatum'] }
  ];

  var el = {
    notice: document.getElementById('notice'),
    lockedBanner: document.getElementById('locked-banner'),
    inputs: Array.prototype.slice.call(document.querySelectorAll('[data-key]')),
    items: document.getElementById('items'),
    itemsLabel: document.getElementById('items-label'),
    addItem: document.getElementById('add-item'),
    itemTemplate: document.getElementById('item-template'),
    fraktbolag: document.querySelector('[data-key="fraktbolag"]'),
    filled: document.getElementById('filled'),
    saveState: document.getElementById('save-state')
  };

  // Ett block per datumfält: väljaren, knapparna Idag och Ta bort, och raden under.
  var dateFields = Array.prototype.slice.call(document.querySelectorAll('[data-date-field]')).map(function (block) {
    var key = block.getAttribute('data-date-field');
    return {
      key: key,
      field: FIELDS.filter(function (f) { return f.key === key; })[0],
      input: block.querySelector('input[type="date"]'),
      today: block.querySelector('[data-action="today"]'),
      clear: block.querySelector('[data-action="clear"]'),
      when: block.querySelector('.when')
    };
  });

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
    FIELDS.forEach(function (f) { values[f.key] = f.multi ? [] : ''; });
    return values;
  }

  /** Varorna som faktiskt har text (tomma rader i formuläret sparas inte). */
  function filledItems(values) {
    return values.vara.map(oneLine).filter(Boolean);
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
      if (field && field.multi) {
        var item = m[2].trim();
        if (item) values[field.key].push(item);
      } else if (field && !seen[field.key]) {
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
    var lines = [];
    FIELDS.forEach(function (f) {
      if (f.multi) {
        var items = values[f.key].map(oneLine).filter(Boolean);
        // En tom rad behålls så att mallen syns även i andra editorer.
        if (!items.length) items = [''];
        items.forEach(function (item) { lines.push(f.label + ':' + (item ? ' ' + item : '')); });
        return;
      }
      var v = oneLine(values[f.key]);
      lines.push(f.label + ':' + (v ? ' ' + v : ''));
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

  function todayIso() {
    var now = new Date();
    return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  }

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
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

  /**
   * Förhandsvisningen i anteckningslistan, t.ex. "Skruvdragare +2 · Exempelbolaget · PostNord · lev 3 nov".
   * Första varan visas och "+N" för resten. Datumet är det senaste steget som är ifyllt:
   * bedömt levdatum, annars skickad, annars beställd.
   */
  function preview(values) {
    var items = filledItems(values);
    var itemText = items.length ? items[0] + (items.length > 1 ? ' +' + (items.length - 1) : '') : '';
    var parts = [itemText, values.foretag, values.fraktbolag].map(oneLine).filter(Boolean);
    var steps = [['levdatum', 'lev'], ['skickad', 'skickad'], ['bestalld', 'beställd']];
    for (var i = 0; i < steps.length; i++) {
      var value = oneLine(values[steps[i][0]]);
      if (!value) continue;
      var date = parseIso(value);
      parts.push(steps[i][1] + ' ' + (date ? shortDate(date) : value));
      break;
    }
    return parts.join(' · ').slice(0, PREVIEW_LENGTH);
  }

  // ---------- Händelser ----------

  el.inputs.forEach(function (input) {
    var onEdit = function () {
      if (state.locked || !state.note) return;
      var value = input.value;
      if (state.values[input.dataset.key] === value) return;
      state.values[input.dataset.key] = value;
      if (input.type === 'date') renderDates();
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
      setTimeout(function () { focusNext(input); }, 0);
    });
  });

  /** Nästa fält i formuläret, räknat i sidans ordning (varuraderna kommer och går). */
  function focusNext(input) {
    var all = Array.prototype.slice.call(document.querySelectorAll('.fields input'));
    var next = all[all.indexOf(input) + 1];
    if (next) next.focus(); else input.blur();
  }

  // ---------- Varor ----------

  function rowIndex(target) {
    var row = target.closest('.item');
    return row ? Array.prototype.indexOf.call(el.items.children, row) : -1;
  }

  el.items.addEventListener('input', function (event) {
    if (!event.target.classList.contains('item-input')) return;
    if (state.locked || !state.note) return;
    var index = rowIndex(event.target);
    if (index < 0) return;
    state.values.vara[index] = event.target.value;
    renderItems();
    renderFilled();
    save();
  });

  el.items.addEventListener('click', function (event) {
    var button = event.target.closest('.item-remove');
    if (!button || state.locked || !state.note) return;
    var index = rowIndex(button);
    if (index < 0) return;
    state.values.vara.splice(index, 1);
    renderItems();
    renderFilled();
    save();
  });

  // Enter på en vara med text ger en ny rad under; Enter på en tom rad går vidare till Fraktbolag.
  el.items.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' || !event.target.classList.contains('item-input')) return;
    event.preventDefault();
    if (state.locked) return;
    var index = rowIndex(event.target);
    if (!oneLine(event.target.value)) {
      setTimeout(function () { el.fraktbolag.focus(); }, 0);
      return;
    }
    var next = state.values.vara[index + 1];
    if (next === undefined || oneLine(next)) {
      state.values.vara.splice(index + 1, 0, '');
    }
    setTimeout(function () { renderItems(index + 1); }, 0);
  });

  el.addItem.addEventListener('click', function () {
    if (state.locked || !state.note) return;
    var items = state.values.vara;
    // Återanvänd en tom sista rad i stället för att lägga till en till.
    if (!items.length || oneLine(items[items.length - 1])) items.push('');
    renderItems(items.length - 1);
  });

  dateFields.forEach(function (d) {
    if (d.today) {
      d.today.addEventListener('click', function () { setDate(d, todayIso()); });
    }
    d.clear.addEventListener('click', function () { setDate(d, ''); });
  });

  function setDate(d, value) {
    if (state.locked || !state.note) return;
    state.values[d.key] = value;
    d.input.value = value;
    renderDates();
    renderFilled();
    save();
  }

  // Uppdatera "om N dagar" när man kommer tillbaka till appen en annan dag.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) renderDates();
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
    renderItems();
    renderDates();
    renderFilled();
    if (isNewNote) {
      var page = document.querySelector('.page');
      if (page) page.scrollTop = 0;
    }
  }

  /** Ritar varuraderna. Raderna byggs bara om när antalet ändras, så att fokus och markör står kvar. */
  function renderItems(focusIndex) {
    var items = state.values.vara;
    if (!items.length) items.push('');
    var editable = Boolean(state.note) && !state.locked;

    if (el.items.children.length !== items.length) {
      el.items.textContent = '';
      items.forEach(function () {
        el.items.appendChild(el.itemTemplate.content.firstElementChild.cloneNode(true));
      });
    }

    Array.prototype.forEach.call(el.items.children, function (row, i) {
      var input = row.querySelector('.item-input');
      if (input.value !== items[i]) input.value = items[i];
      input.disabled = !state.note;
      input.readOnly = state.locked;
      input.setAttribute('aria-label', 'Vara ' + (i + 1));
      // Den enda raden går inte att ta bort så länge den är tom.
      row.querySelector('.item-remove').hidden = !editable || (items.length === 1 && !oneLine(items[0]));
    });

    var count = filledItems(state.values).length;
    el.itemsLabel.textContent = count > 1 ? 'Varor (' + count + ')' : 'Varor';
    el.addItem.hidden = !editable;

    if (typeof focusIndex === 'number' && el.items.children[focusIndex]) {
      el.items.children[focusIndex].querySelector('.item-input').focus();
    }
  }

  function renderDates() {
    dateFields.forEach(renderDate);
  }

  function renderDate(d) {
    var value = state.values[d.key] || '';
    var date = parseIso(value);
    var editable = Boolean(state.note) && !state.locked;
    d.input.classList.toggle('empty', !d.input.value);
    d.clear.hidden = !value || !editable;
    if (d.today) d.today.hidden = Boolean(value) || !editable;

    d.when.textContent = '';
    if (!value) {
      d.when.hidden = true;
      return;
    }
    d.when.hidden = false;
    if (!date) {
      d.when.textContent = 'I anteckningen står: ' + value;
      return;
    }
    var days = daysFromToday(date);
    var rel = document.createElement('span');
    rel.textContent = relative(days);
    if (d.field && d.field.late) {
      if (days < 0) rel.className = 'late';
      else if (days <= 1) rel.className = 'soon';
    }
    d.when.appendChild(document.createTextNode(longDate(date) + ' · '));
    d.when.appendChild(rel);
  }

  function renderFilled() {
    var count = FIELDS.filter(function (f) {
      return f.multi ? filledItems(state.values).length > 0 : oneLine(state.values[f.key]);
    }).length;
    el.filled.textContent = count + ' av ' + FIELDS.length + ' ifyllda';
  }

  function setSaveState(label, kind) {
    el.saveState.textContent = label;
    el.saveState.className = 'save-state' + (kind ? ' ' + kind : '');
  }
})();

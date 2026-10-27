/*
 * NWO (jagemyr) – beställningar i Standard Notes. En anteckning kan hålla flera
 * beställningar, var och en med Företag, en eller flera Varor, Fraktbolag, Beställd,
 * Skickad, Bedömt levdatum och Levererad.
 *
 * Allt sparas som vanlig text i anteckningen: ett block per beställning, en rad per
 * fält, en Vara-rad per vara och en tom rad mellan beställningarna. En levererad vara
 * får ✅ och datum efter namnet; Levererad fylls i när alla varor är levererade.
 *
 *   Företag: Webbutiken
 *   Vara: Skruvdragare ✅ 2026-10-29
 *   Vara: Bitsats
 *   Fraktbolag: PostNord
 *   Beställd: 2026-10-27
 *   Skickad:
 *   Bedömt levdatum: 2026-11-03
 *   Levererad:
 *
 * Rader som inte är fält (t.ex. något som skrivits i en annan editor) ligger kvar
 * oförändrade: i sin beställning om de står i ett block med fält, annars sist.
 */
(function () {
  'use strict';

  var VERSION = '2.2.0';
  var NOT_CONNECTED_HINT_MS = 2500;
  var CONFIRM_MS = 3000;
  var SETTLE_MS = 700;
  var PREVIEW_LENGTH = 90;
  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  var FIELD_LINE = /^\s*([^:]{1,40}?)\s*:(.*)$/;
  // "Skruvdragare ✅ 2026-10-29": bocken och det som står efter den (helst ett datum).
  var DONE_MARK = /\s*✅\s*(.*?)\s*$/;
  // Levererad utan datum (t.ex. bara ✅ skrivet för hand).
  var DONE_NO_DATE = 'ja';

  // Förslag under Fraktbolag. Egna knappar i stället för <datalist>: Safaris förslagsfönster
  // öppnas mitt i tangenttrycket och kan få tangenten att upprepas (PPPP…).
  var CARRIERS = ['PostNord', 'DHL', 'Budbee', 'Instabox', 'Bring', 'DB Schenker', 'UPS', 'FedEx', 'Airmee', 'Early Bird'];

  // Ordningen här är ordningen i anteckningen. Alias gör att rader skrivna för hand också känns igen.
  var FIELDS = [
    { key: 'foretag', label: 'Företag', aliases: ['foretag', 'företag'] },
    // multi: en rad per vara.
    { key: 'vara', label: 'Vara', multi: true, aliases: ['vara', 'varor'] },
    { key: 'fraktbolag', label: 'Fraktbolag', aliases: ['fraktbolag', 'frakt'] },
    { key: 'bestalld', label: 'Beställd', aliases: ['beställd', 'bestalld', 'beställt', 'beställning', 'beställningsdatum', 'orderdatum'] },
    { key: 'skickad', label: 'Skickad', aliases: ['skickad', 'skickat', 'skickades', 'skickat datum', 'avsänd'] },
    // late: ett passerat datum visas i rött (leveransen borde ha kommit).
    { key: 'levdatum', label: 'Bedömt levdatum', late: true, aliases: ['bedömt levdatum', 'bedomt levdatum', 'bedömt leveransdatum', 'levdatum', 'leveransdatum'] },
    { key: 'levererad', label: 'Levererad', aliases: ['levererad', 'levererat', 'mottagen', 'mottaget', 'hämtad', 'hämtat'] }
  ];

  // Statusen i listan visar det senaste steget som är ifyllt (levererad visas för sig).
  var STEPS = [
    { key: 'levdatum', label: 'Lev', preview: 'lev' },
    { key: 'skickad', label: 'Skickad', preview: 'skickad' },
    { key: 'bestalld', label: 'Beställd', preview: 'beställd' }
  ];

  var el = {
    page: document.querySelector('.page'),
    notice: document.getElementById('notice'),
    lockedBanner: document.getElementById('locked-banner'),
    orders: document.getElementById('orders'),
    doneSection: document.getElementById('done-section'),
    doneTitle: document.getElementById('done-title'),
    doneList: document.getElementById('done-list'),
    clearDone: document.getElementById('clear-done'),
    addOrder: document.getElementById('add-order'),
    template: document.getElementById('order-template'),
    itemTemplate: document.getElementById('item-template'),
    count: document.getElementById('count'),
    saveState: document.getElementById('save-state')
  };

  var state = {
    connected: false,
    note: null,
    locked: false,
    orders: [],
    rest: '',
    expanded: -1,
    confirmIndex: -1,
    confirmClear: false,
    confirmTimer: null,
    // En beställning som just blev levererad står kvar en stund innan den flyttas ner.
    settlingIndex: -1,
    settleTimer: null,
    lastSentText: null,
    // De senaste texterna vi själva har sparat. En sparning kan komma tillbaka från appen
    // efter att man har skrivit vidare, och ska då inte skriva över fälten.
    sentTexts: []
  };

  // ---------- Beställningar ----------

  function emptyOrder() {
    var values = {};
    FIELDS.forEach(function (f) { values[f.key] = f.multi ? [] : ''; });
    return { values: values, extra: [] };
  }

  function emptyItem() {
    return { text: '', done: '' };
  }

  /** Varorna som har text (tomma rader i formuläret sparas inte). */
  function filledItems(order) {
    return order.values.vara.filter(function (item) { return oneLine(item.text); });
  }

  function itemNames(order) {
    return filledItems(order).map(function (item) { return oneLine(item.text); });
  }

  /** En beställning utan något ifyllt sparas inte (den finns bara i formuläret). */
  function hasContent(order) {
    return FIELDS.some(function (f) {
      return f.multi ? filledItems(order).length > 0 : oneLine(order.values[f.key]);
    }) || order.extra.some(function (line) { return line.trim(); });
  }

  /** Levererad: alla varor är bockade, eller (utan varor) Levererad är ifyllt. */
  function isDelivered(order) {
    var items = filledItems(order);
    if (items.length) return items.every(function (item) { return item.done; });
    return Boolean(oneLine(order.values.levererad));
  }

  function deliveredCount(order) {
    return filledItems(order).filter(function (item) { return item.done; }).length;
  }

  /** Håller Levererad i takt med varornas bockar: senaste datumet när alla är levererade. */
  function syncDelivered(order) {
    var items = filledItems(order);
    if (!items.length) return;
    if (!items.every(function (item) { return item.done; })) {
      order.values.levererad = '';
      return;
    }
    var dates = items.map(function (item) { return item.done; }).filter(parseIso).sort();
    order.values.levererad = dates.length ? dates[dates.length - 1] : (oneLine(order.values.levererad) || DONE_NO_DATE);
  }

  /** Efter inläsning: "Levererad: datum" skrivet för hand bockar av varor som saknar bock. */
  function normalize(order) {
    var levererad = oneLine(order.values.levererad);
    var items = filledItems(order);
    if (levererad && items.length && !items.every(function (item) { return item.done; })) {
      items.forEach(function (item) { if (!item.done) item.done = levererad; });
    }
    syncDelivered(order);
  }

  function setDelivered(order, delivered) {
    var items = filledItems(order);
    var today = todayIso();
    if (items.length) {
      items.forEach(function (item) { item.done = delivered ? (item.done || today) : ''; });
      syncDelivered(order);
    } else {
      order.values.levererad = delivered ? today : '';
    }
  }

  /** Rubrik i listan: varorna, annars företaget. */
  function orderTitle(order) {
    return itemNames(order).join(', ') || oneLine(order.values.foretag);
  }

  /** Kort namn i förhandsvisningen: första varan och "+N" för resten. */
  function shortTitle(order) {
    var names = itemNames(order);
    if (!names.length) return oneLine(order.values.foretag);
    return names[0] + (names.length > 1 ? ' +' + (names.length - 1) : '');
  }

  /** Senaste ifyllda steget: { step, value, date } eller null. */
  function latestStep(order) {
    for (var i = 0; i < STEPS.length; i++) {
      var value = oneLine(order.values[STEPS[i].key]);
      if (value) return { step: STEPS[i], value: value, date: parseIso(value) };
    }
    return null;
  }

  // ---------- Textformat ----------

  function fieldByLabel(label) {
    var wanted = label.trim().toLowerCase();
    for (var i = 0; i < FIELDS.length; i++) {
      if (FIELDS[i].aliases.indexOf(wanted) !== -1) return FIELDS[i];
    }
    return null;
  }

  function parseItem(value) {
    var m = DONE_MARK.exec(value);
    if (!m) return { text: value, done: '' };
    return { text: value.slice(0, m.index).trim(), done: m[1] || DONE_NO_DATE };
  }

  function parse(text) {
    var orders = [];
    var restBlocks = [];
    var blocks = String(text || '').replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/);

    blocks.forEach(function (block) {
      var current = null;
      var seen = {};
      var loose = [];

      block.split('\n').forEach(function (line) {
        var m = FIELD_LINE.exec(line);
        var field = m && fieldByLabel(m[1]);
        if (!field) {
          if (!line.trim()) return;
          if (current) current.extra.push(line); else loose.push(line);
          return;
        }
        var value = m[2].trim();
        // Samma fält igen utan tom rad emellan: en ny beställning börjar (utom för varor).
        if (current && seen[field.key] && !field.multi) current = null;
        if (!current) {
          current = emptyOrder();
          seen = {};
          orders.push(current);
        }
        seen[field.key] = true;
        if (field.multi) {
          var item = parseItem(value);
          if (item.text || item.done) current.values[field.key].push(item);
        } else {
          current.values[field.key] = value;
        }
      });

      if (loose.length) restBlocks.push(loose.join('\n'));
    });

    orders.forEach(normalize);
    return { orders: orders, rest: restBlocks.join('\n\n') };
  }

  function serializeItem(item) {
    var text = oneLine(item.text);
    if (!item.done) return text;
    return text + ' ✅' + (item.done !== DONE_NO_DATE ? ' ' + oneLine(item.done) : '');
  }

  function serialize(orders, rest) {
    var filled = orders.filter(hasContent);
    // En tom mall sparas så att fälten syns även i andra editorer.
    if (!filled.length) filled = [emptyOrder()];
    var blocks = filled.map(function (order) {
      var lines = [];
      FIELDS.forEach(function (f) {
        var values = f.multi ? filledItems(order).map(serializeItem) : [oneLine(order.values[f.key])];
        if (!values.length) values = [''];
        values.forEach(function (v) { lines.push(f.label + ':' + (v ? ' ' + v : '')); });
      });
      return lines.concat(order.extra).join('\n');
    });
    if (rest) blocks.push(rest);
    return blocks.join('\n\n');
  }

  function oneLine(value) {
    return String(value || '').replace(/\s*\n\s*/g, ' ').trim();
  }

  /**
   * Förhandsvisningen i anteckningslistan.
   * En beställning: "Skruvdragare +1 · Webbutiken · PostNord · lev 3 nov".
   * Flera: "2 på väg, 1 levererad: Skruvdragare +1 (lev 3 nov), Vinterjacka (skickad 26 okt)".
   */
  function preview(orders) {
    var filled = orders.filter(hasContent);
    if (!filled.length) return '';
    if (filled.length === 1) {
      var o = filled[0];
      var itemText = itemNames(o).length ? shortTitle(o) : '';
      var parts = [itemText, o.values.foretag, o.values.fraktbolag].map(oneLine).filter(Boolean);
      var s = stepText(o);
      if (s) parts.push(s);
      return truncate(parts.join(' · '));
    }
    var active = filled.filter(function (order) { return !isDelivered(order); });
    var doneCount = filled.length - active.length;
    if (!active.length) return truncate('Alla ' + filled.length + ' levererade');
    var head = active.length + ' på väg' + (doneCount ? ', ' + doneCount + (doneCount === 1 ? ' levererad' : ' levererade') : '');
    return truncate(head + ': ' + active.map(function (order) {
      var title = shortTitle(order) || 'Beställning';
      var s = stepText(order);
      return s ? title + ' (' + s + ')' : title;
    }).join(', '));
  }

  function stepText(order) {
    if (isDelivered(order)) {
      var date = parseIso(order.values.levererad);
      return 'levererad' + (date ? ' ' + shortDate(date) : '');
    }
    var latest = latestStep(order);
    if (!latest) return '';
    return latest.step.preview + ' ' + (latest.date ? shortDate(latest.date) : latest.value);
  }

  function truncate(text) {
    return text.length > PREVIEW_LENGTH ? text.slice(0, PREVIEW_LENGTH - 1).trim() + '…' : text;
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

  /** Klass för ett levdatum: rött om det har passerat, blått idag och imorgon. */
  function lateClass(days) {
    if (days < 0) return 'late';
    if (days <= 1) return 'soon';
    return '';
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
      resetConfirm();
      stopSettling();
      setSaveState('', '');
    }

    var textChanged = false;
    if (!note.isMetadataUpdate || isNewNote) {
      var incoming = (note.content && note.content.text) || '';
      // Vår egen sparning som kommer tillbaka ska inte skriva över det man håller på att skriva.
      var isEcho = !isNewNote && (state.sentTexts.indexOf(incoming) !== -1 || incoming === serialize(state.orders, state.rest));
      if (!isEcho) {
        var parsed = parse(incoming);
        state.orders = parsed.orders;
        state.rest = parsed.rest;
        if (!state.orders.length) state.orders.push(emptyOrder());
        stopSettling();
        // En ensam beställning visas utfälld; flera visas som en lista.
        if (isNewNote || state.expanded >= state.orders.length) {
          state.expanded = state.orders.length === 1 ? 0 : -1;
        }
        textChanged = true;
      }
    }

    if (isNewNote || textChanged || wasLocked !== state.locked) {
      render();
      if (isNewNote) el.page.scrollTop = 0;
    }
  });

  function isLocked(note) {
    // Egen uppslagning: relayens getItemAppDataValue kraschar om domänen saknas i appData.
    var appData = note.content && note.content.appData;
    var sn = appData && appData['org.standardnotes.sn'];
    return Boolean(sn && sn.locked);
  }

  function editable() {
    return Boolean(state.note) && !state.locked;
  }

  // ---------- Till Standard Notes ----------

  function save() {
    if (!editable()) return;
    var note = state.note;
    var text = serialize(state.orders, state.rest);
    var previewText = preview(state.orders);
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

  // ---------- Händelser ----------

  function orderIndex(target) {
    var card = target.closest('.order');
    return card ? Number(card.getAttribute('data-index')) : -1;
  }

  function itemIndex(target) {
    var row = target.closest('.item');
    return row ? Array.prototype.indexOf.call(row.parentNode.children, row) : -1;
  }

  function cardFor(index) {
    return document.querySelector('.order[data-index="' + index + '"]');
  }

  /**
   * Inmatning ritar bara om det som ändras (rubrik, räknare, datumrad, förslag),
   * inte hela kortet, så att inget i fältet man skriver i rörs.
   */
  function onInput(event) {
    var input = event.target;
    if (input.tagName !== 'INPUT' || input.type === 'checkbox' || !editable()) return;
    var card = input.closest('.order');
    var order = state.orders[orderIndex(input)];
    if (!order) return;

    if (input.classList.contains('item-input')) {
      var item = order.values.vara[itemIndex(input)];
      if (!item || item.text === input.value) return;
      item.text = input.value;
      // En vara utan text kan inte vara levererad.
      if (!oneLine(item.text)) item.done = '';
      syncDelivered(order);
      renderItemControls(card, order, true);
    } else {
      var key = input.getAttribute('data-key');
      if (!key || order.values[key] === input.value) return;
      order.values[key] = input.value;
      if (input.type === 'date') {
        renderDateBlock(card.querySelector('[data-date-field="' + key + '"]'), order, true);
      }
      if (key === 'fraktbolag') renderCarriers(card, order, true);
    }
    renderSummary(card, order, true);
    renderCount();
    save();
  }

  /** Bockarna: en vara, eller hela beställningen. */
  function onCheck(event) {
    var box = event.target;
    if (box.type !== 'checkbox') return;
    var index = orderIndex(box);
    var order = state.orders[index];
    if (!order || !editable()) { render(); return; }
    var wasDelivered = isDelivered(order);

    if (box.classList.contains('item-check')) {
      var item = order.values.vara[itemIndex(box)];
      if (!item) return;
      item.done = box.checked ? todayIso() : '';
      syncDelivered(order);
    } else if (box.classList.contains('order-check')) {
      setDelivered(order, !wasDelivered);
    }

    var nowDelivered = isDelivered(order);
    if (nowDelivered && !wasDelivered) settle(index);
    render();
    save();
  }

  el.page.addEventListener('input', onInput);
  el.page.addEventListener('change', function (event) {
    if (event.target.type === 'checkbox') onCheck(event); else onInput(event);
  });

  el.page.addEventListener('click', function (event) {
    var index = orderIndex(event.target);
    if (index < 0) return;

    if (event.target.closest('.summary')) {
      toggle(index);
      return;
    }

    var button = event.target.closest('[data-action], [data-carrier]');
    if (!button) return;
    var action = button.getAttribute('data-action');

    if (action === 'collapse') {
      state.expanded = -1;
      resetConfirm();
      render();
      return;
    }
    if (!editable()) return;
    var order = state.orders[index];
    var card = cardFor(index);

    if (button.hasAttribute('data-carrier')) {
      order.values.fraktbolag = button.getAttribute('data-carrier');
      render();
      save();
    } else if (action === 'today' || action === 'clear') {
      var key = button.closest('[data-date-field]').getAttribute('data-date-field');
      order.values[key] = action === 'today' ? todayIso() : '';
      render();
      save();
    } else if (action === 'add-item') {
      var items = order.values.vara;
      // Återanvänd en tom sista rad i stället för att lägga till en till.
      if (!items.length || oneLine(items[items.length - 1].text)) items.push(emptyItem());
      renderItems(card, order, true, items.length - 1);
    } else if (action === 'remove-item') {
      var i = itemIndex(button);
      if (i < 0) return;
      order.values.vara.splice(i, 1);
      syncDelivered(order);
      render();
      save();
    } else if (action === 'remove') {
      removeOrder(index);
    }
  });

  el.page.addEventListener('keydown', function (event) {
    var input = event.target;
    if (event.key !== 'Enter' || input.tagName !== 'INPUT' || input.type === 'date' || input.type === 'checkbox') return;
    var card = input.closest('.order');
    if (!card) return;
    event.preventDefault();

    // Enter på en vara med text ger en ny rad under; Enter på en tom rad går vidare till Fraktbolag.
    if (input.classList.contains('item-input') && editable()) {
      var order = state.orders[orderIndex(input)];
      var i = itemIndex(input);
      if (!oneLine(input.value)) {
        card.querySelector('[data-key="fraktbolag"]').focus();
        return;
      }
      var next = order.values.vara[i + 1];
      if (!next || oneLine(next.text)) order.values.vara.splice(i + 1, 0, emptyItem());
      renderItems(card, order, true, i + 1);
      return;
    }

    // Annars: nästa fält i samma beställning (ingen <form>, se README).
    var all = Array.prototype.slice.call(card.querySelectorAll('.details input:not([type="checkbox"])'));
    var following = all[all.indexOf(input) + 1];
    if (following) following.focus(); else input.blur();
  });

  el.addOrder.addEventListener('click', function () {
    if (!editable()) return;
    // Återanvänd en tom beställning i stället för att lägga till en till.
    var emptyIndex = -1;
    state.orders.forEach(function (order, i) { if (!hasContent(order)) emptyIndex = i; });
    if (emptyIndex < 0) {
      state.orders.push(emptyOrder());
      emptyIndex = state.orders.length - 1;
    }
    state.expanded = emptyIndex;
    resetConfirm();
    render();
    var card = cardFor(emptyIndex);
    scrollIntoView(card);
    card.querySelector('[data-key="foretag"]').focus();
  });

  /** Rensa: tar bort alla levererade beställningar, efter ett andra tryck. */
  el.clearDone.addEventListener('click', function () {
    if (!editable()) return;
    if (!state.confirmClear) {
      resetConfirm();
      state.confirmClear = true;
      state.confirmTimer = setTimeout(function () { resetConfirm(); render(); }, CONFIRM_MS);
      render();
      return;
    }
    resetConfirm();
    stopSettling();
    state.orders = state.orders.filter(function (order) { return !(hasContent(order) && isDelivered(order)); });
    state.expanded = -1;
    if (!state.orders.length) {
      state.orders.push(emptyOrder());
      state.expanded = 0;
    }
    render();
    save();
  });

  // Uppdatera "om N dagar" när man kommer tillbaka till appen en annan dag.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) render();
  });

  function toggle(index) {
    state.expanded = state.expanded === index ? -1 : index;
    resetConfirm();
    render();
    if (state.expanded === index) scrollIntoView(cardFor(index));
  }

  /** Låt en nyss levererad beställning stå kvar en stund, fäll ihop den och flytta ner den. */
  function settle(index) {
    stopSettling();
    state.settlingIndex = index;
    state.settleTimer = setTimeout(function () {
      state.settlingIndex = -1;
      state.settleTimer = null;
      var order = state.orders[index];
      if (state.expanded === index && order && isDelivered(order)) state.expanded = -1;
      render();
    }, SETTLE_MS);
  }

  function stopSettling() {
    clearTimeout(state.settleTimer);
    state.settleTimer = null;
    state.settlingIndex = -1;
  }

  /** Första trycket frågar, andra tar bort. En tom beställning tas bort direkt. */
  function removeOrder(index) {
    var order = state.orders[index];
    if (hasContent(order) && state.confirmIndex !== index) {
      resetConfirm();
      state.confirmIndex = index;
      state.confirmTimer = setTimeout(function () { resetConfirm(); render(); }, CONFIRM_MS);
      render();
      return;
    }
    resetConfirm();
    stopSettling();
    state.orders.splice(index, 1);
    if (state.expanded === index) state.expanded = -1;
    else if (state.expanded > index) state.expanded--;
    if (!state.orders.length) {
      state.orders.push(emptyOrder());
      state.expanded = 0;
    }
    render();
    save();
  }

  function resetConfirm() {
    clearTimeout(state.confirmTimer);
    state.confirmTimer = null;
    state.confirmIndex = -1;
    state.confirmClear = false;
  }

  function scrollIntoView(node) {
    if (!node) return;
    try { node.scrollIntoView({ block: 'nearest' }); } catch (e) { node.scrollIntoView(false); }
  }

  // ---------- Rendering ----------

  /** Ritar båda listorna: på väg överst, levererade under rubriken Levererade. */
  function render() {
    var canEdit = editable();
    el.lockedBanner.hidden = !state.locked;

    var active = [];
    var done = [];
    state.orders.forEach(function (order, i) {
      var inDone = hasContent(order) && isDelivered(order) && i !== state.settlingIndex;
      (inDone ? done : active).push(i);
    });

    syncList(el.orders, active, canEdit);
    syncList(el.doneList, done, canEdit);

    el.doneSection.hidden = !done.length;
    el.doneTitle.textContent = 'Levererade (' + done.length + ')';
    el.clearDone.hidden = !canEdit;
    el.clearDone.textContent = state.confirmClear ? 'Tryck igen för att rensa' : 'Rensa';
    el.clearDone.classList.toggle('confirm', state.confirmClear);

    el.addOrder.hidden = !canEdit;
    renderCount();
  }

  /** Korten byggs bara om när listans sammansättning ändras, så att fokus och markör står kvar. */
  function syncList(list, indices, canEdit) {
    var signature = indices.join(',');
    if (list.getAttribute('data-signature') !== signature) {
      list.setAttribute('data-signature', signature);
      list.textContent = '';
      indices.forEach(function (i) {
        var card = el.template.content.firstElementChild.cloneNode(true);
        card.setAttribute('data-index', String(i));
        list.appendChild(card);
      });
    }
    Array.prototype.forEach.call(list.children, function (card) {
      var i = Number(card.getAttribute('data-index'));
      renderCard(card, state.orders[i], i, canEdit);
    });
  }

  function renderCount() {
    var filled = state.orders.filter(hasContent);
    var doneCount = filled.filter(isDelivered).length;
    var activeCount = filled.length - doneCount;
    if (!doneCount) {
      el.count.textContent = filled.length === 1 ? '1 beställning' : filled.length + ' beställningar';
    } else if (!activeCount) {
      el.count.textContent = doneCount === 1 ? '1 levererad' : 'Alla ' + doneCount + ' levererade';
    } else {
      el.count.textContent = activeCount + ' på väg · ' + doneCount + (doneCount === 1 ? ' levererad' : ' levererade');
    }
  }

  function renderCard(card, order, index, canEdit) {
    var expanded = state.expanded === index;
    card.classList.toggle('expanded', expanded);
    card.classList.toggle('completing', state.settlingIndex === index);
    card.querySelector('.summary').setAttribute('aria-expanded', String(expanded));
    card.querySelector('.details').hidden = !expanded;
    renderSummary(card, order, canEdit);

    Array.prototype.forEach.call(card.querySelectorAll('input[data-key]'), function (input) {
      var value = order.values[input.getAttribute('data-key')] || '';
      if (input.type === 'date') {
        // Datumväljaren kan bara visa ÅÅÅÅ-MM-DD; annan text står kvar i anteckningen och visas under fältet.
        var iso = parseIso(value) ? value : '';
        if (input.value !== iso) input.value = iso;
        setFlag(input, 'disabled', !canEdit);
        input.classList.toggle('empty', !iso);
      } else {
        if (input.value !== value) input.value = value;
        setFlag(input, 'disabled', !state.note);
        setFlag(input, 'readOnly', state.locked);
      }
    });

    renderItems(card, order, canEdit);
    renderCarriers(card, order, canEdit);
    Array.prototype.forEach.call(card.querySelectorAll('[data-date-field]'), function (block) {
      renderDateBlock(block, order, canEdit);
    });
    renderDeliveredNote(card, order);

    var remove = card.querySelector('[data-action="remove"]');
    var confirming = state.confirmIndex === index;
    remove.hidden = !canEdit;
    remove.textContent = confirming ? 'Tryck igen för att ta bort' : 'Ta bort beställning';
    remove.classList.toggle('confirm', confirming);
  }

  /** Sätter en egenskap bara när den faktiskt ändras. */
  function setFlag(node, name, value) {
    if (node[name] !== value) node[name] = value;
  }

  /** Bock, rubrik, undertext och status i den ihopfällda raden. */
  function renderSummary(card, order, canEdit) {
    var delivered = isDelivered(order);
    var total = filledItems(order).length;
    var doneItems = deliveredCount(order);

    var check = card.querySelector('.order-check');
    setFlag(check, 'checked', delivered);
    setFlag(check, 'indeterminate', !delivered && doneItems > 0);
    setFlag(check, 'disabled', !canEdit || !hasContent(order));

    var title = card.querySelector('.s-title');
    var text = orderTitle(order);
    title.textContent = text || 'Ny beställning';
    title.classList.toggle('placeholder', !text);

    var meta = [total ? oneLine(order.values.foretag) : '', oneLine(order.values.fraktbolag)];
    if (!delivered && doneItems > 0) meta.push(doneItems + ' av ' + total + ' levererade');
    card.querySelector('.s-meta').textContent = meta.filter(Boolean).join(' · ');
    renderStatus(card, order, delivered);
  }

  function renderStatus(card, order, delivered) {
    var top = card.querySelector('.s-top');
    var bottom = card.querySelector('.s-bottom');
    top.textContent = '';
    bottom.textContent = '';
    bottom.className = 's-bottom';

    if (delivered) {
      var date = parseIso(order.values.levererad);
      top.textContent = 'Levererad';
      bottom.textContent = date ? shortDate(date) : '';
      bottom.classList.add('ok');
      return;
    }

    var latest = latestStep(order);
    if (!latest) return;
    if (!latest.date) {
      top.textContent = latest.step.label;
      bottom.textContent = latest.value;
    } else if (latest.step.key === 'levdatum') {
      var days = daysFromToday(latest.date);
      top.textContent = latest.step.label + ' ' + shortDate(latest.date);
      bottom.textContent = relative(days);
      var cls = lateClass(days);
      if (cls) bottom.classList.add(cls);
    } else {
      top.textContent = latest.step.label;
      bottom.textContent = shortDate(latest.date);
    }
  }

  /** Varuraderna i ett kort. Raderna byggs bara om när antalet ändras. */
  function renderItems(card, order, canEdit, focusIndex) {
    var items = order.values.vara;
    if (!items.length) items.push(emptyItem());
    var list = card.querySelector('.items');

    if (list.children.length !== items.length) {
      list.textContent = '';
      items.forEach(function () {
        list.appendChild(el.itemTemplate.content.firstElementChild.cloneNode(true));
      });
    }

    Array.prototype.forEach.call(list.children, function (row, i) {
      var input = row.querySelector('.item-input');
      if (input.value !== items[i].text) input.value = items[i].text;
      setFlag(input, 'disabled', !state.note);
      setFlag(input, 'readOnly', state.locked);
      input.setAttribute('aria-label', 'Vara ' + (i + 1));
    });
    renderItemControls(card, order, canEdit);

    if (typeof focusIndex === 'number' && list.children[focusIndex]) {
      list.children[focusIndex].querySelector('.item-input').focus();
    }
  }

  /** Bockarna, kryssen, "Lägg till vara" och antalet i rubriken. */
  function renderItemControls(card, order, canEdit) {
    var items = order.values.vara;
    var list = card.querySelector('.items');
    Array.prototype.forEach.call(list.children, function (row, i) {
      var item = items[i];
      var hasText = Boolean(item && oneLine(item.text));
      var check = row.querySelector('.item-check');
      setFlag(check, 'checked', Boolean(item && item.done));
      // En tom rad kan inte bockas av.
      setFlag(check, 'disabled', !canEdit || !hasText);
      check.setAttribute('aria-label', hasText ? 'Levererad: ' + oneLine(item.text) : 'Levererad');
      row.classList.toggle('is-done', Boolean(item && item.done));
      // Den enda raden går inte att ta bort så länge den är tom.
      row.querySelector('.item-remove').hidden = !canEdit || (items.length === 1 && !hasText);
    });
    var count = filledItems(order).length;
    card.querySelector('.items-label').textContent = count > 1 ? 'Varor (' + count + ')' : 'Varor';
    card.querySelector('[data-action="add-item"]').hidden = !canEdit;
  }

  /** Förslag på fraktbolag: alla när fältet är tomt, annars de som börjar på det man skrivit. */
  function renderCarriers(card, order, canEdit) {
    var box = card.querySelector('.carriers');
    var typed = oneLine(order.values.fraktbolag).toLowerCase();
    var names = !canEdit ? [] : CARRIERS.filter(function (name) {
      var lower = name.toLowerCase();
      return !typed || (lower.indexOf(typed) === 0 && lower !== typed);
    });
    var key = names.join('|');
    if (box.getAttribute('data-shown') === key) return;
    box.setAttribute('data-shown', key);
    box.textContent = '';
    names.forEach(function (name) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'carrier';
      chip.setAttribute('data-carrier', name);
      chip.textContent = name;
      box.appendChild(chip);
    });
  }

  function renderDateBlock(block, order, canEdit) {
    var key = block.getAttribute('data-date-field');
    var field = FIELDS.filter(function (f) { return f.key === key; })[0];
    var value = order.values[key] || '';
    var date = parseIso(value);
    var today = block.querySelector('[data-action="today"]');
    var when = block.querySelector('.when');
    var input = block.querySelector('input');

    input.classList.toggle('empty', !input.value);
    block.querySelector('[data-action="clear"]').hidden = !value || !canEdit;
    if (today) today.hidden = Boolean(value) || !canEdit;

    when.textContent = '';
    when.hidden = !value;
    if (!value) return;
    if (!date) {
      when.textContent = 'I anteckningen står: ' + value;
      return;
    }
    var days = daysFromToday(date);
    var rel = document.createElement('span');
    rel.textContent = relative(days);
    // Ett levdatum är bara försenat så länge beställningen inte har kommit.
    if (field && field.late && !isDelivered(order)) rel.className = lateClass(days);
    when.appendChild(document.createTextNode(longDate(date) + ' · '));
    when.appendChild(rel);
  }

  function renderDeliveredNote(card, order) {
    var note = card.querySelector('.delivered-note');
    var delivered = hasContent(order) && isDelivered(order);
    note.hidden = !delivered;
    if (!delivered) return;
    var date = parseIso(order.values.levererad);
    note.textContent = date ? 'Levererad ' + longDate(date).toLowerCase() : 'Levererad';
  }

  function setSaveState(label, kind) {
    el.saveState.textContent = label;
    el.saveState.className = 'save-state' + (kind ? ' ' + kind : '');
  }
})();

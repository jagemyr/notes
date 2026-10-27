/*
 * NWO (jagemyr) – beställningar i Standard Notes. En anteckning kan hålla flera
 * beställningar, var och en med Företag, Vara, Fraktbolag, Beställd, Skickad och
 * Bedömt levdatum.
 *
 * Allt sparas som vanlig text i anteckningen: ett block per beställning, en rad per
 * fält och en tom rad mellan beställningarna.
 *
 *   Företag: Webbutiken
 *   Vara: Skruvdragare
 *   Fraktbolag: PostNord
 *   Beställd: 2026-10-27
 *   Skickad:
 *   Bedömt levdatum: 2026-11-03
 *
 *   Företag: Begagnatsajten
 *   Vara: Vinterjacka
 *   ...
 *
 * Rader som inte är fält (t.ex. något som skrivits i en annan editor) ligger kvar
 * oförändrade: i sin beställning om de står i ett block med fält, annars sist.
 */
(function () {
  'use strict';

  var VERSION = '2.0.0';
  var NOT_CONNECTED_HINT_MS = 2500;
  var CONFIRM_MS = 3000;
  var PREVIEW_LENGTH = 90;
  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  var FIELD_LINE = /^\s*([^:]{1,40}?)\s*:(.*)$/;

  // Ordningen här är ordningen i anteckningen. Alias gör att rader skrivna för hand också känns igen.
  var FIELDS = [
    { key: 'foretag', label: 'Företag', aliases: ['foretag', 'företag'] },
    // joinRepeats: flera Vara-rader i samma block (från version 1.2) slås ihop till en.
    { key: 'vara', label: 'Vara', joinRepeats: true, aliases: ['vara', 'varor'] },
    { key: 'fraktbolag', label: 'Fraktbolag', aliases: ['fraktbolag', 'frakt'] },
    { key: 'bestalld', label: 'Beställd', aliases: ['beställd', 'bestalld', 'beställt', 'beställning', 'beställningsdatum', 'orderdatum'] },
    { key: 'skickad', label: 'Skickad', aliases: ['skickad', 'skickat', 'skickades', 'skickat datum', 'avsänd'] },
    // late: ett passerat datum visas i rött (leveransen borde ha kommit).
    { key: 'levdatum', label: 'Bedömt levdatum', late: true, aliases: ['bedömt levdatum', 'bedomt levdatum', 'bedömt leveransdatum', 'levdatum', 'leveransdatum'] }
  ];

  // Statusen i listan visar det senaste steget som är ifyllt.
  var STEPS = [
    { key: 'levdatum', label: 'Lev', preview: 'lev' },
    { key: 'skickad', label: 'Skickad', preview: 'skickad' },
    { key: 'bestalld', label: 'Beställd', preview: 'beställd' }
  ];

  var el = {
    notice: document.getElementById('notice'),
    lockedBanner: document.getElementById('locked-banner'),
    orders: document.getElementById('orders'),
    addOrder: document.getElementById('add-order'),
    template: document.getElementById('order-template'),
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
    confirmTimer: null,
    lastSentText: null,
    // De senaste texterna vi själva har sparat. En sparning kan komma tillbaka från appen
    // efter att man har skrivit vidare, och ska då inte skriva över fälten.
    sentTexts: []
  };

  // ---------- Beställningar ----------

  function emptyOrder() {
    var values = {};
    FIELDS.forEach(function (f) { values[f.key] = ''; });
    return { values: values, extra: [] };
  }

  /** En beställning utan något ifyllt sparas inte (den finns bara i formuläret). */
  function hasContent(order) {
    return FIELDS.some(function (f) { return oneLine(order.values[f.key]); }) ||
      order.extra.some(function (line) { return line.trim(); });
  }

  function orderTitle(order) {
    return oneLine(order.values.vara) || oneLine(order.values.foretag) || '';
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
        if (current && seen[field.key]) {
          if (field.joinRepeats) {
            var old = current.values[field.key];
            if (value) current.values[field.key] = old ? old + ', ' + value : value;
            return;
          }
          // Samma fält igen utan tom rad emellan: en ny beställning börjar.
          current = null;
        }
        if (!current) {
          current = emptyOrder();
          seen = {};
          orders.push(current);
        }
        seen[field.key] = true;
        current.values[field.key] = value;
      });

      if (loose.length) restBlocks.push(loose.join('\n'));
    });

    return { orders: orders, rest: restBlocks.join('\n\n') };
  }

  function serialize(orders, rest) {
    var filled = orders.filter(hasContent);
    // En tom mall sparas så att fälten syns även i andra editorer.
    if (!filled.length) filled = [emptyOrder()];
    var blocks = filled.map(function (order) {
      var lines = FIELDS.map(function (f) {
        var v = oneLine(order.values[f.key]);
        return f.label + ':' + (v ? ' ' + v : '');
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
   * En beställning: "Skruvdragare · Webbutiken · PostNord · lev 3 nov".
   * Flera: "2 beställningar: Skruvdragare (lev 3 nov), Vinterjacka (skickad 26 okt)".
   */
  function preview(orders) {
    var filled = orders.filter(hasContent);
    if (!filled.length) return '';
    if (filled.length === 1) {
      var o = filled[0];
      var parts = [o.values.vara, o.values.foretag, o.values.fraktbolag].map(oneLine).filter(Boolean);
      var s = stepText(o);
      if (s) parts.push(s);
      return truncate(parts.join(' · '));
    }
    return truncate(filled.length + ' beställningar: ' + filled.map(function (order) {
      var title = orderTitle(order) || 'Beställning';
      var s = stepText(order);
      return s ? title + ' (' + s + ')' : title;
    }).join(', '));
  }

  function truncate(text) {
    return text.length > PREVIEW_LENGTH ? text.slice(0, PREVIEW_LENGTH - 1).trim() + '…' : text;
  }

  function stepText(order) {
    var latest = latestStep(order);
    if (!latest) return '';
    return latest.step.preview + ' ' + (latest.date ? shortDate(latest.date) : latest.value);
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
        // En ensam beställning visas utfälld; flera visas som en lista.
        if (isNewNote || state.expanded >= state.orders.length) {
          state.expanded = state.orders.length === 1 ? 0 : -1;
        }
        textChanged = true;
      }
    }

    if (isNewNote || textChanged || wasLocked !== state.locked) {
      render();
      if (isNewNote) el.orders.parentNode.scrollTop = 0;
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
    return card ? Array.prototype.indexOf.call(el.orders.children, card) : -1;
  }

  function onFieldInput(event) {
    var input = event.target;
    var key = input.getAttribute && input.getAttribute('data-key');
    if (!key || !editable()) return;
    var order = state.orders[orderIndex(input)];
    if (!order || order.values[key] === input.value) return;
    order.values[key] = input.value;
    render();
    save();
  }

  el.orders.addEventListener('input', onFieldInput);
  // Vissa Android-datumväljare skickar bara change.
  el.orders.addEventListener('change', onFieldInput);

  el.orders.addEventListener('click', function (event) {
    var index = orderIndex(event.target);
    if (index < 0) return;

    if (event.target.closest('.summary')) {
      toggle(index);
      return;
    }

    var button = event.target.closest('[data-action]');
    if (!button) return;
    var action = button.getAttribute('data-action');

    if (action === 'collapse') {
      state.expanded = -1;
      resetConfirm();
      render();
      return;
    }
    if (!editable()) return;

    if (action === 'today' || action === 'clear') {
      var key = button.closest('[data-date-field]').getAttribute('data-date-field');
      state.orders[index].values[key] = action === 'today' ? todayIso() : '';
      render();
      save();
    } else if (action === 'remove') {
      removeOrder(index);
    }
  });

  // Enter hoppar till nästa fält i samma beställning (ingen <form>, se README).
  el.orders.addEventListener('keydown', function (event) {
    var input = event.target;
    if (event.key !== 'Enter' || input.tagName !== 'INPUT' || input.type === 'date') return;
    event.preventDefault();
    var card = input.closest('.order');
    var move = function () {
      var all = Array.prototype.slice.call(card.querySelectorAll('input'));
      var next = all[all.indexOf(input) + 1];
      if (next) next.focus(); else input.blur();
    };
    // Med förslagslista (Fraktbolag) får webbläsaren först välja förslaget; annars flyttas fokus direkt,
    // så att nästa bokstav inte hamnar i fel fält.
    if (input.hasAttribute('list')) setTimeout(move, 0); else move();
  });

  el.addOrder.addEventListener('click', function () {
    if (!editable()) return;
    // Återanvänd en tom sista beställning i stället för att lägga till en till.
    var last = state.orders[state.orders.length - 1];
    if (!last || hasContent(last)) state.orders.push(emptyOrder());
    state.expanded = state.orders.length - 1;
    resetConfirm();
    render();
    var card = el.orders.children[state.expanded];
    scrollIntoView(card);
    card.querySelector('[data-key="foretag"]').focus();
  });

  // Uppdatera "om N dagar" när man kommer tillbaka till appen en annan dag.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) render();
  });

  function toggle(index) {
    state.expanded = state.expanded === index ? -1 : index;
    resetConfirm();
    render();
    if (state.expanded === index) scrollIntoView(el.orders.children[index]);
  }

  /** Första trycket frågar, andra tar bort. En tom beställning tas bort direkt. */
  function removeOrder(index) {
    var order = state.orders[index];
    if (hasContent(order) && state.confirmIndex !== index) {
      resetConfirm();
      state.confirmIndex = index;
      state.confirmTimer = setTimeout(function () {
        state.confirmIndex = -1;
        render();
      }, CONFIRM_MS);
      render();
      return;
    }
    resetConfirm();
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
  }

  function scrollIntoView(node) {
    if (!node) return;
    try { node.scrollIntoView({ block: 'nearest' }); } catch (e) { node.scrollIntoView(false); }
  }

  // ---------- Rendering ----------

  /** Ritar listan. Korten byggs bara om när antalet ändras, så att fokus och markör står kvar. */
  function render() {
    var canEdit = editable();
    el.lockedBanner.hidden = !state.locked;

    if (el.orders.children.length !== state.orders.length) {
      el.orders.textContent = '';
      state.orders.forEach(function () {
        el.orders.appendChild(el.template.content.firstElementChild.cloneNode(true));
      });
    }

    Array.prototype.forEach.call(el.orders.children, function (card, i) {
      renderCard(card, state.orders[i], i, canEdit);
    });

    el.addOrder.hidden = !canEdit;
    var n = state.orders.filter(hasContent).length;
    el.count.textContent = n === 1 ? '1 beställning' : n + ' beställningar';
  }

  function renderCard(card, order, index, canEdit) {
    var expanded = state.expanded === index;
    card.classList.toggle('expanded', expanded);
    card.querySelector('.summary').setAttribute('aria-expanded', String(expanded));
    card.querySelector('.details').hidden = !expanded;

    // Sammanfattning: vara (eller företag) överst, resten under, status till höger.
    var vara = oneLine(order.values.vara);
    var foretag = oneLine(order.values.foretag);
    var title = card.querySelector('.s-title');
    title.textContent = orderTitle(order) || 'Ny beställning';
    title.classList.toggle('placeholder', !orderTitle(order));
    card.querySelector('.s-meta').textContent =
      [vara ? foretag : '', oneLine(order.values.fraktbolag)].filter(Boolean).join(' · ');
    renderStatus(card, order);

    // Fälten.
    Array.prototype.forEach.call(card.querySelectorAll('input[data-key]'), function (input) {
      var value = order.values[input.getAttribute('data-key')] || '';
      if (input.type === 'date') {
        // Datumväljaren kan bara visa ÅÅÅÅ-MM-DD; annan text står kvar i anteckningen och visas under fältet.
        var iso = parseIso(value) ? value : '';
        if (input.value !== iso) input.value = iso;
        input.disabled = !canEdit;
        input.classList.toggle('empty', !iso);
      } else {
        if (input.value !== value) input.value = value;
        input.disabled = !state.note;
        input.readOnly = state.locked;
      }
    });

    Array.prototype.forEach.call(card.querySelectorAll('[data-date-field]'), function (block) {
      renderDateBlock(block, order, canEdit);
    });

    var remove = card.querySelector('[data-action="remove"]');
    var confirming = state.confirmIndex === index;
    remove.hidden = !canEdit;
    remove.textContent = confirming ? 'Tryck igen för att ta bort' : 'Ta bort beställning';
    remove.classList.toggle('confirm', confirming);
  }

  function renderStatus(card, order) {
    var top = card.querySelector('.s-top');
    var bottom = card.querySelector('.s-bottom');
    var latest = latestStep(order);
    top.textContent = '';
    bottom.textContent = '';
    bottom.className = 's-bottom';
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

  function renderDateBlock(block, order, canEdit) {
    var key = block.getAttribute('data-date-field');
    var field = FIELDS.filter(function (f) { return f.key === key; })[0];
    var value = order.values[key] || '';
    var date = parseIso(value);
    var today = block.querySelector('[data-action="today"]');
    var when = block.querySelector('.when');

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
    if (field && field.late) rel.className = lateClass(days);
    when.appendChild(document.createTextNode(longDate(date) + ' · '));
    when.appendChild(rel);
  }

  function setSaveState(label, kind) {
    el.saveState.textContent = label;
    el.saveState.className = 'save-state' + (kind ? ' ' + kind : '');
  }
})();

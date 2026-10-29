/*
 * Te (jagemyr) – teer i Standard Notes. En anteckning håller en lista med teer, var och
 * ett med Sort, Namn, Temperatur, Bryggtid (vanlig bryggning), Land, Smak och om teet
 * passar för gong fu.
 *
 * Allt sparas som vanlig text i anteckningen: ett block per te, en rad per fält och en
 * tom rad mellan teerna. Ordningen i texten är den ordning teerna lades till; i appen
 * grupperas de per sort och sorteras på namn.
 *
 *   Sort: Oolong
 *   Namn: Dong Ding
 *   Temperatur: 95
 *   Bryggtid: 2-3
 *   Land: Taiwan
 *   Smak: honung, blommig
 *   Gong fu: ja
 *
 * Rader som inte är fält (t.ex. något som skrivits i en annan editor) ligger kvar
 * oförändrade: i sitt te om de står i ett block med fält, annars sist.
 */
(function () {
  'use strict';

  var VERSION = '1.3.0';
  var NOT_CONNECTED_HINT_MS = 2500;
  var CONFIRM_MS = 3000;
  var PREVIEW_LENGTH = 90;
  var FIELD_LINE = /^\s*([^:]{1,40}?)\s*:(.*)$/;
  // "ja", "x", "✅" med mera räknas som ja; allt annat (även tomt och "nej") som nej.
  var YES = /^\s*(ja|j|yes|y|x|✓|✔|✔️|✅|1|true|sant)(?=$|[\s,.!])/i;
  // En ren siffra eller ett spann ("95", "80-85") får °C eller min efter sig i listan.
  var PLAIN_NUMBER = /^\d{1,3}(?:[.,]\d)?(?:\s*[-–—]\s*\d{1,3}(?:[.,]\d)?)?$/;

  // Filtret sparas per enhet, som i Todo.
  var FILTER_KEY = 'se.jagemyr.te.filter';
  var GONGFU_KEY = 'se.jagemyr.te.gongfu';
  var NO_SORT = 'none';

  // Sorterna i den ordning grupperna visas. Alias gör att andra stavningar hamnar i rätt grupp
  // (texten i anteckningen ändras inte). Färgen är kanten till vänster och pricken i rubriken.
  var SORTS = [
    { label: 'Grönt', color: '#4f9a3a', aliases: ['grönt', 'grön', 'gröna', 'grönt te', 'green', 'green tea', 'lü cha', 'lu cha'] },
    { label: 'Vitt', color: '#a39b86', aliases: ['vitt', 'vit', 'vitt te', 'white', 'white tea', 'bai cha'] },
    { label: 'Gult', color: '#cfa21d', aliases: ['gult', 'gul', 'gult te', 'yellow', 'yellow tea', 'huang cha'] },
    { label: 'Oolong', color: '#c47a1f', aliases: ['oolong', 'wulong', 'wu long', 'oolong te', 'qing cha'] },
    { label: 'Svart', color: '#a43c2a', aliases: ['svart', 'svart te', 'black', 'black tea', 'hong cha'] },
    { label: 'Pu-erh', color: '#7a4a28', aliases: ['pu-erh', 'puerh', 'pu erh', 'pu\'er', 'puer', 'pu-er', 'sheng', 'shou', 'sheng puerh', 'shou puerh'] },
    { label: 'Mörkt', color: '#5c4434', aliases: ['mörkt', 'mörk', 'mörkt te', 'dark', 'dark tea', 'hei cha', 'heicha'] },
    { label: 'Matcha', color: '#62a82f', aliases: ['matcha'] },
    { label: 'Örtte', color: '#8a6fb5', aliases: ['örtte', 'örter', 'ört', 'tisane', 'herbal'] },
    { label: 'Rooibos', color: '#c0502e', aliases: ['rooibos', 'rotbusch'] }
  ];

  // Förslag under fälten. Egna knappar i stället för <datalist> (se README).
  var TEMPS = ['70', '75', '80', '85', '90', '95', '100'];
  var TIMES = ['1', '2', '2-3', '3', '3-4', '4', '5'];
  // Smakord: ett tryck lägger till ordet i Smak, ett till tar bort det.
  var TASTES = ['blommig', 'fruktig', 'citrus', 'honung', 'söt', 'nötig', 'rostad', 'rökig', 'maltig',
    'jordig', 'träig', 'gräsig', 'mineralisk', 'kryddig'];
  var COUNTRIES = ['Kina', 'Taiwan', 'Japan', 'Indien', 'Sri Lanka', 'Nepal', 'Korea', 'Vietnam', 'Kenya'];

  // Ordningen här är ordningen i anteckningen. Alias gör att rader skrivna för hand också känns igen.
  var FIELDS = [
    { key: 'sort', label: 'Sort', aliases: ['sort', 'tesort', 'typ'] },
    { key: 'namn', label: 'Namn', aliases: ['namn', 'te', 'name', 'benämning'] },
    { key: 'temperatur', label: 'Temperatur', aliases: ['temperatur', 'temp', 'vattentemperatur', 'vattentemp', 'grader'] },
    // Tiden för vanlig bryggning; gong fu har sitt eget schema.
    { key: 'bryggtid', label: 'Bryggtid', aliases: ['bryggtid', 'tid', 'dragtid', 'dragningstid', 'steep', 'steep time', 'minuter'] },
    { key: 'land', label: 'Land', aliases: ['land', 'ursprung', 'ursprungsland', 'country'] },
    // Smakord åtskilda med kommatecken.
    { key: 'smak', label: 'Smak', aliases: ['smak', 'smaker', 'smakprofil', 'smaknoter', 'smaknot', 'smakbeskrivning', 'flavor', 'flavour', 'taste', 'tasting notes'] },
    // flag: sparas som "ja" eller tomt.
    { key: 'gongfu', label: 'Gong fu', flag: true, aliases: ['gong fu', 'gongfu', 'gong-fu', 'gong fu cha', 'gongfu cha', 'passar för gong fu'] }
  ];
  var TEXT_KEYS = ['sort', 'namn', 'temperatur', 'bryggtid', 'land', 'smak'];

  var el = {
    page: document.querySelector('.page'),
    notice: document.getElementById('notice'),
    lockedBanner: document.getElementById('locked-banner'),
    filtersBar: document.getElementById('filters-bar'),
    filters: document.getElementById('filters'),
    gongfuFilter: document.getElementById('gongfu-filter'),
    search: document.getElementById('search'),
    searchClear: document.getElementById('search-clear'),
    groups: document.getElementById('groups'),
    empty: document.getElementById('empty'),
    addTea: document.getElementById('add-tea'),
    groupTemplate: document.getElementById('group-template'),
    teaTemplate: document.getElementById('tea-template'),
    count: document.getElementById('count'),
    saveState: document.getElementById('save-state')
  };

  var state = {
    connected: false,
    note: null,
    locked: false,
    teas: [],
    rest: '',
    expanded: -1,
    // Sort och namn för det utfällda teet när det fälldes ut. Kortet står kvar på sin plats
    // medan man skriver och flyttas till rätt grupp när det fälls ihop.
    frozen: null,
    confirmIndex: -1,
    confirmTimer: null,
    filter: loadPref(FILTER_KEY) || null,
    gongfuOnly: loadPref(GONGFU_KEY) === '1',
    // Sökningen sparas inte; den gäller tills man rensar den eller byter anteckning.
    search: '',
    lastSentText: null,
    // De senaste texterna vi själva har sparat. En sparning kan komma tillbaka från appen
    // efter att man har skrivit vidare, och ska då inte skriva över fälten.
    sentTexts: []
  };

  function loadPref(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }

  function storePref(key, value) {
    try {
      if (value) window.localStorage.setItem(key, value); else window.localStorage.removeItem(key);
    } catch (e) {
      // Ingen lagring tillgänglig: filtret gäller bara tills editorn stängs.
    }
  }

  // ---------- Teer ----------

  function emptyTea() {
    return { values: { sort: '', namn: '', temperatur: '', bryggtid: '', land: '', smak: '', gongfu: false }, extra: [], prefill: false };
  }

  /**
   * Ett te utan något ifyllt sparas inte. Ett nytt te som bara har fått sort och gong fu
   * från filtret (prefill) räknas inte heller förrän man har ändrat något i det.
   */
  function hasContent(tea) {
    if (tea.prefill) return false;
    return TEXT_KEYS.some(function (key) { return oneLine(tea.values[key]); }) ||
      tea.values.gongfu ||
      tea.extra.some(function (line) { return line.trim(); });
  }

  function touch(tea) {
    tea.prefill = false;
  }

  function knownSort(text) {
    var lower = oneLine(text).toLowerCase();
    if (!lower) return null;
    for (var i = 0; i < SORTS.length; i++) {
      if (SORTS[i].aliases.indexOf(lower) !== -1) return SORTS[i];
    }
    return null;
  }

  /** Gruppen för en sort: { key, label, color, rank, index }. */
  function groupFor(sortValue) {
    var text = oneLine(sortValue);
    if (!text) return { key: NO_SORT, label: 'Utan sort', color: '', rank: 2, index: 0 };
    var known = knownSort(text);
    if (known) return { key: 'k:' + known.label, label: known.label, color: known.color, rank: 0, index: SORTS.indexOf(known) };
    return { key: 'x:' + text.toLowerCase(), label: capitalize(text), color: '', rank: 1, index: 0 };
  }

  function compareGroups(a, b) {
    return a.rank - b.rank || a.index - b.index || a.label.localeCompare(b.label, 'sv');
  }

  function compareNames(a, b) {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return a.localeCompare(b, 'sv', { sensitivity: 'base', numeric: true });
  }

  /** Grupperna bland de ifyllda teerna, i visningsordning, med antal. */
  function groupsOf(teas) {
    var byKey = {};
    var list = [];
    teas.forEach(function (tea) {
      var g = groupFor(tea.values.sort);
      if (!byKey[g.key]) {
        g.count = 0;
        byKey[g.key] = g;
        list.push(g);
      }
      byKey[g.key].count++;
    });
    return list.sort(compareGroups);
  }

  /** "95" → "95 °C", "80-85" → "80–85 °C"; annan text visas som den står. */
  function formatTemp(value) {
    return withUnit(value, '°C');
  }

  /** "3" → "3 min", "2-3" → "2–3 min"; "30 sek" och annan text visas som den står. */
  function formatTime(value) {
    return withUnit(value, 'min');
  }

  function withUnit(value, unit) {
    var text = oneLine(value);
    if (!text || !PLAIN_NUMBER.test(text)) return text;
    return text.replace(/\s*[-–—]\s*/, '–') + ' ' + unit;
  }

  /** "2 – 3 min" → "2-3", så att förslagsknappen 2–3 visas som vald. */
  function normalizeNumber(value) {
    return oneLine(value).toLowerCase()
      .replace(/\s*(°c|°|grader|minuter|minut|min)\.?$/, '')
      .replace(/\s*[-–—]\s*/, '-');
  }

  /** "honung, Persika ;blommig" → ["honung", "Persika", "blommig"]. */
  function tasteWords(value) {
    return String(value || '').split(/\s*[,;\n]\s*/).map(function (w) { return w.trim(); }).filter(Boolean);
  }

  function hasTaste(value, word) {
    var wanted = word.toLowerCase();
    return tasteWords(value).some(function (w) { return w.toLowerCase() === wanted; });
  }

  /** Lägger till ordet sist, eller tar bort det om det redan finns. */
  function toggleTaste(value, word) {
    var words = tasteWords(value);
    var wanted = word.toLowerCase();
    var kept = words.filter(function (w) { return w.toLowerCase() !== wanted; });
    if (kept.length === words.length) kept.push(word);
    return kept.join(', ');
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
    var teas = [];
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
        // Samma fält igen utan tom rad emellan: ett nytt te börjar.
        if (current && seen[field.key]) current = null;
        if (!current) {
          current = emptyTea();
          seen = {};
          teas.push(current);
        }
        seen[field.key] = true;
        current.values[field.key] = field.flag ? YES.test(value) : value;
      });

      if (loose.length) restBlocks.push(loose.join('\n'));
    });

    return { teas: teas, rest: restBlocks.join('\n\n') };
  }

  function serialize(teas, rest) {
    var filled = teas.filter(hasContent);
    // En tom mall sparas så att fälten syns även i andra editorer.
    if (!filled.length) filled = [emptyTea()];
    var blocks = filled.map(function (tea) {
      var lines = FIELDS.map(function (f) {
        var v = f.flag ? (tea.values[f.key] ? 'ja' : '') : oneLine(tea.values[f.key]);
        return f.label + ':' + (v ? ' ' + v : '');
      });
      return lines.concat(tea.extra).join('\n');
    });
    if (rest) blocks.push(rest);
    return blocks.join('\n\n');
  }

  function oneLine(value) {
    return String(value || '').replace(/\s*\n\s*/g, ' ').trim();
  }

  function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function teaCount(n) {
    return n === 1 ? '1 te' : n + ' teer';
  }

  /**
   * Förhandsvisningen i anteckningslistan.
   * Ett te: "Dong Ding · Oolong · 95 °C · Taiwan · gong fu".
   * Flera: "12 teer, 7 för gong fu: 4 oolong, 3 grönt, 2 svart, 2 pu-erh, 1 utan sort".
   */
  function preview(teas) {
    var filled = teas.filter(hasContent);
    if (!filled.length) return '';
    if (filled.length === 1) {
      var v = filled[0].values;
      var parts = [oneLine(v.namn), oneLine(v.sort), formatTemp(v.temperatur), formatTime(v.bryggtid), oneLine(v.land), v.gongfu ? 'gong fu' : ''];
      return truncate(parts.filter(Boolean).join(' · '));
    }
    var gongfu = filled.filter(function (tea) { return tea.values.gongfu; }).length;
    var groups = groupsOf(filled).sort(function (a, b) { return b.count - a.count || compareGroups(a, b); });
    return truncate(teaCount(filled.length) + (gongfu ? ', ' + gongfu + ' för gong fu' : '') + ': ' +
      groups.map(function (g) { return g.count + ' ' + g.label.toLowerCase(); }).join(', '));
  }

  function truncate(text) {
    return text.length > PREVIEW_LENGTH ? text.slice(0, PREVIEW_LENGTH - 1).trim() + '…' : text;
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
      setSearch('');
      setSaveState('', '');
    }

    var textChanged = false;
    if (!note.isMetadataUpdate || isNewNote) {
      var incoming = (note.content && note.content.text) || '';
      // Vår egen sparning som kommer tillbaka ska inte skriva över det man håller på att skriva.
      var isEcho = !isNewNote && (state.sentTexts.indexOf(incoming) !== -1 || incoming === serialize(state.teas, state.rest));
      if (!isEcho) {
        var parsed = parse(incoming);
        state.teas = parsed.teas;
        state.rest = parsed.rest;
        // Indexet hör till den gamla texten; släpp det utan att röra den nya listan.
        if (isNewNote || state.expanded >= state.teas.length) {
          state.expanded = -1;
          state.frozen = null;
        }
        // En tom anteckning visar ett tomt te, utfällt och klart att fylla i.
        if (!state.teas.some(hasContent)) {
          if (!state.teas.length) state.teas.push(emptyTea());
          expand(0);
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
    var text = serialize(state.teas, state.rest);
    var previewText = preview(state.teas);
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

  function teaIndex(target) {
    var card = target.closest('.tea');
    return card ? Number(card.getAttribute('data-index')) : -1;
  }

  function cardFor(index) {
    return el.groups.querySelector('.tea[data-index="' + index + '"]');
  }

  /**
   * Inmatning ritar bara om det som ändras (raden, förslagen, räknaren och filtren),
   * inte hela listan, så att inget i fältet man skriver i rörs.
   */
  el.page.addEventListener('input', function (event) {
    var input = event.target;
    if (input.tagName !== 'INPUT' || input.type === 'checkbox' || !editable()) return;
    var tea = state.teas[teaIndex(input)];
    var key = input.getAttribute('data-key');
    if (!tea || !key || tea.values[key] === input.value) return;
    tea.values[key] = input.value;
    touch(tea);
    var card = input.closest('.tea');
    renderSummary(card, tea);
    renderSuggestions(card, tea, true);
    renderFilters();
    renderCount();
    save();
  });

  el.page.addEventListener('change', function (event) {
    var box = event.target;
    if (!box.classList.contains('gongfu-check')) return;
    var tea = state.teas[teaIndex(box)];
    if (!tea || !editable()) { render(); return; }
    tea.values.gongfu = box.checked;
    touch(tea);
    renderSummary(box.closest('.tea'), tea);
    renderFilters();
    renderCount();
    save();
  });

  el.page.addEventListener('click', function (event) {
    var index = teaIndex(event.target);
    if (index < 0) return;

    if (event.target.closest('.summary')) {
      toggle(index);
      return;
    }

    var button = event.target.closest('[data-action], [data-value]');
    if (!button) return;
    var action = button.getAttribute('data-action');

    if (action === 'collapse') {
      collapseAndShow(index);
      return;
    }
    if (!editable()) return;
    var tea = state.teas[index];
    var card = cardFor(index);

    if (button.hasAttribute('data-value')) {
      var key = button.closest('[data-suggest]').getAttribute('data-suggest');
      var chosen = button.getAttribute('data-value');
      // Smakorden läggs till och tas bort; de andra knapparna ersätter fältet.
      tea.values[key] = key === 'smak' ? toggleTaste(tea.values.smak, chosen) : chosen;
      touch(tea);
      renderCard(card, tea, index, true);
      renderFilters();
      renderCount();
      save();
      // Efter en sort är namnet nästa sak att fylla i.
      if (key === 'sort' && !oneLine(tea.values.namn)) card.querySelector('[data-key="namn"]').focus();
    } else if (action === 'remove') {
      removeTea(index);
    }
  });

  // Enter hoppar till nästa fält i samma te (ingen <form>, se README).
  el.page.addEventListener('keydown', function (event) {
    var input = event.target;
    if (event.key !== 'Enter' || input.tagName !== 'INPUT' || input.type === 'checkbox') return;
    var card = input.closest('.tea');
    if (!card) return;
    event.preventDefault();
    var all = Array.prototype.slice.call(card.querySelectorAll('.details input[data-key]'));
    var following = all[all.indexOf(input) + 1];
    if (following) following.focus(); else input.blur();
  });

  el.addTea.addEventListener('click', function () {
    if (!editable()) return;
    collapse();
    // Återanvänd ett tomt te i stället för att lägga till ett till.
    var index = -1;
    state.teas.forEach(function (tea, i) { if (!hasContent(tea)) index = i; });
    if (index < 0) {
      state.teas.push(emptyTea());
      index = state.teas.length - 1;
    }
    var tea = state.teas[index];
    // Med ett filter valt får det nya teet den sorten (och gong fu), som i Todo.
    var sort = filterSortLabel();
    if (sort || state.gongfuOnly) {
      tea.values.sort = sort || tea.values.sort;
      tea.values.gongfu = state.gongfuOnly || tea.values.gongfu;
      tea.prefill = !oneLine(tea.values.namn) && !oneLine(tea.values.temperatur) && !oneLine(tea.values.land);
    }
    expand(index);
    resetConfirm();
    render();
    var card = cardFor(index);
    scrollIntoView(card);
    card.querySelector(oneLine(tea.values.sort) ? '[data-key="namn"]' : '[data-key="sort"]').focus();
  });

  /** Sorten som hör till det valda filtret, eller tom sträng. */
  function filterSortLabel() {
    if (!state.filter || state.filter === NO_SORT) return '';
    var g = groupsOf(state.teas.filter(hasContent)).filter(function (x) { return x.key === state.filter; })[0];
    return g ? g.label : '';
  }

  // ---------- Filter ----------

  el.filters.addEventListener('click', function (event) {
    var chip = event.target.closest('.chip');
    if (!chip) return;
    state.filter = chip.getAttribute('data-group') || null;
    storePref(FILTER_KEY, state.filter);
    collapse();
    resetConfirm();
    render();
    el.page.scrollTop = 0;
  });

  el.gongfuFilter.addEventListener('click', function () {
    state.gongfuOnly = !state.gongfuOnly;
    storePref(GONGFU_KEY, state.gongfuOnly ? '1' : '');
    collapse();
    resetConfirm();
    render();
    el.page.scrollTop = 0;
  });

  /** Ett te syns om det passar sortfiltret, gong fu-filtret och sökningen. */
  function passesFilters(tea) {
    if (state.filter && groupFor(tea.values.sort).key !== state.filter) return false;
    if (state.gongfuOnly && !tea.values.gongfu) return false;
    return matchesSearch(tea);
  }

  // ---------- Sök ----------
  //
  // Söker i namn, sort, land och smak. Alla ord man skriver måste finnas någonstans i teet,
  // så "honung taiwan" hittar de taiwanesiska teerna som smakar honung. Stora och små
  // bokstäver, accenter och bindestreck spelar ingen roll ("rokig" hittar "rökig",
  // "puerh" hittar "Pu-erh").

  function foldText(text) {
    var lower = String(text || '').toLowerCase();
    try { lower = lower.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) { /* äldre webbläsare */ }
    return lower.replace(/[-'’´`]/g, '');
  }

  function searchTerms() {
    return foldText(state.search).split(/[\s,]+/).filter(Boolean);
  }

  function matchesSearch(tea) {
    var terms = searchTerms();
    if (!terms.length) return true;
    var v = tea.values;
    var hay = foldText([v.namn, v.sort, groupFor(v.sort).label, v.land, v.smak].join(' '));
    return terms.every(function (term) { return hay.indexOf(term) !== -1; });
  }

  function setSearch(value) {
    state.search = value;
    if (el.search.value !== value) el.search.value = value;
    el.searchClear.hidden = !value;
  }

  el.search.addEventListener('input', function () {
    setSearch(el.search.value);
    collapse();
    resetConfirm();
    render();
    el.page.scrollTop = 0;
  });

  el.search.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && state.search) {
      event.preventDefault();
      clearSearch();
    } else if (event.key === 'Enter') {
      // Stänger tangentbordet i mobilen; resultatet syns redan.
      event.preventDefault();
      el.search.blur();
    }
  });

  el.searchClear.addEventListener('click', function () {
    clearSearch();
    el.search.focus();
  });

  function clearSearch() {
    setSearch('');
    collapse();
    resetConfirm();
    render();
  }

  // ---------- Fälla ut och ihop ----------

  function expand(index) {
    var tea = state.teas[index];
    state.expanded = index;
    state.frozen = { sort: tea.values.sort, namn: tea.values.namn };
  }

  /** Fäller ihop. Ett nytt te som inte har fått något eget innehåll försvinner. */
  function collapse() {
    var tea = state.teas[state.expanded];
    if (tea && !hasContent(tea)) {
      state.teas.splice(state.expanded, 1);
      if (state.confirmIndex === state.expanded) resetConfirm();
    }
    state.expanded = -1;
    state.frozen = null;
  }

  function toggle(index) {
    if (state.expanded === index) {
      collapseAndShow(index);
      return;
    }
    // Ett annat te som var utfällt fälls ihop och kan försvinna; räkna om indexet då.
    var target = state.teas[index];
    collapse();
    index = state.teas.indexOf(target);
    if (index < 0) { render(); return; }
    expand(index);
    resetConfirm();
    render();
    scrollIntoView(cardFor(index));
  }

  /** Fäller ihop och visar teet där det hamnar (det kan ha bytt grupp eller plats). */
  function collapseAndShow(index) {
    var tea = state.teas[index];
    collapse();
    resetConfirm();
    render();
    var i = state.teas.indexOf(tea);
    if (i >= 0) scrollIntoView(cardFor(i));
  }

  /** Första trycket frågar, andra tar bort. Ett tomt te tas bort direkt. */
  function removeTea(index) {
    var tea = state.teas[index];
    if (hasContent(tea) && state.confirmIndex !== index) {
      resetConfirm();
      state.confirmIndex = index;
      state.confirmTimer = setTimeout(function () { resetConfirm(); render(); }, CONFIRM_MS);
      render();
      return;
    }
    resetConfirm();
    state.teas.splice(index, 1);
    state.expanded = -1;
    state.frozen = null;
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

  /**
   * Vilka teer som syns, i vilka grupper och i vilken ordning. Det utfällda teet syns alltid
   * och står kvar där det var när det fälldes ut (state.frozen).
   */
  function layout() {
    var byKey = {};
    var groups = [];
    state.teas.forEach(function (tea, i) {
      var isExpanded = i === state.expanded;
      if (!isExpanded && !hasContent(tea)) return;
      var values = isExpanded && state.frozen ? state.frozen : tea.values;
      var g = groupFor(values.sort);
      if (!isExpanded && !passesFilters(tea)) return;
      if (!byKey[g.key]) {
        g.entries = [];
        byKey[g.key] = g;
        groups.push(g);
      }
      byKey[g.key].entries.push({ index: i, name: oneLine(values.namn) });
    });
    groups.sort(compareGroups);
    groups.forEach(function (g) {
      g.entries.sort(function (a, b) { return compareNames(a.name, b.name) || a.index - b.index; });
      g.indices = g.entries.map(function (e) { return e.index; });
    });
    return groups;
  }

  function render() {
    var canEdit = editable();
    el.lockedBanner.hidden = !state.locked;

    // Ett sparat filter för en sort som inte finns i den här anteckningen gäller inte.
    var filled = state.teas.filter(hasContent);
    if (state.note && state.filter && !groupsOf(filled).some(function (g) { return g.key === state.filter; })) {
      state.filter = null;
    }

    var groups = layout();
    // Rubrikerna behövs bara när flera sorter visas; med en sort vald står den i filtret.
    var headings = !state.filter && groups.length > 1;
    var signature = (headings ? 'h|' : '') + groups.map(function (g) { return g.key + ':' + g.indices.join(','); }).join('|');

    if (el.groups.getAttribute('data-signature') !== signature) {
      el.groups.setAttribute('data-signature', signature);
      el.groups.textContent = '';
      groups.forEach(function (g) {
        var section = el.groupTemplate.content.firstElementChild.cloneNode(true);
        section.setAttribute('data-group', g.key);
        section.querySelector('.section-head').hidden = !headings;
        var list = section.querySelector('.teas');
        g.indices.forEach(function (i) {
          var card = el.teaTemplate.content.firstElementChild.cloneNode(true);
          card.setAttribute('data-index', String(i));
          list.appendChild(card);
        });
        el.groups.appendChild(section);
      });
    }

    Array.prototype.forEach.call(el.groups.children, function (section, k) {
      var g = groups[k];
      var count = g.indices.filter(function (i) { return hasContent(state.teas[i]); }).length;
      section.querySelector('.g-title').textContent = g.label + (count ? ' (' + count + ')' : '');
      section.style.setProperty('--sort', g.color || 'var(--muted)');
      Array.prototype.forEach.call(section.querySelectorAll('.tea'), function (card) {
        var i = Number(card.getAttribute('data-index'));
        renderCard(card, state.teas[i], i, canEdit);
      });
    });

    renderEmpty(groups, filled);
    el.addTea.hidden = !canEdit;
    renderFilters();
    renderCount();
  }

  function renderEmpty(groups, filled) {
    var text = '';
    if (!groups.length && state.note) {
      if (!filled.length) {
        text = 'Inga teer ännu.';
      } else if (state.search.trim()) {
        text = 'Inga teer matchar ”' + state.search.trim() + '”' + (state.filter || state.gongfuOnly ? ' med filtret som är valt.' : '.');
      } else {
        var label = state.filter ? groupsOf(filled).filter(function (g) { return g.key === state.filter; })[0] : null;
        var sortText = label ? label.label.toLowerCase() : '';
        text = state.gongfuOnly
          ? 'Inga teer för gong fu' + (sortText ? ' bland ' + sortText : '') + '.'
          : 'Inga teer här.';
      }
    }
    el.empty.textContent = text;
    el.empty.hidden = !text;
  }

  /** Filterknapparna: Alla och en per sort som finns, plus Gong fu till höger. */
  function renderFilters() {
    var filled = state.teas.filter(hasContent);
    var groups = groupsOf(filled);
    var anyGongfu = filled.some(function (tea) { return tea.values.gongfu; });
    var show = filled.length >= 2 || Boolean(state.filter) || state.gongfuOnly || Boolean(state.search);
    el.filtersBar.hidden = !show;
    if (!show) return;

    var key = (state.filter || '') + '#' + groups.map(function (g) { return g.key + '=' + g.label + '=' + g.count; }).join('|');
    if (el.filters.getAttribute('data-shown') !== key) {
      el.filters.setAttribute('data-shown', key);
      var frag = document.createDocumentFragment();
      frag.appendChild(chip('', 'Alla', '', !state.filter));
      groups.forEach(function (g) { frag.appendChild(chip(g.key, g.label, g.color, state.filter === g.key)); });
      el.filters.textContent = '';
      el.filters.appendChild(frag);
      var active = el.filters.querySelector('.chip[aria-pressed="true"]');
      if (active) {
        var r = active.getBoundingClientRect();
        var rr = el.filters.getBoundingClientRect();
        if (r.right > rr.right) el.filters.scrollLeft += r.right - rr.right + 4;
        else if (r.left < rr.left) el.filters.scrollLeft -= rr.left - r.left + 4;
      }
    }
    el.gongfuFilter.hidden = !anyGongfu && !state.gongfuOnly;
    el.gongfuFilter.setAttribute('aria-pressed', String(state.gongfuOnly));
  }

  function chip(groupKey, label, color, pressed) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.setAttribute('data-group', groupKey);
    b.setAttribute('aria-pressed', String(pressed));
    if (groupKey) {
      var dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = color || 'var(--muted)';
      b.appendChild(dot);
    }
    b.appendChild(document.createTextNode(label));
    return b;
  }

  function renderCount() {
    var filled = state.teas.filter(hasContent);
    var text = teaCount(filled.length);
    if (state.filter || state.gongfuOnly || searchTerms().length) {
      text = filled.filter(passesFilters).length + ' av ' + text;
    } else {
      var gongfu = filled.filter(function (tea) { return tea.values.gongfu; }).length;
      if (gongfu) text += ' · ' + gongfu + ' för gong fu';
    }
    el.count.textContent = text;
  }

  function renderCard(card, tea, index, canEdit) {
    var expanded = state.expanded === index;
    card.classList.toggle('expanded', expanded);
    card.querySelector('.summary').setAttribute('aria-expanded', String(expanded));
    card.querySelector('.details').hidden = !expanded;
    renderSummary(card, tea);

    Array.prototype.forEach.call(card.querySelectorAll('input[data-key]'), function (input) {
      var value = tea.values[input.getAttribute('data-key')] || '';
      if (input.value !== value) input.value = value;
      setFlag(input, 'disabled', !state.note);
      setFlag(input, 'readOnly', state.locked);
    });

    var check = card.querySelector('.gongfu-check');
    setFlag(check, 'checked', Boolean(tea.values.gongfu));
    setFlag(check, 'disabled', !canEdit);

    renderSuggestions(card, tea, canEdit);

    var remove = card.querySelector('[data-action="remove"]');
    var confirming = state.confirmIndex === index;
    remove.hidden = !canEdit;
    remove.textContent = confirming ? 'Tryck igen för att ta bort' : 'Ta bort te';
    remove.classList.toggle('confirm', confirming);
  }

  /** Sätter en egenskap bara när den faktiskt ändras. */
  function setFlag(node, name, value) {
    if (node[name] !== value) node[name] = value;
  }

  /**
   * Den ihopfällda raden: namn, land och gong fu och under dem smaken till vänster,
   * temperatur och bryggtid till höger.
   */
  function renderSummary(card, tea) {
    var g = groupFor(tea.values.sort);
    card.style.setProperty('--sort', g.color || 'transparent');

    var title = card.querySelector('.s-title');
    var name = oneLine(tea.values.namn);
    title.textContent = name || (hasContent(tea) ? 'Namnlöst te' : 'Nytt te');
    title.classList.toggle('placeholder', !name);

    // Sorten står i gruppens rubrik; den syns i raden bara om den har ändrats sedan dess.
    var section = card.closest('.group');
    var meta = [];
    if (oneLine(tea.values.sort) && section && section.getAttribute('data-group') !== g.key) meta.push(g.label);
    meta.push(oneLine(tea.values.land));
    var metaText = meta.filter(Boolean).join(' · ');
    card.querySelector('.s-meta').textContent = metaText;
    card.querySelector('.s-gongfu').hidden = !tea.values.gongfu;
    card.querySelector('.s-sub').hidden = !metaText && !tea.values.gongfu;
    card.querySelector('.s-taste').textContent = tasteWords(tea.values.smak).join(', ');

    card.querySelector('.s-temp').textContent = formatTemp(tea.values.temperatur);
    card.querySelector('.s-time').textContent = formatTime(tea.values.bryggtid);
    // Bryggschemat syns i det utfällda teet när det passar för gong fu.
    card.querySelector('.brew').hidden = !tea.values.gongfu;
  }

  /**
   * Förslagsknapparna. Sort, temperatur och bryggtid visar alla knappar med den valda
   * markerad; smak markerar alla ord som finns i fältet; land visar de som börjar på det
   * man har skrivit, som fraktbolagen i NWO.
   */
  function renderSuggestions(card, tea, canEdit) {
    suggest(card, 'sort', canEdit, SORTS.map(function (s) { return s.label; }), function (option, value) {
      var known = knownSort(value);
      return known ? known.label === option : false;
    }, true);
    var sameNumber = function (option, value) { return normalizeNumber(value) === option; };
    suggest(card, 'temperatur', canEdit, TEMPS, sameNumber, true);
    suggest(card, 'bryggtid', canEdit, TIMES, sameNumber, true);
    suggest(card, 'land', canEdit, COUNTRIES, null, false);
    suggest(card, 'smak', canEdit, TASTES, function (option, value) { return hasTaste(value, option); }, true);
  }

  /** Texten på en förslagsknapp: 95°, 2–3 min, annars som den står. */
  function suggestionLabel(key, name) {
    if (key === 'temperatur') return name + '°';
    if (key === 'bryggtid') return name.replace('-', '–') + ' min';
    return name;
  }

  function suggest(card, key, canEdit, options, isSelected, showAll) {
    var box = card.querySelector('[data-suggest="' + key + '"]');
    var value = oneLine(card.querySelector('[data-key="' + key + '"]').value);
    var typed = value.toLowerCase();
    var names = !canEdit ? [] : options.filter(function (name) {
      if (showAll) return true;
      var lower = name.toLowerCase();
      return !typed || (lower.indexOf(typed) === 0 && lower !== typed);
    });
    var pressed = names.map(function (name) { return Boolean(isSelected && isSelected(name, value)); });
    var shown = names.map(function (name, i) { return name + (pressed[i] ? '*' : ''); }).join('|');
    if (box.getAttribute('data-shown') === shown) return;
    box.setAttribute('data-shown', shown);
    box.textContent = '';
    names.forEach(function (name, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'suggestion';
      b.setAttribute('data-value', name);
      if (isSelected) b.setAttribute('aria-pressed', String(pressed[i]));
      if (key === 'sort') {
        var dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.background = SORTS[i].color;
        b.appendChild(dot);
      }
      b.appendChild(document.createTextNode(suggestionLabel(key, name)));
      box.appendChild(b);
    });
  }

  function setSaveState(label, kind) {
    el.saveState.textContent = label;
    el.saveState.className = 'save-state' + (kind ? ' ' + kind : '');
  }
})();

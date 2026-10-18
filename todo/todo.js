/*
 * Todo (jagemyr) – gränssnittet. All logik för text, datum och upprepning finns i core.js.
 *
 * - Avbockade uppgifter stryks över och flyttas till "Klara" längst ner.
 * - Återkommande uppgifter står överstrukna tills nästa datum och kommer då tillbaka oavbockade.
 * - Allt sparas som vanlig text i anteckningen, en uppgift per rad.
 */
(function () {
  'use strict';

  var C = window.TodoCore;
  var COMPLETE_ANIMATION_MS = 350;
  var CONFIRM_MS = 3000;
  var NOT_CONNECTED_HINT_MS = 2500;

  var el = {
    form: document.getElementById('add-form'),
    input: document.getElementById('new-task'),
    addBtn: document.getElementById('add-btn'),
    openList: document.getElementById('open-list'),
    doneList: document.getElementById('done-list'),
    doneSection: document.getElementById('done-section'),
    doneTitle: document.getElementById('done-title'),
    clearDone: document.getElementById('clear-done'),
    empty: document.getElementById('empty'),
    counts: document.getElementById('counts'),
    saveState: document.getElementById('save-state'),
    notice: document.getElementById('notice'),
    lockedBanner: document.getElementById('locked-banner'),
    template: document.getElementById('task-template')
  };

  var state = {
    tasks: [],
    nextId: 1,
    expandedId: null,
    note: null,
    locked: false,
    lastSentText: null,
    today: C.today(),
    connected: false
  };

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
      state.expandedId = null;
    }

    var textChanged = false;
    if (!note.isMetadataUpdate) {
      var incoming = (note.content && note.content.text) || '';
      var ours = C.serialize(state.tasks);
      // Vår egen sparning som kommer tillbaka ska inte rita om listan (då tappar man fokus).
      var isEcho = !isNewNote && (incoming === state.lastSentText || incoming === ours);
      if (!isEcho) {
        textChanged = true;
        loadTasks(incoming);
        state.today = C.today();
        if (C.rollover(state.tasks, state.today)) {
          save();
        }
      }
    }

    if (isNewNote || textChanged || wasLocked !== state.locked) {
      render();
    }
  });

  function loadTasks(text) {
    var expandedTask = findTask(state.expandedId);
    state.tasks = C.parse(text).map(function (t) {
      t.id = state.nextId++;
      return t;
    });
    // Behåll öppen detaljruta om samma uppgift finns kvar.
    state.expandedId = null;
    if (expandedTask) {
      var same = state.tasks.filter(function (t) { return t.title === expandedTask.title; })[0];
      if (same) state.expandedId = same.id;
    }
  }

  function isLocked(note) {
    var appData = note.content && note.content.appData;
    var sn = appData && appData['org.standardnotes.sn'];
    return Boolean(sn && sn.locked);
  }

  // ---------- Till Standard Notes ----------

  function save() {
    if (!state.note || state.locked) return;
    var note = state.note;
    var text = C.serialize(state.tasks);
    var preview = C.preview(state.tasks);
    setSaveState('Sparar…', '');
    relay.saveItemWithPresave(note, function () {
      note.content.text = text;
      note.content.preview_plain = preview;
      note.content.preview_html = null;
      state.lastSentText = text;
    }, function () {
      if (state.note && state.note.uuid === note.uuid) {
        setSaveState('Sparat', 'saved');
      }
    });
  }

  // ---------- Händelser ----------

  el.form.addEventListener('submit', function (event) {
    event.preventDefault();
    var title = el.input.value.replace(/\s+/g, ' ').trim();
    if (!title || state.locked) return;
    state.tasks.unshift({ id: state.nextId++, title: title, done: false, recur: null, due: null, doneDate: null });
    el.input.value = '';
    render();
    save();
    el.input.focus();
  });

  [el.openList, el.doneList].forEach(function (list) {
    list.addEventListener('change', onListChange);
    list.addEventListener('click', onListClick);
    list.addEventListener('input', onListInput);
    list.addEventListener('keydown', onListKeydown);
  });

  function taskFromEvent(event) {
    var li = event.target.closest('.task');
    return li ? findTask(Number(li.dataset.id)) : null;
  }

  function onListChange(event) {
    var task = taskFromEvent(event);
    if (!task || state.locked) return;
    var t = event.target;

    if (t.classList.contains('check')) {
      if (t.checked) {
        C.complete(task, C.today());
        if (state.expandedId === task.id) state.expandedId = null;
        save();
        var li = t.closest('.task');
        li.classList.add('completing');
        setTimeout(render, COMPLETE_ANIMATION_MS);
      } else {
        C.uncomplete(task);
        save();
        render();
      }
      return;
    }

    if (t.classList.contains('d-recur')) {
      task.recur = t.value || null;
      save();
      render();
    } else if (t.classList.contains('d-due')) {
      task.due = t.value || null;
      save();
      render();
    }
  }

  function onListInput(event) {
    var task = taskFromEvent(event);
    if (!task || state.locked || !event.target.classList.contains('d-title')) return;
    var title = event.target.value.replace(/\s+/g, ' ');
    if (!title.trim()) return;
    task.title = title.trim();
    var li = event.target.closest('.task');
    li.querySelector('.title').textContent = task.title;
    save();
  }

  function onListKeydown(event) {
    if (event.key === 'Enter' && event.target.classList.contains('d-title')) {
      event.preventDefault();
      state.expandedId = null;
      render();
    }
  }

  function onListClick(event) {
    var task = taskFromEvent(event);
    if (!task) return;
    var t = event.target;

    if (t.closest('.body')) {
      if (state.locked || task.done) return;
      state.expandedId = state.expandedId === task.id ? null : task.id;
      render();
      if (state.expandedId) {
        var input = el.openList.querySelector('.task[data-id="' + task.id + '"] .d-title');
        if (input) input.focus({ preventScroll: true });
      }
      return;
    }

    if (t.closest('.d-clear-date')) {
      task.due = null;
      save();
      render();
    } else if (t.closest('.d-delete')) {
      state.tasks = state.tasks.filter(function (x) { return x !== task; });
      state.expandedId = null;
      save();
      render();
    }
  }

  // "Rensa" kräver två tryck så att man inte råkar tömma listan.
  var confirmTimer = null;
  el.clearDone.addEventListener('click', function () {
    if (state.locked) return;
    if (!el.clearDone.classList.contains('confirm')) {
      el.clearDone.classList.add('confirm');
      el.clearDone.textContent = 'Tryck igen för att rensa';
      clearTimeout(confirmTimer);
      confirmTimer = setTimeout(resetClearButton, CONFIRM_MS);
      return;
    }
    resetClearButton();
    // Återkommande uppgifter ligger kvar, de kommer ju tillbaka.
    state.tasks = state.tasks.filter(function (t) { return !t.done || t.recur; });
    save();
    render();
  });

  function resetClearButton() {
    clearTimeout(confirmTimer);
    el.clearDone.classList.remove('confirm');
    el.clearDone.textContent = 'Rensa';
  }

  // Ny dag (t.ex. över midnatt eller när appen öppnas igen): öppna återkommande uppgifter.
  function checkNewDay() {
    var now = C.today();
    if (now === state.today) return;
    state.today = now;
    if (C.rollover(state.tasks, now)) save();
    render();
  }
  setInterval(checkNewDay, 60000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) checkNewDay();
  });

  // ---------- Rendering ----------

  function render() {
    var open = state.tasks.filter(function (t) { return !t.done; });
    var done = state.tasks.filter(function (t) { return t.done; });
    var hasNote = Boolean(state.note);

    el.input.disabled = !hasNote || state.locked;
    el.addBtn.disabled = !hasNote || state.locked;
    el.form.hidden = state.locked;
    el.lockedBanner.hidden = !state.locked;

    fillList(el.openList, open);
    fillList(el.doneList, done);

    el.empty.hidden = !hasNote || open.length > 0;
    el.empty.textContent = state.tasks.length ? 'Allt klart!' : 'Inga uppgifter ännu.';
    el.doneSection.hidden = done.length === 0;
    el.doneTitle.textContent = 'Klara · ' + done.length;
    var clearable = done.some(function (t) { return !t.recur; });
    el.clearDone.disabled = state.locked || !clearable;

    el.counts.textContent = open.length + ' kvar' + (done.length ? ' · ' + done.length + ' klara' : '');
  }

  function fillList(list, tasks) {
    var frag = document.createDocumentFragment();
    tasks.forEach(function (task) {
      frag.appendChild(renderTask(task));
    });
    list.replaceChildren(frag);
  }

  function renderTask(task) {
    var li = el.template.content.firstElementChild.cloneNode(true);
    li.dataset.id = task.id;

    var check = li.querySelector('.check');
    check.checked = task.done;
    check.disabled = state.locked;
    check.setAttribute('aria-label', (task.done ? 'Markera som ej klar: ' : 'Markera som klar: ') + task.title);

    var body = li.querySelector('.body');
    body.disabled = state.locked || task.done;
    li.querySelector('.title').textContent = task.title;
    renderMeta(li.querySelector('.meta'), task);

    var expanded = state.expandedId === task.id && !task.done && !state.locked;
    body.setAttribute('aria-expanded', String(expanded));
    var details = li.querySelector('.details');
    details.hidden = !expanded;
    if (expanded) {
      li.querySelector('.d-title').value = task.title;
      var select = li.querySelector('.d-recur');
      select.appendChild(new Option('Ingen upprepning', ''));
      C.RECURRENCES.forEach(function (r) {
        select.appendChild(new Option(r.label, r.key));
      });
      select.value = task.recur || '';
      li.querySelector('.d-due').value = task.due || '';
      li.querySelector('.d-clear-date').disabled = !task.due;
    }
    return li;
  }

  function renderMeta(meta, task) {
    var parts = [];
    if (task.recur) {
      parts.push(span('↻ ' + C.recurLabel(task.recur), ''));
    }
    if (task.done) {
      var back = C.returnDate(task);
      if (back) parts.push(span('tillbaka ' + lowerFirst(C.formatDate(back, state.today)), ''));
    } else if (task.due) {
      var status = C.dueStatus(task, state.today);
      var label = C.formatDate(task.due, state.today);
      if (status === 'overdue') label = 'Försenad · ' + label;
      parts.push(span(label, status === 'overdue' ? 'overdue' : status === 'today' ? 'today' : ''));
    }
    parts.forEach(function (node, i) {
      if (i > 0) meta.appendChild(document.createTextNode(' · '));
      meta.appendChild(node);
    });
  }

  function span(text, cls) {
    var s = document.createElement('span');
    s.textContent = text;
    if (cls) s.className = cls;
    return s;
  }

  function lowerFirst(s) {
    return s.charAt(0).toLowerCase() + s.slice(1);
  }

  function findTask(id) {
    if (id == null) return null;
    for (var i = 0; i < state.tasks.length; i++) {
      if (state.tasks[i].id === id) return state.tasks[i];
    }
    return null;
  }

  function setSaveState(label, kind) {
    el.saveState.textContent = label;
    el.saveState.className = 'save-state' + (kind ? ' ' + kind : '');
  }

  render();
})();

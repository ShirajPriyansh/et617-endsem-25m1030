/*
 * app.js
 * ET 617 | 25M1030
 *
 * Screens, state, session timer (C4), save and resume, learning log, Step through tool.
 * Adaptive choices come from engine.js. Questions come from data/questions.js.
 */
(function () {
  'use strict';

  var Q = window.QBank;
  var E = window.Engine;
  var STATE_KEY = 'et617_25m1030_state_v1';
  var LOG_KEY = 'et617_25m1030_log_v1';
  var COUNTING_SCREENS = ['diagnostic', 'learn', 'task', 'feedback'];
  var IDLE_MS = 90 * 1000;          // pause the clock after 90 s with no touch or typing
  var LIMIT = E.CONFIG.sessionMs;
  var MAX = E.CONFIG.maxTasks;
  var FORMAT_LABEL = { predict: 'Predict the output', trace: 'Trace table', fix: 'Fix the code', explain: 'Explain in words' };
  var IDEA = { M1: 'range stops before the end number', M2: 'i gets a new value on every pass' };

  /* ---------- storage: every access wrapped in try/catch ---------- */
  var memory = {};
  function load(key) {
    try {
      var raw = window.localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* storage blocked or bad JSON */ }
    return memory[key] || null;
  }
  function store(key, value) {
    memory[key] = value;
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* keep in memory */ }
  }
  function drop(key) {
    delete memory[key];
    try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  /* ---------- text helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function md(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong class="key">$1</strong>'); }
  // Gentle wording guard for any text from outside (AI): we never show those two words.
  function soften(s) { return String(s || '').replace(/\b(wrong|incorrect)\b/gi, 'not yet there'); }
  function mmss(ms) { var t = Math.floor((ms || 0) / 1000); return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2); }
  function words(s) { var t = String(s || '').trim(); return t ? t.split(/\s+/).length : 0; }

  /* ---------- state ---------- */
  function freshState() {
    return {
      v: 1, screen: 'welcome', sessionNo: 1, activeMs: 0, timeUp: false, ended: false,
      diag: { step: 0, sel: null, answers: {} },
      plan: null, tasksDone: 0, current: null, feedback: null,
      history: [], formatsUsed: [], explainUsed: false, usedSigs: [],
      misses: { M1: 0, M2: 0 }, lastTag: null, sameTagStreak: 0, lastFormat: null, lastTarget: null,
      createdAt: new Date().toISOString()
    };
  }
  function sane(s) {
    if (!s || s.v !== 1 || typeof s.screen !== 'string') return freshState();
    var f = freshState();
    Object.keys(f).forEach(function (k) { if (s[k] === undefined) s[k] = f[k]; });
    return s;
  }
  var state = sane(load(STATE_KEY));
  var logs = load(LOG_KEY);
  if (!Array.isArray(logs)) logs = [];
  var view = null;          // transient screens: resume, stopped, about, log
  var viewStack = [];
  var checking = false;

  function save() { state.savedAt = new Date().toISOString(); store(STATE_KEY, state); }
  function hasProgress(s) { return !s.ended && s.screen !== 'welcome'; }

  function log(type, data) {
    var entry = {
      ts: new Date().toISOString(), session: state.sessionNo, type: type,
      screen: view || state.screen, task: state.current ? state.tasksDone + 1 : state.tasksDone
    };
    if (data) Object.keys(data).forEach(function (k) { entry[k] = data[k]; });
    logs.push(entry);
    if (logs.length > 3000) logs = logs.slice(-3000);
    store(LOG_KEY, logs);
  }

  /* ---------- session timer (active time only) ---------- */
  var lastTick = Date.now();
  var lastTouch = Date.now();
  var tickCount = 0;
  function isCounting() {
    return !view && !state.ended && !state.timeUp &&
      COUNTING_SCREENS.indexOf(state.screen) !== -1 &&
      document.visibilityState !== 'hidden' &&
      (Date.now() - lastTouch) < IDLE_MS;
  }
  function tick() {
    var now = Date.now();
    var dt = Math.min(now - lastTick, 2000);
    lastTick = now;
    if (isCounting()) {
      state.activeMs = Math.min(LIMIT, state.activeMs + dt);
      if (state.activeMs >= LIMIT && !state.timeUp) {
        state.timeUp = true;
        log('time_up', { activeSec: Math.round(state.activeMs / 1000) });
        save();
      }
      if (++tickCount % 5 === 0) save();
    }
    updateBar();
  }
  function updateBar() {
    var pct = Math.min(100, (state.activeMs / LIMIT) * 100);
    var fill = document.getElementById('sessionFill');
    var text = document.getElementById('sessionText');
    var st = document.getElementById('sessionState');
    var bar = document.getElementById('sessionBar');
    if (fill) { fill.style.width = pct + '%'; fill.className = 'session-fill' + (pct >= 90 ? ' late' : ''); }
    if (text) text.textContent = mmss(state.activeMs) + ' of 10:00';
    if (bar) bar.setAttribute('aria-valuenow', String(Math.round(state.activeMs / 1000)));
    if (st) {
      var on = isCounting();
      st.textContent = state.ended ? 'session done' : (state.timeUp ? 'time is up' : (on ? 'counting' : 'paused'));
      st.className = 'session-state' + (on ? ' on' : '');
    }
    var banner = document.getElementById('timeBanner');
    if (banner) {
      banner.innerHTML = state.timeUp && !state.ended
        ? '<div class="banner">Ten minutes are done. Finish this one, then we stop.</div>'
        : (state.activeMs >= LIMIT - 60000 && !state.ended ? '<div class="banner">About one minute left. No rush.</div>' : '');
    }
  }

  /* ---------- navigation ---------- */
  var root = document.getElementById('screen');
  function go(screen) {
    state.screen = screen;
    view = null; viewStack = [];
    save();
    log('screen', { to: screen });
    render(true);
  }
  function openView(v) { viewStack.push(view); view = v; log('view', { to: v }); render(true); }
  function back() { view = viewStack.length ? viewStack.pop() : null; render(true); }

  function render(toTop) {
    var name = view || state.screen;
    var fn = SCREENS[name] || SCREENS.welcome;
    root.innerHTML = fn();
    if (AFTER[name]) AFTER[name]();
    updateBar();
    if (toTop) {
      window.scrollTo(0, 0);
      try { root.focus({ preventScroll: true }); } catch (e) { root.focus(); }
    }
  }

  /* ---------- small view builders ---------- */
  function codeBlock(lines, hi) {
    return '<div class="code" role="img" aria-label="Python code">' + lines.map(function (l, k) {
      return '<span class="ln' + (k === hi ? ' hi' : '') + '" data-n="' + (k + 1) + '">' + esc(l) + '</span>';
    }).join('') + '</div>';
  }
  function optionsBlock(opts, selected, act) {
    return '<div class="opts" role="radiogroup" aria-label="Choices">' + opts.map(function (o) {
      return '<button type="button" class="opt" role="radio" aria-checked="' + (o.id === selected) + '" data-act="' + act + '" data-id="' + o.id + '">' +
        '<span class="letter">' + o.id.toUpperCase() + '</span><span class="txt">' + esc(o.text) + '</span></button>';
    }).join('') + '</div>';
  }
  function taskNo() { return Math.min(state.tasksDone + 1, MAX); }

  /* ---------- Step through visualiser ---------- */
  var steppers = {};
  function stepperHtml(id) { return '<div class="stepper" id="' + id + '" aria-live="polite"></div>'; }
  function mountStepper(id, spec, title) {
    var key = JSON.stringify(spec);
    if (!steppers[id] || steppers[id].key !== key) steppers[id] = { key: key, sim: Q.simulate(spec), pos: -1, title: title };
    drawStepper(id);
  }
  function drawStepper(id) {
    var el = document.getElementById(id);
    var s = steppers[id];
    if (!el || !s) return;
    var sim = s.sim;
    var st = s.pos >= 0 ? sim.steps[s.pos] : null;
    var hasAcc = !!sim.varName;
    var rows = st ? st.rows : [];
    var nowPass = st && st.i !== null && !st.done ? rows.length : -1;
    var head = '<tr><th>Pass</th><th>i</th>' + (hasAcc ? '<th>' + sim.varName + ' after</th>' : '') + '</tr>';
    var body = rows.length ? rows.map(function (r, k) {
      return '<tr' + (k + 1 === nowPass ? ' class="now"' : '') + '><td>' + r.pass + '</td><td>' + r.i + '</td>' + (hasAcc ? '<td>' + r.acc + '</td>' : '') + '</tr>';
    }).join('') : '<tr class="empty"><td colspan="' + (hasAcc ? 3 : 2) + '">No passes yet</td></tr>';
    var live = st ? 'i = ' + (st.i === null ? '(not yet)' : st.i) + (hasAcc ? '   ' + sim.varName + ' = ' + st.acc : '') : '';
    var atEnd = s.pos >= sim.steps.length - 1;
    el.innerHTML =
      '<h3>Step through' + (s.title ? ': ' + esc(s.title) : '') + '</h3>' +
      codeBlock(sim.lines, st ? st.line : -1) +
      '<div class="say">' + esc(st ? st.note : 'Tap Next step. We run the loop one line at a time.') + '</div>' +
      (live ? '<p class="mono"><strong>' + esc(live) + '</strong></p>' : '') +
      '<table class="vt"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>' +
      '<p class="small"><strong>Output:</strong></p><span class="out">' + esc(st && st.out.length ? st.out.join('\n') : ' ') + '</span>' +
      '<div class="btn-row" style="margin-top:10px">' +
      '<button type="button" class="btn" data-act="stepReset" data-id="' + id + '">Start again</button>' +
      '<button type="button" class="btn btn-main" data-act="stepNext" data-id="' + id + '"' + (atEnd ? ' disabled' : '') + '>' + (atEnd ? 'Done' : 'Next step') + '</button>' +
      '</div>';
  }

  /* ---------- screens ---------- */
  var SCREENS = {};
  var AFTER = {};

  SCREENS.welcome = function () {
    var again = state.ended;
    return '<p class="hello" aria-hidden="true">👋</p>' +
      '<h1>Namaskar! Let us learn loops together.</h1>' +
      '<p>We go one small step at a time.</p>' +
      '<p>Each session is just <strong>10 minutes</strong>.</p>' +
      '<div class="term">Today: <strong>for loops</strong> with <strong>range</strong> in Python.</div>' +
      '<p>Getting stuck is normal here. It helps us learn.</p>' +
      '<p class="muted">You can stop any time. Your work is saved on this phone.</p>' +
      '<div class="actions"><button type="button" class="btn btn-main" data-act="start">' +
      (again ? 'Start a new 10-minute session' : 'Start') + '</button></div>';
  };

  SCREENS.resume = function () {
    var where;
    if (state.screen === 'diagnostic') where = 'the warm-up';
    else if (state.screen === 'learn') where = 'the short lesson';
    else if (state.screen === 'summary') where = 'your summary';
    else where = 'task ' + taskNo();
    return '<h1>Welcome back!</h1>' +
      '<p>Your work is saved. Nothing is lost.</p>' +
      '<div class="term">Let us continue from <strong>' + esc(where) + '</strong>.</div>' +
      '<p class="muted">Time used in this session: ' + mmss(state.activeMs) + ' of 10:00. Tasks done: ' + state.tasksDone + ' of ' + MAX + '.</p>' +
      '<div class="actions">' +
      '<button type="button" class="btn btn-main" data-act="continue">Continue from ' + esc(where) + '</button>' +
      '<button type="button" class="btn btn-soft" data-act="startOver">Start over</button>' +
      '</div>';
  };

  SCREENS.stopped = function () {
    var where = state.screen === 'task' || state.screen === 'feedback' ? 'task ' + taskNo() : 'where you stopped';
    return '<h1>Saved. Good work today.</h1>' +
      '<p>Your work is safe on this phone.</p>' +
      '<div class="term">When you come back, we continue from <strong>' + esc(where) + '</strong>.</div>' +
      '<p>Small steps, done often, add up.</p>' +
      '<div class="actions"><button type="button" class="btn btn-main" data-act="continue">Continue now</button></div>';
  };

  SCREENS.diagnostic = function () {
    var d = state.diag;
    if (d.step >= 2) {
      return '<span class="pill">Warm-up done</span>' +
        '<h1>Thanks, this helps me choose where to start.</h1>' +
        '<p>Next, a short lesson. It has four small cards.</p>' +
        '<div class="actions"><button type="button" class="btn btn-main" data-act="toLearn">Go to the lesson</button></div>';
    }
    var q = Q.DIAGNOSTIC[d.step];
    return '<div id="timeBanner"></div>' +
      '<span class="pill">Warm-up ' + (d.step + 1) + ' of 2</span>' +
      (d.step === 0 ? '<h1>Two quick questions first.</h1><p>No marks here. Just pick what you think.</p>' : '<h1>One more quick one.</h1>') +
      '<p><strong>' + esc(q.prompt) + '</strong></p>' +
      codeBlock(q.code) +
      optionsBlock(q.options, d.sel, 'diagPick') +
      '<div class="actions"><button type="button" class="btn btn-main" data-act="diagNext"' + (d.sel ? '' : ' disabled') + '>Next</button></div>';
  };

  SCREENS.learn = function () {
    var p = state.plan || { target: 'M1' };
    var m = state.misses || {};
    var focus1 = p.target === 'M1' && m.M1 > 0, focus2 = p.target === 'M2' && m.M2 > 0;
    var flag = '<p class="small"><strong>Let us look closely at this one.</strong></p>';
    return '<div id="timeBanner"></div>' +
      '<span class="pill">Short lesson</span>' +
      '<h1>Four small ideas about loops</h1>' +
      '<div class="card"><span class="num">1</span>A <strong class="key">loop</strong> repeats lines for us. The lines pushed to the right are the <strong class="key">body</strong>.</div>' +
      '<div class="card' + (focus1 ? ' focus' : '') + '">' + (focus1 ? flag : '') + '<span class="num">2</span><strong class="key">range(4)</strong> gives 0, 1, 2, 3. It starts at <strong>0</strong> and stops <strong>before</strong> 4.</div>' +
      '<div class="card' + (focus2 ? ' focus' : '') + '">' + (focus2 ? flag : '') + '<span class="num">3</span>On each pass, <strong class="key">i gets the next value</strong>. So i changes every time the body runs.</div>' +
      '<div class="card"><span class="num">4</span>range(4) has four values, so the body runs <strong class="key">4 times</strong>. Let us watch it below.</div>' +
      stepperHtml('stepLearn') +
      '<div class="actions"><button type="button" class="btn btn-main" data-act="ready">I am ready</button></div>';
  };
  AFTER.learn = function () { mountStepper('stepLearn', Q.DEFAULT_SPEC, 'our first loop'); };

  function canCheck() {
    var c = state.current;
    if (!c) return false;
    var f = c.q.format;
    if (f === 'predict' || f === 'fix') return !!c.answer;
    if (f === 'trace') return c.answer.some(function (r) { return String(r.i).trim() !== '' || String(r.acc).trim() !== ''; });
    return words(c.answer) >= 1;
  }

  SCREENS.task = function () {
    if (!state.current) { setTimeout(nextTask, 0); return '<p>Getting your next task ready.</p>'; }
    var c = state.current, q = c.q;
    var hintsLeft = 2 - c.hints;
    var body;
    if (q.format === 'predict' || q.format === 'fix') {
      body = optionsBlock(q.options, c.answer, 'pick');
    } else if (q.format === 'trace') {
      body = '<table class="trace"><thead><tr><th>Pass</th><th>i</th><th>total after</th></tr></thead><tbody>' +
        c.answer.map(function (row, k) {
          return '<tr><td class="pass">' + (k + 1) + '</td>' +
            '<td><input type="text" inputmode="numeric" autocomplete="off" maxlength="4" aria-label="Pass ' + (k + 1) + ' i" data-trace="' + k + '" data-col="i" value="' + esc(row.i) + '"></td>' +
            '<td><input type="text" inputmode="numeric" autocomplete="off" maxlength="4" aria-label="Pass ' + (k + 1) + ' total" data-trace="' + k + '" data-col="acc" value="' + esc(row.acc) + '"></td></tr>';
        }).join('') + '</tbody></table>';
    } else {
      body = '<label for="explainBox" class="small"><strong>Your answer</strong> (a sentence or two is enough)</label>' +
        '<textarea id="explainBox" maxlength="500" placeholder="I think i ...">' + esc(c.answer) + '</textarea>';
    }
    var hints = q.hints.slice(0, c.hints).map(function (h, k) {
      return '<div class="hint"><strong>Hint ' + (k + 1) + ':</strong> ' + md(h) + '</div>';
    }).join('');
    return '<div id="timeBanner"></div>' +
      '<p><span class="pill">Task ' + taskNo() + ' of ' + MAX + '</span> <span class="muted small">' + FORMAT_LABEL[q.format] + '</span></p>' +
      '<h1 style="font-size:1.2rem">' + md(q.prompt) + '</h1>' +
      codeBlock(q.code) + body + hints +
      (c.showStep ? stepperHtml('stepTask') : '') +
      '<div class="btn-row" style="margin-top:12px">' +
      '<button type="button" class="btn" data-act="hint"' + (hintsLeft <= 0 ? ' disabled' : '') + '>' + (hintsLeft > 0 ? 'Hint (' + hintsLeft + ' left)' : 'No hints left') + '</button>' +
      '<button type="button" class="btn" data-act="toggleStep">' + (c.showStep ? 'Hide Step through' : 'Step through') + '</button>' +
      '</div>' +
      '<div class="actions"><button type="button" class="btn btn-main" id="checkBtn" data-act="check"' + (canCheck() ? '' : ' disabled') + '>Check</button></div>';
  };
  AFTER.task = function () {
    if (state.current && state.current.showStep) mountStepper('stepTask', Q.DEFAULT_SPEC, 'a similar loop');
  };

  function kindLine(ev) {
    if (ev.result === 'correct') return 'You got it!';
    if (ev.result === 'partial') return 'Nearly there. Part of this fits.';
    return 'Not yet, and that is okay.';
  }
  function effortLine(f) {
    if (f.hints > 0 || f.help) return 'You asked for help when you needed it. That is a smart strategy.';
    if (f.timeSec >= 60) return 'You took your time and thought it through. Good strategy.';
    if (f.ev.result === 'correct') return 'You read the range carefully. That strategy works.';
    return 'You gave it a real try. That is how we learn.';
  }
  function tagNote(tag) {
    if (tag === 'M1') return 'Remember: range stops <strong class="key">before</strong> the end number. <strong class="key">range(4)</strong> is 0, 1, 2, 3.';
    if (tag === 'M2') return 'Remember: <strong class="key">i gets a new value</strong> on every pass. The body runs once for each value.';
    return '';
  }
  function answerSummary(f) {
    var q = f.q, ev = f.ev;
    if (q.format === 'predict' || q.format === 'fix') {
      var right = q.options.filter(function (o) { return o.correct; })[0];
      return '<p class="small"><strong>You picked:</strong></p><span class="out">' + esc(ev.chosen || '') + '</span>' +
        (ev.result === 'correct' ? '' : '<p class="small" style="margin-top:8px"><strong>' + (q.format === 'fix' ? 'The fix that works:' : 'The loop prints:') + '</strong></p><span class="out">' + esc(right.text) + '</span>');
    }
    if (q.format === 'trace') {
      var rows = q.expected.map(function (r, k) { return '<tr><td>' + (k + 1) + '</td><td>' + r.i + '</td><td>' + r.acc + '</td></tr>'; }).join('');
      rows += '<tr class="empty"><td>' + (q.expected.length + 1) + '</td><td colspan="2">empty: the loop has stopped</td></tr>';
      return '<p class="small"><strong>Here is the full trace.</strong> Your boxes that match: ' + ev.matched + ' of ' + ev.of + '.</p>' +
        '<table class="vt"><thead><tr><th>Pass</th><th>i</th><th>total after</th></tr></thead><tbody>' + rows + '</tbody></table>';
    }
    return '<p class="small"><strong>You wrote:</strong></p><span class="out">' + esc(f.answer) + '</span>';
  }

  SCREENS.feedback = function () {
    var f = state.feedback;
    if (!f) { setTimeout(function () { go('task'); }, 0); return ''; }
    var ending = E.shouldEndSession({ tasksDone: state.tasksDone, activeMs: state.activeMs });
    var aiBlock = '';
    if (f.q.format === 'explain' && f.ev.feedback) {
      aiBlock = '<div class="note">' + esc(soften(f.ev.feedback)) + '</div>' +
        '<p class="muted small">' + (f.ev.source === 'ai' ? 'Checked by the AI helper.' : 'Quick check on this phone (AI helper not reached).') + '</p>';
    }
    return '<div id="timeBanner"></div>' +
      '<p><span class="pill">Task ' + state.tasksDone + ' of ' + MAX + '</span></p>' +
      '<p class="kind">' + kindLine(f.ev) + '</p>' +
      '<p>' + effortLine(f) + '</p>' +
      (f.ev.result !== 'correct' ? '<p>Let us look again.</p>' : '') +
      '<div class="card">' + answerSummary(f) + '<p style="margin-top:10px">' + md(f.q.explain) + '</p>' +
      (f.ev.tag ? '<div class="term">' + tagNote(f.ev.tag) + '</div>' : '') + '</div>' +
      aiBlock +
      (f.showStep ? stepperHtml('stepFeedback') :
        '<button type="button" class="btn btn-soft" data-act="feedbackStep">See this loop step by step</button>') +
      '<div class="next-step"><strong>Next step:</strong> ' +
      esc(ending ? 'That was the last task for now. Let us see what you did.' : f.d.message) + '</div>' +
      '<div class="actions"><button type="button" class="btn btn-main" data-act="next">' + (ending ? 'See my summary' : 'Next') + '</button></div>';
  };
  AFTER.feedback = function () {
    var f = state.feedback;
    if (f && f.showStep) mountStepper('stepFeedback', f.q.traceSpec || Q.DEFAULT_SPEC, f.q.traceSpec ? 'this loop' : 'a similar loop');
  };

  SCREENS.summary = function () {
    var mine = state.history.filter(function (h) { return h.session === state.sessionNo; });
    var hints = mine.reduce(function (a, h) { return a + (h.hints || 0); }, 0);
    var helps = mine.filter(function (h) { return h.help; }).length;
    var formats = [];
    mine.forEach(function (h) { if (formats.indexOf(FORMAT_LABEL[h.format]) === -1) formats.push(FORMAT_LABEL[h.format]); });
    function ideaRow(tag) {
      var on = mine.filter(function (h) { return h.target === tag || h.tag === tag; });
      var last = on.length ? on[on.length - 1] : null;
      var ok = last && last.result === 'correct';
      var txt = !last ? 'We will try this next time.' : (ok ? 'Getting stronger. Your last one on this fit.' : 'Let us keep practising this next time.');
      return '<div class="card idea"><span class="dot' + (ok ? ' ok' : '') + '"></span><div><strong>' + esc(IDEA[tag]) + '</strong><br><span class="small">' + txt + '</span></div></div>';
    }
    var effort = hints + helps > 0
      ? 'You used help ' + (hints + helps) + ' time' + (hints + helps === 1 ? '' : 's') + '. Asking for help is a smart strategy.'
      : 'You kept going on your own. That takes effort.';
    var nextIdea = state.plan ? IDEA[state.plan.target] : IDEA.M1;
    return '<span class="pill">Session complete</span>' +
      '<h1>Well done for showing up today!</h1>' +
      '<p>We worked for <strong>' + mmss(state.activeMs) + '</strong>. You finished <strong>' + mine.length + ' tasks</strong>.</p>' +
      '<p>Formats you tried: ' + esc(formats.join(', ') || 'none yet') + '.</p>' +
      '<h2>Ideas we practised</h2>' + ideaRow('M1') + ideaRow('M2') +
      '<h2>Your effort</h2><p>' + esc(effort) + '</p>' +
      '<div class="term">Next time, we start with: <strong>' + esc(nextIdea) + '</strong>.</div>' +
      '<div class="actions"><button type="button" class="btn btn-main" data-act="newSession">Start a new 10-minute session</button></div>';
  };

  SCREENS.about = function () {
    return '<h1>About Loop Buddy</h1>' +
      '<div class="card"><dl class="facts">' +
      '<dt>Identity</dt><dd><strong>25M1030</strong></dd>' +
      '<dt>Course</dt><dd>ET 617 End-Semester</dd>' +
      '<dt>Card</dt><dd><strong>P4, T10, L5, C4</strong></dd></dl></div>' +
      '<div class="card"><p><strong>P4</strong> Adaptive tutor with automatic question generation.</p>' +
      '<p><strong>T10</strong> Loops in Python: for loops with range (Class 8-11).</p>' +
      '<p><strong>L5</strong> A learner repeating the topic after failing once. High anxiety, low self-efficacy.</p>' +
      '<p style="margin:0"><strong>C4</strong> 10-minute sessions with stop and resume.</p></div>' +
      '<h2>Learner persona</h2>' +
      '<div class="card"><p><strong>Ananya Deshmukh</strong>, 15, Class 9, Pune.</p>' +
      '<p>Speaks Marathi at home and studies in an English-medium school.</p>' +
      '<p>Studies alone on her Android phone for about 10 minutes in the evening.</p>' +
      '<p style="margin:0">She failed the loops unit once and expects to fail again. So this app stays calm, short and kind.</p></div>' +
      '<h2>What it looks for</h2>' +
      '<div class="card"><p><strong>M1 off-by-one:</strong> thinking range(n) includes n, or that counting starts at 1.</p>' +
      '<p style="margin:0"><strong>M2 variable does not change:</strong> thinking i stays the same, or the body runs only once.</p></div>' +
      '<h2>How it adapts</h2>' +
      '<div class="card small"><p>The warm-up sets the start level and the first idea to practise.</p>' +
      '<p><strong>R1</strong> Got it, no help, under 90 s: a harder one.</p>' +
      '<p><strong>R2</strong> Got it with help or slowly: one more at this level.</p>' +
      '<p><strong>R3</strong> Not yet, M1 or M2 seen: one small idea first, one level easier.</p>' +
      '<p style="margin:0"><strong>R4</strong> Not yet again in the same way: the same idea, shown another way (trace + Step through).</p></div>' +
      '<div class="actions">' +
      '<button type="button" class="btn btn-main" data-act="openLog">Open the learning log</button>' +
      '<button type="button" class="btn btn-soft" data-act="back">Back</button></div>';
  };

  var LOG_COLS = ['ts', 'session', 'type', 'screen', 'task', 'qid', 'format', 'level', 'result', 'tag', 'hints', 'timeSec', 'action', 'rule', 'source'];
  var LOG_KNOWN = LOG_COLS.concat([]);
  function logExtra(e) {
    return Object.keys(e).filter(function (k) { return LOG_KNOWN.indexOf(k) === -1; }).map(function (k) {
      var v = e[k]; if (typeof v === 'object') v = JSON.stringify(v);
      return k + '=' + String(v).slice(0, 120);
    }).join('; ');
  }
  SCREENS.log = function () {
    var rows = logs.slice().reverse().map(function (e) {
      return '<tr>' + LOG_COLS.map(function (c) {
        var v = e[c] == null ? '' : e[c];
        if (c === 'ts') v = String(v).replace('T', ' ').slice(0, 19);
        return '<td>' + esc(v) + '</td>';
      }).join('') + '<td>' + esc(logExtra(e)) + '</td></tr>';
    }).join('');
    return '<h1>Learning log</h1>' +
      '<p class="muted">' + logs.length + ' events on this phone, newest first. Scroll the table sideways.</p>' +
      '<div class="tablewrap"><table class="log"><thead><tr>' +
      LOG_COLS.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '<th>details</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="' + (LOG_COLS.length + 1) + '">No events yet.</td></tr>') + '</tbody></table></div>' +
      '<div class="actions">' +
      '<div class="btn-row"><button type="button" class="btn" data-act="csv">Download CSV</button>' +
      '<button type="button" class="btn" data-act="clearLog">Clear log</button></div>' +
      '<button type="button" class="btn btn-main" data-act="back">Back</button></div>';
  };

  /* ---------- flow actions ---------- */
  function initialAnswer(q) {
    if (q.format === 'trace') { var a = []; for (var k = 0; k < q.rowsShown; k++) a.push({ i: '', acc: '' }); return a; }
    if (q.format === 'explain') return '';
    return null;
  }
  function nextTask() {
    var p = state.plan || { level: 1, target: 'M1', format: 'predict' };
    var seed = (Date.now() ^ Math.imul(state.tasksDone + 1, 2654435761)) >>> 0;
    var q = Q.generate({ format: p.format, level: p.level, target: p.target, seed: seed, avoid: state.usedSigs });
    state.usedSigs.push(q.sig);
    if (state.usedSigs.length > 200) state.usedSigs = state.usedSigs.slice(-200);
    state.current = { q: q, startMs: state.activeMs, hints: 0, help: false, showStep: false, answer: initialAnswer(q) };
    log('task_start', { qid: q.id, format: q.format, level: q.level, target: q.tags[0] });
    go('task');
  }
  function endSession() {
    state.ended = true;
    log('session_end', { tasksDone: state.tasksDone, activeSec: Math.round(state.activeMs / 1000) });
    go('summary');
  }
  function newSession() {
    state.sessionNo += 1;
    state.activeMs = 0; state.timeUp = false; state.ended = false;
    state.tasksDone = 0; state.formatsUsed = []; state.explainUsed = false;
    state.current = null; state.feedback = null;
    log('session_start', { returning: true });
    go(state.plan ? 'learn' : 'diagnostic');
  }

  function evaluateExplain(q, text) {
    var local = Q.evaluateExplainLocal(q, text);
    local.source = 'local';
    if (typeof fetch !== 'function' || location.protocol === 'file:') return Promise.resolve(local);
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 10000);
    return fetch('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: q.prompt, code: q.code.join('\n'), rubric: q.rubric, target: q.tags[0], answer: String(text).slice(0, 500) }),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('status ' + r.status);
      return r.json();
    }).then(function (j) {
      if (['correct', 'partial', 'notyet'].indexOf(j.verdict) === -1) throw new Error('bad verdict');
      return {
        result: j.verdict,
        tag: (j.tag === 'M1' || j.tag === 'M2') ? j.tag : null,
        feedback: soften(String(j.feedback || '')).slice(0, 400) || local.feedback,
        source: 'ai'
      };
    }).catch(function (err) {
      clearTimeout(timer);
      log('ai_fallback', { reason: String(err && err.message || err).slice(0, 80) });
      return local;
    });
  }

  function record(ev) {
    var c = state.current, q = c.q;
    var timeSec = Math.round((state.activeMs - c.startMs) / 1000);
    var tag = ev.tag || null;
    if (tag) state.misses[tag] = (state.misses[tag] || 0) + 1;
    state.sameTagStreak = tag ? (tag === state.lastTag ? state.sameTagStreak + 1 : 1) : 0;
    state.lastTag = tag;
    if (state.formatsUsed.indexOf(q.format) === -1) state.formatsUsed.push(q.format);
    if (q.format === 'explain') state.explainUsed = true;
    state.tasksDone += 1;

    var d = E.decideNext({
      result: ev.result, tag: tag, hintsUsed: c.hints, helpUsed: c.help, timeSec: timeSec,
      level: q.level, lastTarget: q.tags[0], lastFormat: q.format, sameTagStreak: state.sameTagStreak,
      misses: state.misses, formatsUsed: state.formatsUsed, explainUsed: state.explainUsed, tasksDone: state.tasksDone
    });
    state.plan = { level: d.level, target: d.target, format: d.format };
    state.lastFormat = q.format; state.lastTarget = q.tags[0];

    var answerText = q.format === 'trace' ? JSON.stringify(c.answer) : String(c.answer == null ? '' : c.answer);
    state.history.push({
      session: state.sessionNo, n: state.tasksDone, qid: q.id, format: q.format, level: q.level, target: q.tags[0],
      result: ev.result, tag: tag, hints: c.hints, help: c.help, timeSec: timeSec, action: d.action, rule: d.rule
    });
    state.feedback = { q: q, ev: ev, d: d, answer: c.answer, hints: c.hints, help: c.help, timeSec: timeSec, showStep: false };
    log('answer', {
      task: state.tasksDone, qid: q.id, format: q.format, level: q.level, result: ev.result, tag: tag,
      hints: c.hints, timeSec: timeSec, source: ev.source || 'rule', answer: answerText.slice(0, 200), stepThroughUsed: c.help
    });
    log('decision', {
      task: state.tasksDone, action: d.action, rule: d.rule, nextLevel: d.level, nextTarget: d.target, nextFormat: d.format, coverage: d.coverage
    });
    state.current = null;
    save();                                   // auto-save after every answer
    go('feedback');
  }

  /* ---------- event handling (tap only, no hover) ---------- */
  var ACTIONS = {
    start: function () {
      if (state.ended) return newSession();
      log('session_start', { returning: false });
      go('diagnostic');
    },
    continue: function () {
      log('resume', { at: state.screen, task: taskNo() });
      view = null; viewStack = [];
      lastTouch = Date.now();
      render(true);
    },
    startOver: function (el) {
      if (el.dataset.armed !== '1') {
        el.dataset.armed = '1'; el.textContent = 'Tap again to start over';
        setTimeout(function () { if (el.isConnected) { el.dataset.armed = ''; el.textContent = 'Start over'; } }, 4000);
        return;
      }
      log('start_over', {});
      state = freshState(); view = null; viewStack = [];
      save(); render(true);
    },
    saveStop: function () {
      save();
      log('save_stop', { at: state.screen, activeSec: Math.round(state.activeMs / 1000) });
      if (view === 'stopped') return;
      viewStack = []; view = 'stopped'; render(true);
    },
    about: function () { if (view !== 'about') openView('about'); },
    openLog: function () { openView('log'); },
    back: function () { back(); },
    diagPick: function (el) { state.diag.sel = el.dataset.id; save(); render(false); },
    diagNext: function () {
      var d = state.diag, q = Q.DIAGNOSTIC[d.step];
      if (!d.sel) return;
      var ev = Q.evaluateChoice(q, d.sel);
      d.answers[q.id] = { correct: ev.result === 'correct', tag: ev.tag, choice: d.sel };
      log('diag_answer', { qid: q.id, result: ev.result, tag: ev.tag, choice: d.sel });
      d.step += 1; d.sel = null;
      if (d.step === 2) {
        var plan = E.startPlan(d.answers);
        state.plan = { level: plan.level, target: plan.target, format: plan.format };
        state.misses = { M1: plan.misses.M1, M2: plan.misses.M2 };
        log('profile', { level: plan.level, target: plan.target, rule: plan.rule });
      }
      save(); render(true);
    },
    toLearn: function () { go('learn'); },
    ready: function () {
      log('learn_done', {});
      if (E.shouldEndSession({ tasksDone: state.tasksDone, activeMs: state.activeMs })) return endSession();
      nextTask();
    },
    stepNext: function (el) {
      var s = steppers[el.dataset.id]; if (!s) return;
      if (s.pos < s.sim.steps.length - 1) s.pos += 1;
      log('step_through', { where: el.dataset.id, step: s.pos + 1, line: s.sim.steps[s.pos].line + 1 });
      drawStepper(el.dataset.id);
    },
    stepReset: function (el) {
      var s = steppers[el.dataset.id]; if (!s) return;
      s.pos = -1; drawStepper(el.dataset.id);
    },
    pick: function (el) { state.current.answer = el.dataset.id; save(); render(false); },
    hint: function () {
      var c = state.current; if (!c || c.hints >= 2) return;
      c.hints += 1;
      log('hint', { qid: c.q.id, hintNo: c.hints });
      save(); render(false);
    },
    toggleStep: function () {
      var c = state.current; if (!c) return;
      c.showStep = !c.showStep;
      if (c.showStep) { c.help = true; log('help_step_through', { qid: c.q.id }); }
      save(); render(false);
      if (c.showStep) { var el = document.getElementById('stepTask'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' }); }
    },
    check: function (el) {
      if (checking || !canCheck()) return;
      var c = state.current, q = c.q;
      if (q.format === 'predict' || q.format === 'fix') return record(Q.evaluateChoice(q, c.answer));
      if (q.format === 'trace') return record(Q.evaluateTrace(q, c.answer));
      checking = true;
      el.disabled = true;
      el.innerHTML = '<span class="spinner" aria-hidden="true"></span>Let us see…';
      evaluateExplain(q, c.answer).then(function (ev) { checking = false; record(ev); });
    },
    feedbackStep: function () {
      if (!state.feedback) return;
      state.feedback.showStep = true;
      log('feedback_step_through', { qid: state.feedback.q.id });
      save(); render(false);
    },
    next: function () {
      if (E.shouldEndSession({ tasksDone: state.tasksDone, activeMs: state.activeMs })) return endSession();
      nextTask();
    },
    newSession: function () { newSession(); },
    csv: function () {
      var cols = LOG_COLS.concat(['details']);
      var lines = [cols.join(',')].concat(logs.map(function (e) {
        return cols.map(function (c) {
          var v = c === 'details' ? logExtra(e) : (e[c] == null ? '' : String(e[c]));
          return '"' + v.replace(/"/g, '""') + '"';
        }).join(',');
      }));
      try {
        var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'learning-log-25M1030.csv';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      } catch (e) { /* download not supported */ }
    },
    clearLog: function (el) {
      if (el.dataset.armed !== '1') {
        el.dataset.armed = '1'; el.textContent = 'Tap again to clear';
        setTimeout(function () { if (el.isConnected) { el.dataset.armed = ''; el.textContent = 'Clear log'; } }, 4000);
        return;
      }
      logs = []; drop(LOG_KEY); render(false);
    }
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el || el.disabled) return;
    lastTouch = Date.now();
    var fn = ACTIONS[el.dataset.act];
    if (fn) fn(el);
  });
  document.addEventListener('input', function (e) {
    lastTouch = Date.now();
    var t = e.target, c = state.current;
    if (!c) return;
    if (t.dataset && t.dataset.trace !== undefined) {
      c.answer[Number(t.dataset.trace)][t.dataset.col] = t.value.replace(/[^0-9-]/g, '');
      if (t.value !== c.answer[Number(t.dataset.trace)][t.dataset.col]) t.value = c.answer[Number(t.dataset.trace)][t.dataset.col];
    } else if (t.id === 'explainBox') {
      c.answer = t.value;
    } else return;
    var btn = document.getElementById('checkBtn');
    if (btn && !checking) btn.disabled = !canCheck();
    save();                                   // drafts are saved as the learner types
  });
  ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(function (ev) {
    window.addEventListener(ev, function () { lastTouch = Date.now(); }, { passive: true });
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') save();
    lastTick = Date.now();
  });
  window.addEventListener('pagehide', save);

  /* ---------- start ---------- */
  if (hasProgress(state)) view = 'resume';
  render(true);
  setInterval(tick, 1000);
})();

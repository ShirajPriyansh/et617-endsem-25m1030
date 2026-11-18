/*
 * data/questions.js
 * ET 617 | 25M1030
 *
 * Question bank with AUTOMATIC QUESTION GENERATION for "for loops with range".
 * Every generated question comes from a small "loop spec". The same spec drives:
 *   - the code shown to the learner,
 *   - the correct answer (by simulating the loop),
 *   - the distractors (by simulating the loop the way each misconception would),
 *   - the Step through visualiser.
 *
 * Misconception tags:
 *   M1 = off-by-one ("range(n) includes n" or "counting starts at 1")
 *   M2 = variable does not change / body runs only once
 */
(function (root) {
  'use strict';

  /* ---------- small seeded random helpers (so a question is reproducible) ---------- */
  function makeRng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function int(r, lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); }
  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
  function shuffle(r, arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ---------- loop spec -> code + simulation ----------
   * spec = {
   *   kind: 'print' | 'acc' | 'accEach',
   *   start, stop, step,          // range(start, stop, step)
   *   init, add,                  // for acc kinds: v = init; v = v + add  (add is 'i' or a number as text)
   *   varName                     // default 'total'
   * }
   */
  function rangeText(s) {
    var step = s.step || 1, start = s.start || 0;
    if (step !== 1) return 'range(' + start + ', ' + s.stop + ', ' + step + ')';
    if (start !== 0) return 'range(' + start + ', ' + s.stop + ')';
    return 'range(' + s.stop + ')';
  }
  function rangeValues(s) {
    var out = [], step = s.step || 1;
    for (var v = s.start || 0; v < s.stop; v += step) out.push(v);
    return out;
  }
  function addOf(spec, i) { return spec.add === 'i' ? i : Number(spec.add); }

  function codeLines(spec) {
    var r = rangeText(spec);
    if (spec.kind === 'print') return ['for i in ' + r + ':', '    print(i)'];
    var v = spec.varName || 'total';
    var lines = [v + ' = ' + spec.init, 'for i in ' + r + ':', '    ' + v + ' = ' + v + ' + ' + spec.add];
    lines.push(spec.kind === 'accEach' ? '    print(' + v + ')' : 'print(' + v + ')');
    return lines;
  }

  /* Returns every step of running the loop, for the visualiser and for answers. */
  function simulate(spec) {
    var lines = codeLines(spec);
    var vals = rangeValues(spec);
    var v = spec.varName || 'total';
    var steps = [], out = [], rows = [];
    function snap(line, i, acc, note, done) {
      steps.push({ line: line, i: i, acc: acc, out: out.slice(), rows: rows.slice(), note: note, done: !!done });
    }
    if (spec.kind === 'print') {
      vals.forEach(function (val, k) {
        snap(0, val, null, 'Pass ' + (k + 1) + ': i gets the next value. Now i is ' + val + '.');
        out.push(String(val));
        rows.push({ pass: k + 1, i: val, acc: null });
        snap(1, val, null, 'print(i) shows ' + val + '.');
      });
      snap(0, vals.length ? vals[vals.length - 1] : null, null,
        'No values are left in ' + rangeText(spec) + '. The loop stops.', true);
      return { lines: lines, steps: steps, output: out, values: vals, varName: null, final: null, rows: rows };
    }
    var acc = spec.init;
    snap(0, null, acc, v + ' starts at ' + acc + '.');
    vals.forEach(function (val, k) {
      snap(1, val, acc, 'Pass ' + (k + 1) + ': i gets the next value. Now i is ' + val + '.');
      var old = acc;
      acc = old + addOf(spec, val);
      rows.push({ pass: k + 1, i: val, acc: acc });
      snap(2, val, acc, v + ' = ' + old + ' + ' + addOf(spec, val) + ' = ' + acc + '.');
      if (spec.kind === 'accEach') {
        out.push(String(acc));
        snap(3, val, acc, 'print(' + v + ') shows ' + acc + '.');
      }
    });
    snap(1, vals.length ? vals[vals.length - 1] : null, acc, 'No values are left. The loop stops.');
    if (spec.kind === 'acc') {
      out.push(String(acc));
      snap(3, vals.length ? vals[vals.length - 1] : null, acc,
        'print(' + v + ') is not inside the loop. It runs once and shows ' + acc + '.', true);
    } else {
      steps[steps.length - 1].done = true;
    }
    return { lines: lines, steps: steps, output: out, values: vals, varName: v, final: acc, rows: rows };
  }

  /* Default Step through example from the brief. */
  var DEFAULT_SPEC = { kind: 'acc', start: 0, stop: 4, step: 1, init: 0, add: 'i', varName: 'total' };

  function outKey(arr) { return arr.join('|'); }
  function outText(arr) { return arr.length ? arr.join('\n') : '(nothing)'; }

  /* ---------- the four generators ---------- */

  // Pick a loop spec for a level and a target misconception.
  function specFor(level, target, r) {
    if (target === 'M1') {
      if (level <= 1) return { kind: 'print', start: 0, stop: int(r, 3, 5), step: 1 };
      if (level === 2) { var s = int(r, 1, 3); return { kind: 'print', start: s, stop: s + int(r, 3, 4), step: 1 }; }
      var s3 = int(r, 1, 3); return { kind: 'print', start: s3, stop: s3 + int(r, 5, 7), step: 2 };
    }
    // M2
    if (level <= 1) return { kind: 'acc', start: 0, stop: int(r, 3, 4), step: 1, init: 0, add: pick(r, ['1', '2']) };
    if (level === 2) return { kind: 'acc', start: 0, stop: pick(r, [3, 5]), step: 1, init: 0, add: 'i' };
    var st = int(r, 0, 1);
    return { kind: 'accEach', start: st, stop: st + 3, step: 1, init: int(r, 0, 2), add: pick(r, ['i', '2']) };
  }

  // Outputs a learner with each misconception would predict.
  function misconceptionOutputs(spec) {
    var sim = simulate(spec);
    var vals = sim.values, step = spec.step || 1;
    var pool = [];
    var extra = simulate(Object.assign({}, spec, { stop: spec.stop + step }));        // includes the stop value
    var shifted = simulate(Object.assign({}, spec, { start: (spec.start || 0) + 1, stop: spec.stop + 1 })); // "starts at 1"
    pool.push({ out: extra.output, tag: 'M1' });
    pool.push({ out: shifted.output, tag: 'M1' });
    if (spec.kind === 'print') {
      pool.push({ out: [String(vals[0])], tag: 'M2' });                               // body runs once
      pool.push({ out: vals.map(function () { return String(vals[0]); }), tag: 'M2' }); // i stays the same
      pool.push({ out: vals.concat([spec.stop]).slice(1).map(String), tag: 'M1' });
    } else if (spec.kind === 'acc') {
      pool.push({ out: [String(spec.init + addOf(spec, vals[0]))], tag: 'M2' });      // only one pass
      pool.push({ out: [String(spec.init)], tag: 'M2' });                             // total never changes
      pool.push({ out: [String(spec.init + addOf(spec, vals[vals.length - 1]))], tag: 'M2' }); // only last pass counts
    } else {
      var first = spec.init + addOf(spec, vals[0]);
      pool.push({ out: [String(first)], tag: 'M2' });
      pool.push({ out: vals.map(function () { return String(first); }), tag: 'M2' });
      pool.push({ out: [String(sim.final)], tag: 'M2' });
    }
    return { sim: sim, pool: pool };
  }

  function buildOptions(r, correctOut, pool, target) {
    var seen = {}; seen[outKey(correctOut)] = true;
    var clean = [];
    pool.forEach(function (p) {
      var k = outKey(p.out);
      if (!seen[k] && p.out.length) { seen[k] = true; clean.push(p); }
    });
    var first = clean.filter(function (p) { return p.tag === target; });
    var other = clean.filter(function (p) { return p.tag !== target; });
    var chosen = first.slice(0, 2).concat(other.slice(0, 1));
    var rest = first.slice(2).concat(other.slice(1));
    while (chosen.length < 3 && rest.length) chosen.push(rest.shift());
    var opts = [{ text: outText(correctOut), tag: null, correct: true }].concat(chosen.map(function (p) {
      return { text: outText(p.out), tag: p.tag, correct: false };
    }));
    return shuffle(r, opts).map(function (o, idx) { o.id = 'abcd'.charAt(idx); return o; });
  }

  function genPredict(level, target, r) {
    var spec = specFor(level, target, r);
    var m = misconceptionOutputs(spec);
    var sim = m.sim, vals = sim.values, rt = rangeText(spec), n = vals.length;
    var isPrint = spec.kind === 'print';
    var hints = isPrint
      ? ['Start with ' + rt + '. What is the first value? Where does it stop?',
         rt + ' gives ' + vals.join(', ') + '. It stops **before** ' + spec.stop + '.']
      : ['Count the passes first. How many values does ' + rt + ' give?',
         'The values of i are ' + vals.join(', ') + '. So total changes on **each of these ' + n + ' passes**.'];
    var explain = isPrint
      ? '**' + rt + '** gives ' + vals.join(', ') + '. It stops **before** ' + spec.stop + '. So the loop prints ' + vals.join(', ') + '.'
      : '**' + rt + '** gives ' + n + ' values: ' + vals.join(', ') + '. The body runs **' + n + ' times**, and total changes each time. ' +
        (spec.kind === 'acc' ? 'The last print shows ' + sim.final + '.' : 'Each pass prints the new total.');
    return {
      format: 'predict', level: level, tags: [target],
      sig: 'predict|' + JSON.stringify(spec),
      code: sim.lines,
      prompt: 'What will this code print?' + (sim.output.length > 1 || isPrint ? ' Each print shows on a new line.' : ''),
      options: buildOptions(r, sim.output, m.pool, target),
      hints: hints, explain: explain, traceSpec: spec
    };
  }

  function genTrace(level, target, r) {
    var spec;
    if (level <= 1) spec = { kind: 'acc', start: 0, stop: 3, step: 1, init: 0, add: target === 'M2' ? '2' : 'i' };
    else if (level === 2) spec = pick(r, [
      { kind: 'acc', start: 1, stop: 4, step: 1, init: 0, add: 'i' },
      { kind: 'acc', start: 0, stop: 3, step: 1, init: int(r, 1, 3), add: 'i' },
      { kind: 'acc', start: 2, stop: 5, step: 1, init: 0, add: 'i' }
    ]);
    else { var st = int(r, 0, 1); spec = { kind: 'acc', start: st, stop: st + 6, step: 2, init: 0, add: 'i' }; }
    var sim = simulate(spec);
    var passes = sim.values.length;
    return {
      format: 'trace', level: level, tags: [target],
      sig: 'trace|' + JSON.stringify(spec),
      code: sim.lines,
      prompt: 'Fill in i and total after each pass. If the loop has already stopped, leave that row empty.',
      rowsShown: passes + 1,
      expected: sim.rows.map(function (row) { return { i: row.i, acc: row.acc }; }),
      start: spec.start, stop: spec.stop,
      hints: ['Fill the **i** column first. Then work out total, one row at a time.',
              'First pass: i is ' + sim.values[0] + ', so total becomes ' + sim.rows[0].acc + '.'],
      explain: '**' + rangeText(spec) + '** gives ' + sim.values.join(', ') + '. That is **' + passes + ' passes**, so the last row stays empty. ' +
               'total changes on every pass and ends at ' + sim.final + '.',
      traceSpec: spec
    };
  }

  function genExplain(level, target, r) {
    var spec, prompt, rubric, sim;
    if (target === 'M1') {
      spec = level >= 2
        ? (function () { var s = int(r, 1, 3); return { kind: 'print', start: s, stop: s + int(r, 3, 4), step: 1 }; })()
        : { kind: 'print', start: 0, stop: int(r, 3, 5), step: 1 };
      sim = simulate(spec);
      prompt = 'In one or two sentences: which values does i take here? Why does the loop stop there?';
      rubric = 'A complete answer says i takes ' + sim.values.join(', ') + ', starting at ' + spec.start +
               ', and the loop stops before ' + spec.stop + ', so ' + spec.stop + ' itself is not printed.';
    } else {
      spec = { kind: 'acc', start: 0, stop: pick(r, [3, 5]), step: 1, init: 0, add: 'i' };
      sim = simulate(spec);
      prompt = 'In one or two sentences: what happens to i and total on each pass?';
      rubric = 'A complete answer says i gets a new value on each pass (' + sim.values.join(', ') + '), the body runs ' +
               sim.values.length + ' times, and total changes every pass, ending at ' + sim.final + '.';
    }
    return {
      format: 'explain', level: level, tags: [target],
      sig: 'explain|' + JSON.stringify(spec),
      code: sim.lines, prompt: prompt, rubric: rubric,
      values: sim.values, start: spec.start, stop: spec.stop, final: sim.final, kind: spec.kind,
      hints: target === 'M1'
        ? ['Say the **first** value of i, and the **last** one.', 'Use the word "before". range stops before ' + spec.stop + '.']
        : ['Does i keep the same value, or get a **new** one each pass?', 'Say how many times the body runs. Then say what total ends at.'],
      explain: rubric.replace('A complete answer says ', 'Here is one way to say it: '),
      traceSpec: spec
    };
  }

  function genFix(level, target, r) {
    var code, prompt, options, explain, traceSpec = null, variant;
    if (target === 'M1') {
      if (level <= 1) {
        var n = int(r, 3, 5);
        variant = 'F1a-' + n;
        code = ['for i in range(' + n + '):', '    print(i)'];
        traceSpec = { kind: 'print', start: 0, stop: n, step: 1 };
        prompt = 'Riya wants to print **1 to ' + n + '**. But this prints 0 to ' + (n - 1) + '. Which first line fixes it?';
        options = [
          { text: 'for i in range(1, ' + (n + 1) + '):', tag: null, correct: true },
          { text: 'for i in range(1, ' + n + '):', tag: 'M1' },
          { text: 'for i in range(' + (n + 1) + '):', tag: 'M1' },
          { text: 'for i in range(0, ' + n + '):', tag: 'M1' }
        ];
        explain = 'range stops **before** the end number. To reach ' + n + ', the end must be ' + (n + 1) +
                  '. To start at 1, write 1 first. So range(1, ' + (n + 1) + ').';
      } else {
        var k = int(r, 2, 4), m2 = k + int(r, 3, 5);
        variant = 'F1b-' + k + '-' + m2;
        code = ['for i in range(' + k + ', ' + m2 + '):', '    print(i)'];
        traceSpec = { kind: 'print', start: k, stop: m2, step: 1 };
        prompt = 'Arjun wants to print **' + k + ' to ' + m2 + '**. This stops at ' + (m2 - 1) + '. Which first line fixes it?';
        options = [
          { text: 'for i in range(' + k + ', ' + (m2 + 1) + '):', tag: null, correct: true },
          { text: 'for i in range(' + (k + 1) + ', ' + (m2 + 1) + '):', tag: 'M1' },
          { text: 'for i in range(' + (k - 1) + ', ' + m2 + '):', tag: 'M1' },
          { text: 'for i in range(' + (m2 + 1) + '):', tag: 'M1' }
        ];
        explain = 'The start number is included. The end number is **not**. So to include ' + m2 + ', the end must be ' + (m2 + 1) + '.';
      }
    } else if (level <= 2) {
      var c = int(r, 3, 5);
      variant = 'F2-' + c;
      code = ['count = 1', 'for i in range(' + c + '):', '    print(count)'];
      prompt = 'Meera wants to print **1, 2, ... ' + c + '**. But this prints 1 again and again. Which change fixes it?';
      options = [
        { text: 'Add inside the loop, under print:\n    count = count + 1', tag: null, correct: true },
        { text: 'Add after the loop, not pushed in:\ncount = count + 1', tag: 'M2' },
        { text: 'Change range(' + c + ') to range(' + (c + 1) + ')', tag: 'M1' },
        { text: 'No change. count goes up by itself on each pass.', tag: 'M2' }
      ];
      explain = 'A variable only changes when **we change it**. Putting count = count + 1 **inside the body** makes it grow on every pass.';
    } else {
      var t = int(r, 3, 5);
      variant = 'F3-' + t;
      code = ['for i in range(' + t + '):', '    total = 0', '    total = total + i', 'print(total)'];
      prompt = 'Sam wants the sum of 0 to ' + (t - 1) + '. But this prints just ' + (t - 1) + '. Which change fixes it?';
      options = [
        { text: 'Move total = 0 above the for line', tag: null, correct: true },
        { text: 'Change range(' + t + ') to range(' + (t + 1) + ')', tag: 'M1' },
        { text: 'Move print(total) inside the loop', tag: 'M2' },
        { text: 'Change total + i to total + 1', tag: 'M2' }
      ];
      explain = 'The body runs on **every pass**. So total = 0 inside it resets total each time. Set it once, **before** the loop.';
    }
    options = shuffle(r, options).map(function (o, idx) { o.id = 'abcd'.charAt(idx); o.correct = !!o.correct; return o; });
    return {
      format: 'fix', level: level, tags: [target], sig: 'fix|' + variant,
      code: code, prompt: prompt, options: options,
      hints: ['Run it in your head first. What does it print right now?',
              target === 'M1' ? 'Remember: range **stops before** the end number.' : 'Remember: a variable changes only when a line **inside the body** changes it.'],
      explain: explain, traceSpec: traceSpec
    };
  }

  var GENERATORS = { predict: genPredict, trace: genTrace, explain: genExplain, fix: genFix };

  /* Generate a fresh question. Tries new seeds to avoid repeating one already used. */
  function generate(opts) {
    var avoid = opts.avoid || [];
    var level = Math.max(1, Math.min(3, opts.level || 1));
    var target = opts.target === 'M2' ? 'M2' : 'M1';
    var gen = GENERATORS[opts.format] || genPredict;
    var q = null;
    for (var t = 0; t < 16; t++) {
      var seed = ((opts.seed || 1) + t * 7919) >>> 0;
      q = gen(level, target, makeRng(seed));
      q.seed = seed;
      if (avoid.indexOf(q.sig) === -1) break;
    }
    q.id = q.format + '-L' + q.level + '-' + q.tags[0] + '-' + q.seed;
    return q;
  }

  /* ---------- fixed diagnostic (profile) questions ---------- */
  var DIAGNOSTIC = [
    {
      id: 'D1', format: 'predict', tags: ['M1'],
      code: ['for i in range(3):', '    print(i)'],
      prompt: 'What will this print? Each print shows on a new line.',
      options: [
        { id: 'a', text: '1\n2\n3', tag: 'M1', correct: false },
        { id: 'b', text: '0\n1\n2', tag: null, correct: true },
        { id: 'c', text: '0\n1\n2\n3', tag: 'M1', correct: false },
        { id: 'd', text: '0', tag: 'M2', correct: false }
      ]
    },
    {
      id: 'D2', format: 'predict', tags: ['M2'],
      code: ['total = 0', 'for i in range(3):', '    total = total + 2', 'print(total)'],
      prompt: 'What will this print?',
      options: [
        { id: 'a', text: '2', tag: 'M2', correct: false },
        { id: 'b', text: '0', tag: 'M2', correct: false },
        { id: 'c', text: '6', tag: null, correct: true },
        { id: 'd', text: '8', tag: 'M1', correct: false }
      ]
    }
  ];

  /* ---------- evaluators (pure) ---------- */
  function evaluateChoice(q, optionId) {
    var opt = null;
    for (var k = 0; k < q.options.length; k++) if (q.options[k].id === optionId) opt = q.options[k];
    if (!opt) return { result: 'notyet', tag: null, detail: 'no choice' };
    return opt.correct
      ? { result: 'correct', tag: null, chosen: opt.text }
      : { result: 'notyet', tag: opt.tag || null, chosen: opt.text };
  }

  // grid = [{i:'', acc:''}, ...] strings from the learner
  function evaluateTrace(q, grid) {
    function num(s) { var t = String(s == null ? '' : s).trim(); return t === '' || isNaN(Number(t)) ? null : Number(t); }
    var exp = q.expected, passes = exp.length, ok = 0, total = passes * 2;
    var filledI = [], filledAcc = [];
    for (var k = 0; k < q.rowsShown; k++) {
      var row = grid[k] || {};
      var gi = num(row.i), ga = num(row.acc);
      if (k < passes) {
        if (gi === exp[k].i) ok++;
        if (ga === exp[k].acc) ok++;
      }
      if (gi !== null) filledI.push(gi);
      if (ga !== null) filledAcc.push(ga);
    }
    var extra = grid[passes] || {};
    var extraFilled = num(extra.i) !== null || num(extra.acc) !== null;
    var firstI = num((grid[0] || {}).i);
    var m1 = extraFilled || (firstI !== null && firstI === q.start + 1) || filledI.indexOf(q.stop) !== -1;
    var allSame = function (a) { return a.length > 1 && a.every(function (x) { return x === a[0]; }); };
    var onlyFirstRow = filledI.length <= 1 && filledAcc.length <= 1 && passes > 1;
    var m2 = allSame(filledI) || allSame(filledAcc) || onlyFirstRow;
    var result = (ok === total && !extraFilled) ? 'correct' : (ok >= total / 2 ? 'partial' : 'notyet');
    var tag = result === 'correct' ? null : (m1 ? 'M1' : (m2 ? 'M2' : null));
    return { result: result, tag: tag, matched: ok, of: total, extraFilled: extraFilled };
  }

  // Offline / fallback check for "explain in words". The AI check is preferred.
  function evaluateExplainLocal(q, text) {
    var t = ' ' + String(text || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
    var words = t.trim() ? t.trim().split(' ').length : 0;
    function has(re) { return re.test(t); }
    function numWord(n) { return new RegExp(' ' + n + ' '); }
    var result, tag = null, fb;
    if (words < 4) {
      return { result: 'notyet', tag: null, feedback: 'Let us add a little more. Try one full sentence about i.' };
    }
    if (q.tags[0] === 'M1') {
      var vals = q.values;
      var first = has(numWord(vals[0])) || (vals[0] === 0 && has(/ zero /));
      var last = has(numWord(vals[vals.length - 1]));
      var stopIdea = has(/ (before|not|doesn t|doesnt|does not|exclud\w*|less than|one less|minus) /);
      var claimsStop = has(new RegExp(' (to|till|until|upto|up to|including) ' + q.stop + ' ')) && !stopIdea;
      var startsAt1 = q.start === 0 && has(/ (starts?|begins?|from) (at |with )?(1|one) /);
      var score = (first ? 1 : 0) + (last ? 1 : 0) + (stopIdea ? 1 : 0);
      if (claimsStop || startsAt1) tag = 'M1';
      result = (score === 3 && !tag) ? 'correct' : (score >= 1 ? 'partial' : 'notyet');
      fb = result === 'correct'
        ? 'You named the first value, the last value, and why it stops. That is a clear explanation.'
        : 'Good start. Let us also say the first value, the last value, and that range stops before ' + q.stop + '.';
    } else {
      var change = has(/ (chang\w*|new|next|each|every|increas\w*|goes up|grows?|adds?|added|plus|bigger) /);
      var count = has(numWord(q.values.length)) || has(/ (three|five) times /);
      var fin = has(numWord(q.final));
      var stays = has(/ (same|stays?|once|only one|does not change|doesnt change|doesn t change|never changes) /);
      var s2 = (change ? 1 : 0) + (count || fin ? 1 : 0);
      if (stays && !change) tag = 'M2';
      result = (s2 === 2 && !tag) ? 'correct' : (s2 >= 1 ? 'partial' : 'notyet');
      fb = result === 'correct'
        ? 'You said that i gets a new value and total keeps changing. That is the key idea.'
        : 'Good start. Let us say how i changes each pass, and what total ends at.';
    }
    return { result: result, tag: tag, feedback: fb };
  }

  var api = {
    generate: generate, simulate: simulate, codeLines: codeLines, rangeText: rangeText,
    rangeValues: rangeValues, DEFAULT_SPEC: DEFAULT_SPEC, DIAGNOSTIC: DIAGNOSTIC,
    evaluateChoice: evaluateChoice, evaluateTrace: evaluateTrace, evaluateExplainLocal: evaluateExplainLocal,
    FORMATS: ['predict', 'trace', 'fix', 'explain']
  };
  root.QBank = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

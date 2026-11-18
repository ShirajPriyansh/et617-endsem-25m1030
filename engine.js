/*
 * engine.js
 * ET 617 | 25M1030
 *
 * Adaptive decision logic. Everything here is a PURE function:
 * same input -> same output, no storage, no clock, no randomness.
 * That makes the rule easy to explain, test and change.
 *
 * THE DECISION RULE (checked in this order after every answer)
 *
 *   R1 ADVANCE      got it, no hint or Step through used, and under 90 s
 *                   -> level + 1 (max 3), new format.
 *                   "Next, let us try a harder one."
 *   R2 CONSOLIDATE  got it but used help or took 90 s or more,
 *                   or partly right with no misconception seen
 *                   -> same level, new format.
 *                   "Let us try one more at this level."
 *   R3 REMEDIATE    not yet / partly, a misconception (M1 or M2) was seen,
 *                   and it is not the same misconception twice in a row
 *                   -> level - 1 (min 1), target that misconception,
 *                      small "predict" task.
 *                   "Let us practise one small idea first."
 *   R4 REFRAME      not yet with no clear misconception, or the same
 *                   misconception twice in a row
 *                   -> same level, same target, switch to a trace task
 *                      and offer the Step through tool.
 *                   "Let us look at it another way."
 *
 *   Coverage rule   if the tasks left are only just enough to show the
 *                   formats not yet tried, the next task uses an untried one.
 *   Target choice   R3/R4 keep the misconception just seen. R1/R2 target the
 *                   misconception with more misses so far (tie: switch).
 *
 * Profile input: the 2-question diagnostic sets the start level and target.
 */
(function (root) {
  'use strict';

  var CONFIG = Object.freeze({
    maxTasks: 5,              // tasks per 10-minute session
    sessionMs: 10 * 60 * 1000,
    slowSec: 90,              // "took a long time" threshold per task
    minLevel: 1,
    maxLevel: 3,
    formatOrder: ['predict', 'trace', 'fix', 'explain']
  });

  var MESSAGES = Object.freeze({
    advance: 'Next, let us try a harder one.',
    consolidate: 'Let us try one more at this level.',
    remediate: 'Let us practise one small idea first.',
    reframe: 'Let us look at it another way.'
  });

  function clamp(n) { return Math.max(CONFIG.minLevel, Math.min(CONFIG.maxLevel, n)); }

  /* Profile: diag = { D1: {correct, tag}, D2: {correct, tag} } */
  function startPlan(diag) {
    var d1 = diag && diag.D1 || {}, d2 = diag && diag.D2 || {};
    var right = (d1.correct ? 1 : 0) + (d2.correct ? 1 : 0);
    var misses = { M1: 0, M2: 0 };
    [d1, d2].forEach(function (d) { if (!d.correct && (d.tag === 'M1' || d.tag === 'M2')) misses[d.tag]++; });
    var target = !d1.correct ? 'M1' : (!d2.correct ? 'M2' : 'M1');
    if (misses.M2 > misses.M1) target = 'M2';
    return {
      level: right === 2 ? 2 : 1,
      target: target,
      format: 'predict',
      misses: misses,
      rule: right === 2 ? 'P1: both warm-up answers fit, start at level 2'
                        : 'P2: start gently at level 1, focus on ' + target
    };
  }

  function chooseTarget(action, tag, lastTarget, misses) {
    if ((action === 'remediate' || action === 'reframe') && tag) return tag;
    if (action === 'reframe') return lastTarget || 'M1';
    var m = misses || { M1: 0, M2: 0 };
    if (m.M1 > m.M2) return 'M1';
    if (m.M2 > m.M1) return 'M2';
    return lastTarget === 'M1' ? 'M2' : 'M1';
  }

  function chooseFormat(action, lastFormat, formatsUsed, explainUsed, tasksDone) {
    var used = formatsUsed || [];
    var remaining = CONFIG.maxTasks - (tasksDone || 0);
    var unused = CONFIG.formatOrder.filter(function (f) { return used.indexOf(f) === -1; });
    if (remaining > 0 && unused.length > 0 && unused.length >= remaining) {
      var notLast = unused.filter(function (f) { return f !== lastFormat; });
      return { format: (notLast[0] || unused[0]), coverage: true };
    }
    if (action === 'remediate') return { format: lastFormat !== 'predict' ? 'predict' : 'fix', coverage: false };
    if (action === 'reframe') return { format: lastFormat !== 'trace' ? 'trace' : 'predict', coverage: false };
    var candidates = CONFIG.formatOrder.filter(function (f) {
      return f !== lastFormat && !(f === 'explain' && explainUsed);
    });
    var fresh = candidates.filter(function (f) { return used.indexOf(f) === -1; })[0];
    if (fresh) return { format: fresh, coverage: false };
    var at = CONFIG.formatOrder.indexOf(lastFormat);
    for (var k = 1; k <= CONFIG.formatOrder.length; k++) {
      var f = CONFIG.formatOrder[(at + k) % CONFIG.formatOrder.length];
      if (candidates.indexOf(f) !== -1) return { format: f, coverage: false };
    }
    return { format: 'predict', coverage: false };
  }

  /*
   * input = {
   *   result: 'correct' | 'partial' | 'notyet',
   *   tag: 'M1' | 'M2' | null,          // misconception seen in this answer
   *   hintsUsed: number, helpUsed: bool, // interaction
   *   timeSec: number,                   // active seconds on the task
   *   level, lastTarget, lastFormat,
   *   sameTagStreak: number,             // answers in a row showing this same tag (incl. this one)
   *   misses: {M1, M2}, formatsUsed: [], explainUsed: bool, tasksDone: number (after this answer)
   * }
   */
  function decideNext(input) {
    var i = input || {};
    var helped = (i.hintsUsed || 0) > 0 || !!i.helpUsed;
    var action, rule;
    if (i.result === 'correct' && !helped && (i.timeSec || 0) < CONFIG.slowSec) { action = 'advance'; rule = 'R1'; }
    else if (i.result === 'correct' || (i.result === 'partial' && !i.tag)) { action = 'consolidate'; rule = 'R2'; }
    else if (i.tag && (i.sameTagStreak || 0) < 2) { action = 'remediate'; rule = 'R3'; }
    else { action = 'reframe'; rule = 'R4'; }

    var level = i.level || 1;
    if (action === 'advance') level = clamp(level + 1);
    else if (action === 'remediate') level = clamp(level - 1);
    else level = clamp(level);

    var target = chooseTarget(action, i.tag, i.lastTarget, i.misses);
    var fmt = chooseFormat(action, i.lastFormat, i.formatsUsed, i.explainUsed, i.tasksDone);

    return {
      action: action,
      rule: rule,
      level: level,
      target: target,
      format: fmt.format,
      coverage: fmt.coverage,
      offerStepThrough: action === 'reframe',
      message: MESSAGES[action]
    };
  }

  function shouldEndSession(s) {
    return (s.tasksDone || 0) >= CONFIG.maxTasks || (s.activeMs || 0) >= CONFIG.sessionMs;
  }

  var api = {
    CONFIG: CONFIG, MESSAGES: MESSAGES, startPlan: startPlan, decideNext: decideNext,
    chooseFormat: chooseFormat, chooseTarget: chooseTarget, shouldEndSession: shouldEndSession
  };
  root.Engine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

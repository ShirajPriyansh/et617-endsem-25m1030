# DESIGN.md — ET 617 End-Semester Exam

**Identity token:** 25M1030
**Repo:** et617-endsem-25m1030
**App:** et617-25m1030.vercel.app

## 1. Exam card

| Field | Choice |
|---|---|
| P | P4 — Adaptive tutor with automatic question generation |
| T | P4-T10 — Loops in Python programming (Cl. 8–11) |
| L | L5 — Learner repeating the topic after failing it once, high anxiety, low self-efficacy |
| C | C4 — 10-minute sessions (one full sequence fits in 10 minutes; stop and resume) |
| ID | 25M1030 |

## 2. Educational problem

Many Class 9 learners can read a `for` loop but cannot predict what it does. They guess the output, get it wrong, and conclude they are "bad at coding". This is worst for a learner who has already failed the topic once: each wrong answer confirms the belief, so they stop trying. The core gaps are not tracking how a variable changes on each pass and mixing up where a loop starts and stops (`range(5)` never reaches 5). This app is a short adaptive tutor that diagnoses which gap the learner has, responds with a gentler or different explanation instead of simply marking "wrong", and keeps every session within 10 minutes so it feels doable.

**Context of use:** at home in the evening, on a personal Android phone, 10 minutes at a time, English reading level of a Class 9 student, no teacher present.

## 3. Learning outcomes

By the end of the sequence the learner can:
1. **Predict** the output of a `for` loop that uses `range(n)` and `range(start, stop)`.
2. **Trace** the value of the loop variable and a running total across iterations by filling a trace table.
3. **Explain** in their own words why `range(5)` stops at 4 and why a variable changes on each pass.

## 4. Learner persona (D2 seed)

- **Name:** Ananya Deshmukh, age 15, Class 9, Pune
- **Situation:** failed the Python loops unit test last term and is repeating it. Gets anxious before answering and often says "I will get it wrong anyway". Low self-efficacy, not low ability.
- **Prior knowledge:** can write `print()`, use variables and do basic arithmetic. Knows what a list of numbers is. Has seen `for i in range(...)` but has not understood it.
- **Language:** home language Marathi, studies in English medium, comfortable with simple English sentences.
- **Device and time:** her own Android phone (360 px wide), evenings, about 10 minutes per sitting.
- **Motivation:** wants to pass the retake and stop feeling stuck.
- **Two likely misconceptions:**
  - **M1 (off-by-one):** "`range(5)` prints 1 to 5", so she thinks the stop value is included and counting starts at 1.
  - **M2 (variable does not change / body runs once):** "`i` stays the same" or "the loop body runs only once", so running totals are wrong.

## 5. Design constraint C4 — how it is visible

- A **10-minute progress bar** at the top: 6 tasks maximum per session, with a visible time budget.
- A **"Save and stop"** button on every screen. State is stored in `localStorage` (current task, answers, misconception log).
- A **"Welcome back, continue from task N"** screen when she returns.
- A **session-complete screen** after the final task or at the 10-minute mark, with a short summary.
- Gentle, low-stakes wording throughout because of L5. A wrong answer is "not yet", never "wrong".

## 6. Content plan

### 6.1 Concept explanation (short, conversational, uses "we" and "let us")
Let us watch a loop run one step at a time. A loop repeats the same instructions. `range(3)` gives us 0, 1, 2. It starts at 0 and stops *before* 3. On every pass the variable `i` takes the next value. Key points are highlighted in boxes.

### 6.2 Question formats (at least three)
1. **Predict the output (choice):** `for i in range(3): print(i)`
2. **Trace table (fill in):** `total = 0; for i in range(4): total = total + i` — learner fills `i` and `total` for each pass.
3. **Explain in words (free text, AI-evaluated):** "Why does `range(5)` not print 5?"
4. **Fix the bug (choice or reorder):** a loop meant to print 1 to 5 prints 0 to 4.

### 6.3 Question bank
Each question stores: the prompt, the correct answer, the model answer, and the feedback text for each misconception (M1, M2) and for a correct answer. Full text will be in `data/questions.js`.

### 6.4 Feedback design
- **Correct:** short confirmation plus one line on why it worked.
- **M1 pattern detected** (for example the answer includes the stop value): alternative explanation with a number-line picture of `range(5)` stopping at 4.
- **M2 pattern detected** (for example the answer repeats one value): switch to a trace table that shows `i` changing each pass.

## 7. Adaptive decision rule (design challenge)

The tutor looks at the last two answers plus hint use and time.

| Evidence | Next step |
|---|---|
| Correct, no hint, answered quickly | **Harder question** (e.g. `range(2, 10, 2)`, then a nested loop) |
| Wrong and the answer matches M1 or M2 | **Alternative explanation** in a different representation (number line or trace table), then a similar question |
| Wrong twice in a row, or hints used on every task, and the error shows she cannot follow a changing variable | **Prerequisite instruction**: a one-screen mini-lesson on a variable changing, then retry |

Adaptation uses profile (a 2-question diagnostic at the start), performance (answers) and interaction (hints used, time per task).

## 8. AI use (to be specified fully in the report, D6)

- **Feature:** AI evaluates the free-text explanation against a rubric (mentions "stops before n", "starts at 0") and returns a short, kind message and a misconception tag.
- **Call:** a Vercel serverless function; the API key is stored as a Vercel environment variable, never committed.
- **Check before display:** the response must be valid JSON with a tag from a fixed list and a message under 40 words; otherwise it is discarded.
- **Fallback:** if the call fails or the output is invalid, a clearly labelled keyword-based check plus recorded sample feedback is used.

## 9. Screens (at least 5 connected states)

1. Welcome / resume (identity footer visible)
2. Diagnostic (2 quick questions)
3. Learn (the short concept explanation)
4. Task (predict / trace / explain / fix)
5. Feedback (with the adaptive next step)
6. Session summary
7. About (identity token 25M1030)

## 10. Evaluation (brief, full version in D8)

- **Outcome 1:** share of predict-the-output items correct on a fresh set.
- **Outcome 2:** trace-table accuracy.
- **Outcome 3:** rubric score on the explanation item.
- **Logs:** task id, answer, misconception tag, hints used, time per task, decision taken.
- **Success:** a learner who showed M1 or M2 answers the follow-up question correctly after the alternative explanation.

## 11. Process plan

- 6:30 — DESIGN.md committed, repo link submitted
- 7:00 — first deployment live
- Commit at least every 30 minutes
- No code reused from earlier course projects
- Report written 7:35–7:55, submit by 8:00
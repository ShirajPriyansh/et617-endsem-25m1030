# Loop Buddy — ET 617 | 25M1030

An adaptive tutor with automatic question generation for **Python for loops with `range`** (Class 8-11), built for a learner who is repeating the topic after failing once, feels anxious and studies in **10-minute sessions** on a phone.

- **Card:** P4 (adaptive tutor with automatic question generation), T10 (for loops with range), L5 (repeating learner, high anxiety, low self-efficacy), C4 (10-minute sessions with stop and resume)
- **Persona:** Ananya Deshmukh, 15, Class 9, Pune
- **Live URL:** https://et617-25m1030.vercel.app
- **Repo:** `et617-endsem-25m1030`

`DESIGN.md` is already in the repo and is not part of this build. Do not overwrite or delete it.

## Files

| File | What it does |
|---|---|
| `index.html` | Page shell: session bar, "Save and stop", footer `ET 617 \| 25M1030` |
| `styles.css` | Mobile-first styles, designed at 360 px, tap targets of 48 px or more |
| `app.js` | Screens, state, active-time clock, save and resume, learning log, Step through tool |
| `engine.js` | The adaptive decision rule as pure functions (`startPlan`, `decideNext`) |
| `data/questions.js` | Question generators for 4 formats, loop simulator, answer checkers, diagnostic items |
| `api/evaluate.js` | Serverless function that asks Gemini to check "explain in words" answers |
| `package.json` | Only `"type": "module"`, so Vercel's Node runtime treats `api/evaluate.js` as an ES module. No dependencies |
| `.gitignore` | Keeps `.env*` and `.vercel/` out of git |

No framework, no build step, no CDN scripts. `vercel.json` is not needed.

## Deploy on Vercel (exact steps)

1. **Get a Gemini key.** Open https://aistudio.google.com/apikey, sign in and click **Create API key**. Copy it and keep it private.
2. **Push the code to GitHub.**
   ```bash
   cd et617-endsem-25m1030          # the repo that already holds DESIGN.md
   # copy these files in, keeping DESIGN.md as it is
   git add index.html styles.css app.js engine.js data/ api/ package.json .gitignore README.md
   git commit -m "Loop Buddy: adaptive loops tutor (ET 617 | 25M1030)"
   git push origin main
   ```
3. **Import the project.** Go to https://vercel.com/new, choose **Import Git Repository** and pick `et617-endsem-25m1030`.
4. **Project settings on the import screen:**
   - Project Name: `et617-25m1030` (this gives the URL `et617-25m1030.vercel.app`)
   - Framework Preset: **Other**
   - Root Directory: `./`
   - Build Command: leave empty (no build step)
   - Output Directory: leave empty (files are served from the root)
5. **Add the two environment variables** under *Environment Variables* before you click Deploy:

   | Name | Value |
   |---|---|
   | `GEMINI_API_KEY` | the key from step 1 |
   | `GEMINI_MODEL` | `gemini-2.5-flash` (or another Gemini model name you have access to) |

   Tick Production, Preview and Development.
6. Click **Deploy**. When it finishes, open `https://et617-25m1030.vercel.app`.
7. **Check the AI helper.** In a terminal:
   ```bash
   curl -s -X POST https://et617-25m1030.vercel.app/api/evaluate \
     -H "Content-Type: application/json" \
     -d '{"prompt":"Which values does i take?","code":"for i in range(4):\n    print(i)","rubric":"i takes 0,1,2,3 and stops before 4","target":"M1","answer":"i goes 0 1 2 3 and stops before 4"}'
   ```
   You should get JSON like `{"verdict":"correct","tag":null,"feedback":"...","source":"ai"}`.

If you add or change an environment variable later, go to *Settings → Environment Variables*, save, then **Redeploy** (Deployments → ⋯ → Redeploy). Variables only reach a new deployment.

**CLI alternative:**
```bash
npm i -g vercel
vercel link                      # choose or create project et617-25m1030
vercel env add GEMINI_API_KEY    # paste the key when asked
vercel env add GEMINI_MODEL      # type gemini-2.5-flash
vercel --prod
```

**Run locally:** `vercel dev` (reads the variables after `vercel env pull .env.local`; `.env.local` is git-ignored). Opening `index.html` straight from disk also works. In that case the explain answers are checked by the built-in offline checker.

**Key safety:** the key is read only inside `api/evaluate.js` via `process.env`. No key is in any file, and the browser never sees it.

## How a session runs (C4)

Welcome → Warm-up (D1, D2) → Short lesson (4 cards + Step through) → 5 tasks, each followed by Feedback → Session summary. About and the Learning log open from the footer on every screen.

- **Session bar** at the top shows active time out of 10:00. It counts only on the warm-up, lesson, task and feedback screens. It pauses when the app is hidden, on About, Log or the stopped screen, and after 90 s with no touch or typing.
- **Save and stop** sits in the top bar on every screen. Work is also saved after every answer, every hint and as the learner types.
- **Welcome back** appears whenever saved progress exists: "Let us continue from task N".
- **Session summary** appears after 5 tasks or at 10 minutes. If time runs out mid-task, a banner says "Finish this one, then we stop", so the learner is never cut off mid-answer.
- A full run (2 warm-up items, the lesson, 5 tasks) takes about 7 to 9 minutes.

## The adaptive rule (`engine.js`)

**Profile (warm-up):** D1 checks M1, D2 checks M2. Both fit: start at level 2. Otherwise start at level 1 and target the idea that was missed. The matching lesson card is highlighted.

**After every answer**, `decideNext()` checks these rules in order:

| Rule | When | Next task | Message |
|---|---|---|---|
| R1 Advance | got it, no hint or Step through, under 90 s | level +1 (max 3), new format | "Next, let us try a harder one." |
| R2 Consolidate | got it with help or slowly, or partly with no misconception | same level, new format | "Let us try one more at this level." |
| R3 Remediate | not yet / partly and M1 or M2 seen (not twice in a row) | level −1 (min 1), same misconception, small predict task | "Let us practise one small idea first." |
| R4 Reframe | not yet with no clear tag, or the same tag twice in a row | same level, trace format, Step through offered | "Let us look at it another way." |

- **Coverage rule:** when the tasks left are only just enough to show the formats not yet tried, the next task uses an untried one. This guarantees all four formats in a session.
- **Target:** R3 and R4 keep the misconception just seen. R1 and R2 move to whichever has more misses (tie: switch).
- Thresholds live in `Engine.CONFIG` (`maxTasks`, `slowSec`, levels).

The engine uses three kinds of signal: **profile** (warm-up), **performance** (result + misconception tag from the chosen option, trace pattern or AI check) and **interaction** (hints, Step through use, active seconds on the task).

## Automatic question generation (`data/questions.js`)

Each question is built from a small loop spec (`range(start, stop, step)`, accumulator start and step). The same spec gives the code, the right answer (by simulating it) and the distractors. Each distractor is the output a learner with M1 or M2 would expect, so the chosen option carries a misconception tag. A seeded generator means every question can be rebuilt from its id. Used questions are not repeated.

| Format | How it is checked | Diagnoses |
|---|---|---|
| Predict the output (choice) | option tag | M1 / M2 from the option chosen |
| Trace table (typed grid) | cell by cell | extra row filled or i starting one late → M1; i or total never changing → M2 |
| Explain in words (free text) | Gemini via `/api/evaluate`, with an offline keyword check as fallback | AI returns a tag |
| Fix the code (choice) | option tag | M1 (range ends) / M2 (variable not updated, reset inside the body) |

Levels: 1 = `range(n)`, 2 = `range(a, b)` or accumulating `i`, 3 = step 2, print inside the loop, or a reset bug.

## Learning log

About → **Open the learning log** shows every event as a table, newest first, with a CSV download. Events: `session_start`, `screen`, `diag_answer`, `profile`, `task_start`, `hint`, `help_step_through`, `step_through`, `answer` (result, tag, hints, seconds, source), `decision` (rule, next level, target, format), `ai_fallback`, `save_stop`, `resume`, `time_up`, `session_end`.

## Tone rules followed

Short sentences, "we" and "let us", praise for effort and strategy, key terms in bold boxes. Text never uses the words *wrong* or *incorrect*. AI feedback is filtered for them on the server and again in the browser.

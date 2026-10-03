**English** | [Japanese](./notes-2026-07-14-captions-and-cut-editing.ja.md)

# Direction note for captions and cut editing

- Date: 2026-07-14
- Status: direction note. It records a design conversation with the owner. Promote each item to a contract when implementation of that item starts.
- Premise: `transcript[].words` in analysis.json, the word timestamps, is the shared base for every item. The analyze-footage skill was revised on 2026-07-14 so that it writes `words` as a rule.

## Base: word timestamps, `words`

Restore word-level `{ start, end, text }` from the full JSON of whisper.cpp, which stores time per token. The steps are in `.claude/skills/analyze-footage/media-and-transcript.md`. Segment-level timing, one block of captions, is too coarse. None of the features below hold up on it.

> **Added 2026-07-14.** The split "the report owns decisions, the app owns per-segment edits" now applies to captions too. Write the caption policy as one frame in the footage plan of the edit-decision report. The policy covers whether to add captions, the style, how captions follow cuts, the split rules, how corrections work, and whether karaoke or emphasis is in. Do not put the segment list in the report. Review and correct segments in the app's caption list. This is already reflected in report-guide.md, section 5.

## 1. Word-accurate cut proposals. Show them in the app. Keep the report at decision level.

- Propose cut candidates at a **word boundary**. Candidates include fillers, hesitations, and repeats.
- **Show them in the app, not in the report HTML.** Word-level candidates are too many. A measured 62 minutes of footage produced 1,143 transcript segments. A single HTML page of them stops the report from doing its job, which is a decision.
  - Report: go as far as **decision level**. That includes chapter structure, highlights, and the list of cut decisions.
  - App, the viewer: show how the transcript lines up with edit.json cuts. A **before-edit and after-edit toggle** lets the person accept or reject each word while comparing the two. This extends the M3 interaction layer. It follows the existing rule that a DOM edit writes back to data.
- Later, a dedicated skill in the style of `cut-plan` can read analysis.json, both `words` and filler or highlight marks, and emit cut candidates as a draft edit.json.

## 2. Make captions first-class

Today a caption is only one kind of overlay HTML. Consider storing transcript-backed captions as a `captions` schema on edit.json v1.x. Separate the text, the times, and the display style. Keep the reference to `words`. When you implement it, write the contract in the style of the v1 contract set, `contract-2026-07-14-edit-json-v1-*.md`.

## 3. Caption correction

ASR is not perfect. The feature **corrects the text and keeps the timestamps**.

- Two parties correct text. The agent fixes typos and smooths wording after it reads the whole context. The person edits in the viewer's contenteditable field.
- If a correction changes the word count, you need a rule for assigning time again. The first proposal splits the original word's time span in proportion to character counts. That proposal still needs a check.
- The correction is valid only when timestamps do not drift. Keep the segment `start` and `end`. Redistribute time only inside the words.

## 4. Karaoke display, a highlight that follows each word

- Characters highlight in real time as the line is spoken. **The default is off.** It is an option.
- Use the word times as they are. Follow the M2 runtime rule for time. Use Web Animations and CSS variables. Do not use a wall clock. A seek must reproduce the same frame.
- Ship it as one captions template in the footage library, in the `telop` category. A knob switches it on or off, and sets the color and the follow style.

## 5. Selective captions and emphasis captions

- Add a mode that **shows only the important lines**, not every line. These are summary captions, chosen with the context in view. A highlight event is the reason for the choice.
- **Emphasis pop.** Lift one word, such as an exclamation or a punch line, out of the normal caption and show it large. In a two-word exclamation, only the second word pops. Word-level times are what make that pop land on the right frame.
- Choose which line to emphasize by comparing highlight, hook, and words. Record the reason in `decision_log`.

## A likely implementation order

1. Word output. **Done.** The analyze-footage skill was revised on 2026-07-14.
2. Word-accurate cut proposals. A `cut-plan` skill, plus a before-edit and after-edit toggle in the viewer.
3. The `captions` schema, plus caption correction. The agent smooths the line first, then contenteditable.
4. Karaoke and emphasis templates. Ship them as captions templates. The default is off.

Steps 1 and 2 need only analysis.json. From step 3 on, the work touches edit.json v1.x and the runtime. Treat that work as the next v1.x candidate after audio and crop, which are already implemented.

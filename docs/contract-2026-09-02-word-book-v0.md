**English** | [Japanese](./contract-2026-09-02-word-book-v0.ja.md)

# Word book v0, transcript vocabulary correction and the caption vocabulary norm

- Date: 2026-09-02
- Status: draft, needs owner review. This drafts a new data contract, a place outside the project, and a preprocess step on the transcript pipeline, so the whole document is an owner ruling. It is written for that review.
- Premises: `contract-2026-07-17-data-contract-versioning.md` (source of the three principles), `contract-2026-07-25-memory-connection-v0.md` (sibling contract. Section 9 reserves this seat by saying system B, the style profile, is drafted as a different contract. This document is the first implementation of that seat), `contract-2026-08-02-creator-root-v1.md` (the workspace. Section 7 already rules that user content does not go in a hidden directory and goes in the workspace `.akari/memory/`. This document's location follows that), `contract-2026-07-13-asset-library.md` (the precedent for 4-layer scope and shadowing), `contract-2026-09-02-transcript-unrecognized-spans-v0.md` (the immediately previous precedent that added a seat on the analysis.json to captions.json pipeline), `contract-2026-08-03-caption-display-encoding-qc-v1.md` (the current form of `display_policy`)
- Origin: owner conversation on 2026-09-02. The points were these. Proper-name mishearings in transcripts are fixed by hand every time. A word book should fix a term automatically after it is fixed once. The unit of management is a vocabulary entry, not a replacement pair. A person's hand edit is not touched. A TTS reading and a blocked word share the same container, and v0 defers both. The full context of the internal ruling is sections 2 and 4 of the memory-and-style contract in the internal repo akari-video-internal.
- Scope: the word book file (schema, location, layer resolve), a word-level prepass immediately after speech to text, reapplying onto an existing captions.json, edit-lint rules, feeding `protected_terms` for caption line breaks, and the Remember path on the script panel. v0 does not consume TTS readings, lint blocked words, send an initial prompt to speech to text, match by reading, run a learning loop, or freeze a snapshot. Those are section 9.

## 0. Place

This contract is not a mechanism where an AI learns spelling variants. A person approves a vocabulary entry once (the correct spelling, the misheard forms, the reading, and the kind). Layered files accumulate those entries. At the moments in section 4, the product applies them deterministically. That is a file contract plus skill discipline.

- One record is a vocabulary entry. `surface` is the correct spelling, and `variants[]` bundles mishearings and spelling variants. It is not a list of wrong-to-right replacement pairs. Reading, kind, and line-break protection ride on that same entry as attributes.
- Consumption has 4 exits. 1. A word-level prepass immediately after transcription. 2. Mechanical checks in edit-lint. 3. Supply into `break_hints.protected_terms` for caption line breaks. 4. TTS reading, v0.1, section 9.
- A person's hand edit is not touched. A row with `captionRecord.edited: true` is not reapplied. Section 3-5.
- Do not match a substring. A match is limited to a word boundary on `words[]`, or to an `Intl.Segmenter` word boundary when `words[]` is absent. Section 3-2.
- This is the first implementation of the differentiator that the internal contract calls style learning. v0 only accumulates and applies approved entries. A learning loop that proposes a term after the same fix happens twice is the next stage. Section 9.

Apply the three versioning principles (`contract-2026-07-17` section 2) from the first version of this new contract.

- The top-level `version` is an integer starting at 0.
- Evolution is addition only. The reader is tolerant. It keeps unknown fields on an entry. The validator reports an unknown key as `info` and does not reject it. Section 5.
- A reader that sees a `version` higher than it knows does not guess a conversion. It stops honestly in read-only mode. That is `validate-word-book.mjs`. Consumers treat that file as absent and emit a warning. Section 5.
- Field names are snake_case.

## 1. Locked schema

Source schema: `packages/schemas/word-book.schema.json` (`$id: urn:akari-video:schema:word-book:v0`).
Checked example: `packages/schemas/examples/word-book-v0-valid/word-book.json`.

The example below uses English stand-in strings. The checked example file, and the Japanese sibling of this page, keep the original spellings.

```jsonc
{
  "version": 0,
  "entries": [
    {
      "surface": "AKARI Video",
      "variants": ["Akari Video", "AKARI video", "AkariVideo"],
      "reading": "akari video",
      "kind": "term",
      "protect_break": true,
      "source": "daihon-panel",
      "added_at": "2026-09-02T10:00:00.000Z",
      "hits": 0
    },
    {
      "surface": "video",
      "variants": ["movie"],
      "kind": "notation",
      "source": "manual"
    },
    {
      "surface": "KYO Studio",
      "reading": "kyo studio",
      "kind": "reading-only",
      "protect_break": true
    }
  ]
}
```

### Field table

| Field | Type | Required | Notes |
|---|---|---|---|
| `version` | integer (const 0) | yes | |
| `entries[]` | array | yes, may be empty | The list of vocabulary entries. Order has no meaning. Match priority is the rule in section 3-3. |
| `entries[].surface` | string | yes | The correct spelling. Non-empty, no leading or trailing space, NFC. The same `strictText` condition as `protected_terms` in `display_policy`, because the supply target in section 3-6 requires that form. The normalized key (section 3-1) is unique in the file. |
| `entries[].variants[]` | string[] | optional, default `[]` | Mishearings and spelling variants. Each element is a non-empty string. A normalized key must not collide with another entry's `variants` in the same file. `validate-word-book.mjs` rejects that. An element whose key equals `surface` is allowed, so a file can state width or case normalization explicitly. |
| `entries[].reading` | string | required for `reading-only`, optional otherwise | TTS reading. Hiragana, katakana, and the long-vowel mark only. It connects to the existing narration `reading` rules in [`skills/generate-narration/reading-text.md`](../skills/generate-narration/reading-text.md). v0 stores it and does not consume it. Consumption is v0.1. |
| `entries[].kind` | enum | yes | `term`, `notation`, `ng`, or `reading-only`. See the table below. |
| `entries[].protect_break` | boolean | optional, default `false` | When `true`, caption line breaking does not insert a break inside `surface`. Section 3-6. Remember on the script panel proposes the default `true` for `term`. Section 4. |
| `entries[].source` | string | optional | Where it came from. Recommended words are `manual`, `daihon-panel`, `promote`, and `import`. They are not a forced enum. The precedent is `emphasis_words[].emotion`. |
| `entries[].added_at` | string (ISO8601) | optional | Time of registration. |
| `entries[].hits` | integer, at least 0 | optional | How many times it was applied. v0 stores the field and does not write it. The learning loop in section 9 uses it as a reason to prune. |

### What `kind` does in v0

| `kind` | Prepass (section 3-2) | edit-lint (section 3-5) | `protected_terms` supply (section 3-6) | TTS reading (section 9) |
|---|---|---|---|---|
| `term`. Proper names and technical terms. `variants` are mishearings. | Automatic replacement. Replace `variants`, and any other spelling whose normalized key matches `surface`, with `surface`. | Warn on `variants` that remain. | Follows `protect_break`. | v0.1 |
| `notation`. A spelling rule for a word to use or a word not to use. `variants` are the words not to use. | Do not replace. | Warn when `variants` appear. | Follows `protect_break`. | |
| `ng`. A blocked word. `surface` is the blocked word itself. `variants` are other spellings. | Do not replace. | v0 does not check. v0.1, section 9. | | |
| `reading-only`. The spelling is already correct and the word needs a reading. `variants` is empty. | Do not replace. | | Follows `protect_break`. | v0.1 |

Do not auto-replace `notation`. Changing a spoken word such as "movie" to the house spelling "video" unifies spelling. It does not correct a mishearing. A person decides when speech and Captions diverge. A warning prompts that decision. A `term` is a correction of letters the speech-to-text engine wrote for words the speaker did say, so the machine may fix it. Section 6.

## 2. Location, four layers under the workspace root

The location follows the creator-root v1 section 7 ruling. User content does not go in the hidden directory `~/.akari/`. It goes in the workspace `.akari/memory/`. The layers have the same shape as the 4-layer scope of the Footage library contract. The nearer layer wins. That is shadowing.

| Layer | Place | Lifetime | Writer |
|---|---|---|---|
| `project` | `<project>/.akari/memory/word-book.json` | That video only | Remember on the script panel (the default), and the CLI |
| `channel` | `<workspace>/channels/<channel>/.akari/memory/word-book.json` | Every video of that channel, the publishing subject | The promotion target of Remember, and the CLI |
| `workspace` | `<workspace>/.akari/memory/word-book.json` | Every channel in that workspace | The promotion target of Remember, and the CLI |
| `builtin` | This repo, `presets/word-book/builtin.json`. Register it in `presets/INDEX.md` together with the path of the resolve code. | Product-shipped default | Pull requests only. Start the contents as an empty array. |

- Resolve order is `project`, then `channel`, then `workspace`, then `builtin`. When the same `surface` (normalized key) exists in several layers, the nearer layer's entry wins as a whole. Do not merge field by field. When one layer's `variants` collide with another layer's different `surface`, the nearer layer still wins, and lint reports `word-book.variant-shadowed` at info. Section 5.
- `channel` exists only when the project sits at `<workspace>/channels/<channel>/videos/<project>/`. That follows mechanically from the canonical structure in creator-root v1 section 3. Do not add a brand-choice question to intake. Identify the workspace with `resolveCreatorRoot` in `packages/creator-root` (the `root.json` marker).
- Try mode has no workspace (creator-root v1 section 9) and runs on the two layers `project` and `builtin`. There is no promotion target (`channel` or `workspace`). Remember writes only to `project`. It may point at creating a workspace. It does not force that.
- Add a `--word-book <path>` option and the environment variable `AKARI_WORD_BOOK` as the injection point for verification and CI. Read the named file as the top layer, nearer than `project`. The precedent is `AKARI_SOUNDS_DECLARATIONS`. Verification for this task finishes on in-repo fixtures and does not write the real workspace or the home directory.
- Do not create `~/.akari/styles/`. The internal memory-and-style contract section 2 (2026-07-25) named that as a location. The later creator-root v1 section 7 (2026-08-02, owner approved) ruled that content goes to the workspace, and this document follows that later ruling. `.akari/memory/` is a name creator-root v1 section 3 already reserved for style learning and memory.
- `channels/<channel>/.akari/` is an addition that the canonical structure in creator-root v1 section 3 does not list. It is an optional subdirectory. Addition-only evolution means `creator-root/v2` is not required. This task adds one line to section 3 of that contract.
- Writes are atomic temp plus rename. Run a check equivalent to `validate-word-book.mjs` before writing. Fail closed. A broken word book would make the prepass silently do nothing. The same discipline as the `declarations.json` writer `declare-server.mjs`. Serialize consecutive writes to the same file, for the same reason as `writeAtomic` in `packages/edit-store/src/write-gate.ts`.
- A word book file does not store an absolute path outside the project (creator-root v1 section 6-4, portability). An entry holds vocabulary only.

## 3. Data rules for match, replace, and what stays untouched

### 3-1. Normalized key

Compare a normalized key, not the raw string. NFKC, then the Unicode default case fold, then delete every whitespace character (`\s`). `surface` must be NFC and trimmed at write time (section 1), and comparison uses the NFKC key. Full-width alphanumerics, letter case, and spaces between words are absorbed without listing them in `variants`. Differences of long vowel, small kana, and voiced marks are not absorbed. List those. The Japanese sibling shows a pair that must be listed.

### 3-2. Match only on a word boundary

The target is `words[]` on a segment or a caption record. All 3 backends emit it. whisper, SpeechAnalyzer, and cloud.

1. On `words[]`, a match is when the normalized key of the concatenation of `text` from k consecutive words (k at least 1) exactly equals a key in an entry's `variants`. For `term`, the entry's `surface` key is included too. The middle of a word is not a match. A short token that sits inside a longer word does not match. That is the definition of matching only on a word boundary. The Japanese sibling shows the inside-a-word case.
2. Fold the matched word run into one word. `{ start: start of the first word, end: end of the last word, text: surface }`. Do not move the measured times. Karaoke word times stay.
3. On the segment or record `text`, search once from the left for the sequence of each matched word's `text` joined by any whitespace, and replace that sequence with `surface`. If it is not found, do not apply that match. Count it as a skip. Do not rewrite only one side of data where `words[]` and `text` have already diverged, which would make it worse.
4. On a segment or record with no `words[]`, split `text` with `Intl.Segmenter` (`granularity: "word"`). The locale is `display_policy.locale` when present, otherwise `ja`. Apply the same rule, a normalized-key match of consecutive words, and replace only `text`. There are no timed words, so karaoke does not break.
5. If the replacement is already identical to `surface`, do nothing. The operation is idempotent. Applying it twice matches applying it once.

### 3-3. Priority and determinism

- Scan left to right. At each position take the longest match. More words wins. On a tie, the longer variant string wins. Do not reuse a matched word run.
- When several entries are candidates at the same position, take the entry from the nearer layer (section 2). The validator has already rejected a collision inside one layer.
- The same input (the segment and the resolved word book) always produces the same output. It does not depend on randomness, the clock, or the environment.

### 3-4. What may be rewritten, and what is not touched

| Target | Treatment |
|---|---|
| `words[].text`, `start`, `end` | Fold the matched word run into one word (3-2 item 2). Other words stay. |
| `text` | Replace per 3-2 item 3. |
| `display_text`, when present | Apply the same replacement as `text`, so the display override does not keep the old spelling. |
| `display_fragments`, when present | Replace inside a fragment only when the match fits inside that one fragment. A match that crosses a fragment boundary skips the whole record and is counted. Do not break a line break a person decided. The validator rejects `display_fragments` unless they match `display_text ?? text` exactly. |
| `edited` | Not touched. The prepass is not a person's hand edit. |
| `unrecognized[]`, `emphasis_words[]`, `style`, `style_preset`, `text_style`, `sourceRef`, `speaker`, `time_domain`, and the rest | Not touched. `emphasis_words[].word` is a time anchor, so drawing does not break when the spelling changes. |

### 3-5. A person's hand edit is untouchable

- Do not reapply to a record with `captionRecord.edited: true`. Skip it even when it matches. Lint reports `captions.word-book-term` at info only. Section 5.
- A replacement always writes `words[]` and `text` together, word by word. Do not go through `applyCaptionTextEdit` (`packages/edit-store/src/caption-words-rederive.ts`). That kernel is for a person editing the body. It sets `edited: true`, and when the match rate falls under the threshold it deletes `words[]` without saying so, which drops karaoke. A word book replacement already knows the word run and the times, so it does not re-derive.
- Writes to captions.json go through the edit-store write gate. Add `applyWordBookToCaptions` in the `caption-store.ts` style of one function equals one op. It receives the existing lint debounce and atomic write.
- `akari word-book apply` applies the same replacement to both the transcript segments in analysis.json and to captions.json. Fixing only one side makes the existing edit-lint rule `captions.edited` warn, because `edited` is false while the body does not match the transcript. Use that warning as-is to detect "the word book grew and captions.json was not reapplied". Do not add a new rule for it.

### 3-6. Supply into line-break `protected_terms` is soft

A match in `display_policy.break_hints.protected_terms` is a substring, every occurrence, and a hard rejection (`splitsProtectedTerm` in `packages/edit-store/src/caption-display.ts`). Crushing every candidate boundary makes the caption unable to render with `NO_WORD_BOUNDARY_SPLIT`, and there is no degraded draw. Supply from the word book must not create that failure, so supply is soft.

1. The four callers of `resolveCaptionDisplay` (render-cut, preview-server, edit-lint, and the shell preview service) pass `surface` values with `protect_break: true` from the resolved word book as `extra_protected_terms`. `resolveCaptionDisplay` itself stays a pure function with no file IO. Do not send it to the browser. That matches the existing purity test.
2. First try the split with the policy's explicit `protected_terms` plus the word book terms. On `NO_WORD_BOUNDARY_SPLIT`, retry with only the word book terms removed. If that still fails, fail as today. The explicit policy terms are responsible. Lint reports the removal as `captions.word-book-break-fallback` at warning.
3. Supply nothing to a project that has no `display_policy`. The word book does not inject a policy. The same line as `recipe.schema.json`, which says `display_policy` and similar must not be injected automatically.
4. Supply only `surface`. Do not supply `variants`. The premise is that variants do not remain in the body after the prepass. If they remain, the warning in section 5 stands first.

### 3-7. Cache and raw output

- The transcription cache (`.akari/cache/transcribe/`) stores the raw speech-to-text output. The prepass runs every time after a cache read. Growing the word book does not require a new transcription.
- `akari media transcribe --no-word-book` can record the raw output into analysis.json, for comparison and verification.

## 4. Skill wiring, the moment of application

| Moment | What it does | Where |
|---|---|---|
| Immediately after transcription | Prepass every segment with the resolved word book (section 3-2). The cache-hit path does the same. | `transcribeMedia` in `packages/akari-tools/src/media/transcribe.mjs`, after `normalizeSegments` and `attachUnrecognizedSpans`, before `recordTranscribe`. `options.wordBook` (`--no-word-book` or `--word-book <path>`). |
| Remember on the script panel | Right after a person fixes a line, propose registering the fixed word run as `variants` and the text after the fix as `surface`. Always ask the person which layer to write. The default is `project`. `channel` and `workspace` are promotion, the approval gate in internal contract section 4. After registration, immediately reapply to `edited: false` lines and the transcript in the same project, and return the counts. | Add a `rememberWord` RPC on the node-side service of `apps/shell/extensions/akari-transcript`, and call add plus apply in `packages/word-book`. Correction of 2026-09-02. Add the RPC on the akari-annotations service. The UI stays in akari-transcript. |
| Manual reapply | Apply the resolved word book again to an existing project. `--dry-run` returns counts only. | `akari word-book apply [--project <dir>] [--dry-run]` |
| edit-lint | The rules in section 5. | `packages/edit-lint/src/edit-lint.mjs`, in the captions check list. |
| Line breaking | The soft supply in section 3-6. | The four callers of `resolveCaptionDisplay`. |
| Showing the resolve | Show the active entries and where they came from, which layer. | `akari word-book resolve [--project <dir>]`. The same shape as `sources` returned by `resolve-connections.mjs` in manage-connections. |
| generate-narration | Consume `reading`. | v0.1, section 9. |

Put the pure functions (resolve, match, replace, validate) in a new package `packages/word-book/`, plain ESM with zero dependencies. The node side of akari-tools, edit-lint, edit-store, and the shell call the same implementation. The 4 exits do not each keep their own matcher. That is 4-exit parity.

Defaults that Remember proposes: `kind: "term"`, `protect_break: true`, `source: "daihon-panel"`, `added_at` equal to now. In the dialog a person can change `kind` to `notation`. In that case the default of `protect_break` is `false`. Do not register by guessing. Register only the word run the person pressed Remember on. The same rule as recipe v0 section 3, discipline 1, record only a confirmed value.

## 5. Degradation and lint rules

The word book is reference information for the project. A failed check or a missing file does not fail transcription, editing, or render.

| Situation | Behavior |
|---|---|
| No word book in any layer | A valid state. The prepass does nothing, supply does nothing, and lint stays quiet. |
| `entries` is an empty array | Same as above. |
| A layer's file is broken JSON or violates the schema | Continue, treating that layer as absent. Lint reports `word-book.invalid` at warning, with the path. The writer fails closed and does not write a broken file. |
| `version > 0` | Ignore that layer in read-only mode and warn "This file is a newer format. Update the skill or the app." Principle 3. |
| An entry has an unknown field | Keep it. Tolerant reader. The validator reports `word-book.unknown-field` at info only. |
| The matched word run cannot be found on the `text` side | Skip only that match (section 3-2 item 3). `apply` reports the count. |
| A match crosses a `display_fragments` boundary | Skip that record (section 3-4). Report the count. |
| The workspace cannot be resolved (`resolveCreatorRoot` errors) | Continue with `project` and `builtin`, treated as try mode. Do not warn. |
| Line breaking fails because of word book `protected_terms` | Retry with the word book terms removed (section 3-6). Warning `captions.word-book-break-fallback`. |

### edit-lint rules (v0)

Rule ids follow the existing style. Dot-separated, each segment kebab-case. The identifier field is `check`.

| `check` | Severity | Condition |
|---|---|---|
| `word-book.invalid` | warning | A file in a layer under resolve cannot be read, violates the schema, or has `version > 0`. |
| `word-book.unknown-field` | info | An entry has an unknown field. Validator only. Lint does not emit this. |
| `word-book.variant-shadowed` | info | The same variant key across layers belongs to a different `surface`. Notice that the nearer layer won. |
| `captions.word-book-term` | warning. An `edited: true` line is info. | A `term` `variants` value remains in the caption body on a word boundary. An unedited line means reapply was missed. An edited line is a person's decision, so info. |
| `captions.word-book-notation` | warning | A `notation` `variants` value appears in the caption body on a word boundary, whether or not the line is edited. |
| `captions.word-book-break-fallback` | warning | Section 3-6 item 2 removed the word book terms. |

Lint matches with the same word-boundary rule as section 3-2 (`words[]`, otherwise `Intl.Segmenter`). It does not check substrings. Checking `ng` is v0.1, section 9.

## 6. Why the data is shaped this way

- The unit is a vocabulary entry because one word can have several mishearings. The checked example lists them. A reading, line-break protection, and a kind each belong once to that word. A list of replacement pairs scatters the attributes of the same word, and cannot answer "what is this word's reading?". The point is that TTS (v0.1) and line breaking (v0) look at the same one entry.
- `kind` is split because "speech to text wrote different letters" (`term`, the machine may fix it) and "the speech was right and the spelling should be unified" (`notation`, a person decides) have different owners. Auto-replacing both makes speech and Captions diverge quietly. A blocked word (`ng`) and a word that only needs a reading (`reading-only`) are not replacement targets at all.
- Match only on a word boundary because Japanese has no space separation, so a substring match would catch a short token inside a longer name, or a sentence that happens to contain that token. The Japanese sibling shows that case. `words[]` is the word boundary speech to text measured. Using it as the match unit folds a timed word run into one word without breaking karaoke. Falling back to `Intl.Segmenter` only when `words[]` is absent is because the existing line break (`a4-ja-two-fragment-v1`) uses the same segmenter. Do not bring in a new dependency. This repo has no morphological analyzer. Matching by reading is the next stage, section 9.
- Write `text` and `words[]` together because the person's body-edit kernel `applyCaptionTextEdit` is a tool that re-derives word times because the body changed, and it drops `words[]` when the match rate is low. The word book knows the word run and the times, so writing both at word granularity without re-derivation is the only safe path.
- `edited: true` is untouchable because a line a person fixed is a record of that person's decision. A machine overwrite breaks the trust that opening the project shows a cut that is nearly done and can be fixed by dragging. Lint only reports info.
- The location is the workspace because a word book is user content, an accumulation of approvals, not machine state that an app update replaces. Per the creator-root v1 section 7 ruling, do not put it in a hidden directory. Deciding the layer by directory containment (project inside channel inside workspace) means there is no separate seat that declares which brand this video belongs to. A move (adoption) carries the book along.
- `channel` is the publishing-subject layer because the unit where spelling and terms naturally group is the channel, brand, or client. A project-only book is rebuilt every time. A workspace-wide book contaminates one job with another. This maps the ruling in internal contract section 2 onto creator-root's `channels/<channel>/`.
- v0 has no frozen snapshot because the prepass result is persisted in analysis.json and captions.json, so a re-render half a year later does not change the body even if the word book changed. The only live reference at render time is the line-break supply in section 3-6, and that supply is soft and does not change the body. A freeze is therefore not required for reproducibility. A freeze is required to run lint against the same norm on another machine, and that is the next stage, section 9.
- Supply is soft because the existing `protected_terms` is a hard rejection, and adding terms moves closer to an unsplittable line. A word book is a container that keeps growing, so a hard supply would mean "remembering a word breaks Captions". Keep the explicit policy hard, and let only the word book terms step back.
- `hits` only reserves a seat because the learning loop (the same fix twice, then a proposal, and pruning unused entries) needs that data first. v0 does not write it, so that a separate ruling can decide whether the transcribe command should have the side effect of writing the workspace and channel layers.
- Do not create `~/.akari/styles/` for the reason in section 2. When two contracts disagree, take the later owner-approved creator-root v1. After this ruling, update the wording in internal contract section 2 to follow.

## 7. Common mistakes

- Fixing `text` with a substring replace is wrong. Section 3-2. Match only on a word boundary. The `text`-side replace searches for the matched word run and replaces it once.
- Rewriting the body through `applyCaptionTextEdit` is wrong. Section 3-5. `edited: true` gets set, and `words[]` can disappear depending on the match rate.
- Reapplying to an `edited: true` line is wrong. Section 3-5. A person's hand edit is untouchable.
- Fixing only captions.json and not analysis.json, or the reverse, is wrong. Section 3-5. `captions.edited` warns. `apply` writes both.
- Auto-replacing `notation` is wrong. The `kind` table in section 1. Unifying spelling is a person's decision. A warning prompts it.
- Injecting a policy into a project that has no `display_policy` so that `protected_terms` takes effect is wrong. Section 3-6 item 3. The word book does not create a policy.
- Writing a word book `surface` directly into the policy as a hard `protected_terms` value is wrong. Section 3-6. That creates an unsplittable line. Supply is soft, through the caller's `extra_protected_terms`.
- Running the prepass before `normalizeSegments` is wrong. Section 4. `normalizeSegments` rebuilds fields by enumeration, so information added in an earlier step is dropped. Apply after `normalizeSegments` and `attachUnrecognizedSpans`.
- Saving the replaced text in the cache is wrong. Section 3-7. The cache is raw output. Do not design it so that growing the word book requires a new transcription.
- Placing the file at `~/.akari/styles/<brand>/` is wrong. Section 2. Content goes to the workspace. A brand is `channels/<channel>/`.
- Stopping transcription or render because the word book is missing or broken is wrong. Section 5. Continue, treating it as absent, and warn.
- Registering an entry by guessing, from speech-to-text confidence or an LLM judgment, is wrong. Section 4. Register only the word run the person pressed Remember on.
- Writing `scope` on an entry is wrong. Section 2. The layer is decided by where the file sits. Only the `resolve` output carries the origin.
- Citing `packages/overlay-runtime/src/text-split.js` as the word segmenter is wrong. That file does not exist. Word boundaries are `words[]` and `Intl.Segmenter`.

## 8. Migration

Blank. `word-book.schema.json` is created by this contract. If a breaking change becomes necessary, write the machine-runnable old-to-new conversion steps here. `contract-2026-07-17` principle 2.

## 9. Next stage, outside this contract

- Consuming TTS readings (v0.1). When generate-narration builds the reading script, replace `surface` of a resolved word book entry that has `reading` (`term` or `reading-only`) with `reading`. Connect to the existing dual-save rule for `script` and `reading` in `reading-text.md`. The goal is to reduce manual conversion to kana.
- `ng` lint (v0.1). `captions.word-book-ng`. Whether it is an error or a warning waits for a ruling. A blocked word is "do not want it to appear" rather than "fix it when it appears", so the severity is a candidate stronger than `term`.
- An initial prompt to speech to text. Pass resolved `surface` values to whisper.cpp `--prompt` so mishearings drop upstream. The current `runWhisper` argv (`-m,-f,-l,-oj,-ojf,-of`) has no seat for it, so `resolveWhisper` and `transcribeMedia` options need a change. Survey the equivalent for SpeechAnalyzer and cloud separately.
- Matching by reading. Catch a same-sound mishearing without listing every `variants` entry. The Japanese sibling lists the homophone set. That needs a decision to take a morphological analyzer dependency (for example kuromoji.js), so v0 matches the written surface only.
- The learning loop, the body of internal contract section 4, called style learning. Record body edits on the script panel into `.akari/events/`. When the same fix appears a second time, propose Remember. Write `hits`, and surface entries that stay at 0 for a long time as prune candidates. Proposal frequency follows offer-once in recipe v0.
- A frozen snapshot. Copy upper layers into a `project` layer file that has `frozen_at`, and do not read upper layers after that. The use is to guarantee lint against the same norm on another machine or at another time.
- Approved bulk replace for `notation`. A path that replaces, without setting `edited`, only when a person who saw the warning presses fix all.
- A word book editor UI, and import and export (CSV and dictionary formats from other tools).
- A cohabitation rule with the other memories in the workspace `.akari/memory/` (tone prose, `caption_defaults`, and the rest of internal contract section 2). This document defines only the one file `word-book.json`.

## 10. Acceptance, what the implementation task meets

1. `packages/schemas/word-book.schema.json`, `validate-word-book.mjs`, and examples. One valid. Three invalid, a variant collision, `variants` on `reading-only`, and `version: 1`. `version > 0` stops with an update notice.
2. `node --test` for the pure functions in `packages/word-book/`. Word-boundary match (the inside of a word does not match). Folding a multi-word concatenation (times keep the first start and the last end). Longest match. Layer shadowing. Idempotence. Skip when the `text` side does not match. Skip when a match crosses a `display_fragments` boundary. The `Intl.Segmenter` path.
3. With `backendRunner` replaced, feed fixed words through `transcribeMedia` and confirm the analysis.json transcript is replaced, and the cache file stays raw output.
4. After apply to captions.json, `edit-lint` does not emit `captions.edited`, and an `edited: true` line is unchanged at the byte level. Karaoke's 4 exits (render-cut, gpu, osr, preview) keep a word-token count that matches `words[]`. Add one word book fixture to the existing parity test.
5. On a fixture that has `display_policy` and a word book `protect_break` that makes the line unsplittable, the soft supply steps back, render succeeds, and `captions.word-book-break-fallback` is emitted.
6. On a workspace fixture (`root.json` plus `channels/<c>/videos/<p>`), `resolve` returns the origin of all 4 layers correctly. On a fixture with no workspace, it falls back to `project` and `builtin`.
7. Do not write the real home directory or workspace. Every test finishes in a temp directory and `AKARI_WORD_BOOK`.
8. Launcher. `akari word-book --help` lists 4 subcommands (resolve, validate, add, apply). When akari-tools is absent, it shows how to install and exits 1.

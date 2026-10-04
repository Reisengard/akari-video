**English** | [日本語](./contract-2026-07-26-avatar-registry-v0.ja.md)

---
lifecycle: draft
created: 2026-07-26
updated: 2026-07-26
---

# Avatar registry contract v0 (avatar.json, rendition.json, and staged reading)

- Date: 2026-07-26
- Status: **draft**. The data shape and the validation rules are fixed and implemented. The persona-core text is a human-led layer, so the descriptive content of avatar number 1 stays draft.
- Depends on: `contract-2026-07-17-data-contract-versioning.md` (an integer version, additive evolution, and a tolerant reader), `contract-2026-07-13-asset-library.md` (the four scope layers and the shape of a catalog), and `contract-2026-07-2X-edit-json-v1-narration.md` (the three narration lanes. Referenced only in section 10).
- Scope: the data contract that registers an avatar, one person with a character and a way of speaking. Directory structure, staged reading, and the schemas and validation rules of `avatar.json`, `rendition.json`, and `relationships.json` only. Automatic wiring to a treatment engine, a registration-wizard UI, and import of VRM, Live2D, or PSD are outside this contract. A later contract covers them.

## 0. Place

Identity is the core. Look and voice can be swapped.

An avatar is one person with a character and a way of speaking. A 2D standing picture, a 3D model, live footage, and a voice profile are renditions of that person, and they can be attached and detached. Several variants of the same person, for example `ryoma-casual`, are not separate people. They live as `variants` under the same `id`.

- Declare capabilities. The same shape as the knob declaration in an asset-library `meta.json`. Each rendition declares, in a machine-readable way, whether it can lip-sync, how many expressions it has, and its framing (bust-up, full body, and similar). A capability that is not declared does not exist.
- Reading is staged (section 3). Three stages: a one-line card (L0), a digest (L1, AVATAR.md), then the detail files (L2). Read only the depth that is needed. Everyday insert decisions and script generation are designed to finish at L1.
- The registry is a container. Assets are made on existing lanes. Voice is a product of the three narration-tts lanes. A standing picture is a product of the image-generation lane. This contract only registers those products here. It does not add a new way to generate them.

## 1. Where it sits in the four scope layers

Use the same four scope layers as the asset library contract, the section "Asset scope layers" of `contract-2026-07-13-asset-library.md`.

| Layer | Place | Notes |
|---|---|---|
| `builtin` | The equivalent of `assets/` in this repository | Avatars are not bundled. The count is 0 today. |
| `catalog` | `catalog/avatars/` in this repository (an index, the remote equivalent) | Only an avatar whose `rights.subject` is `original` or `third_party` may be admitted |
| `user` (personal) | `~/.akari/avatars/` | The default place for an avatar that includes a real person's face or voice |
| `project` | `.akari/avatars/` inside the project | A character for one job |

- Validation forces the real files of a real person's face and voice into the personal scope. An avatar whose `rights.subject` is `person` is a validation error if its path is under the public `catalog/avatars/` (sections 8 and 11).
- Search order and shadowing follow the four scope layers of the asset library contract.

## 2. Directory structure

One avatar is one directory.

```
avatars/
  INDEX.md                     L0. A list of one-line cards for every avatar. The spine.
  <id>/
    AVATAR.md                  L1. The entrance for staged reading. The equivalent of SKILL.md. Section 3.
    avatar.json                The machine-readable source of truth. Identity, capability declarations, and rights. Section 4.
    persona/
      persona.md               L2. The full persona. Tone samples, vocabulary, and the NG detail.
      relationships.json       L2. Relations with other avatars. Section 6.
    voice/
      voice.json               L2. The voice profile. Lane, and a speaker or profile reference.
      samples/                 Recorded samples. The clone source. Personal scope only.
    renditions/
      <rendition-id>/          One rendition is one directory. Examples: 2d-bustup, 2d-fullbody, 3d, photo.
        rendition.json         The capability declaration and the asset index. Section 5.
        <asset files>          Expression differences, lip-sync differences, models, and similar.
    preview.png                A thumbnail for the list and for a decision card.
```

- `persona/persona.md` and `persona/relationships.json` are optional L2 files. They may be omitted while the full writing of the persona core has not started. When they are omitted, the `persona` object in `avatar.json` is the only source for both L1 and L2. When `persona.md` is prepared later, switch the source of truth to that file.

## 3. Staged reading

Apply the progressive disclosure of CLAUDE.md and SKILL.md to an avatar. Write down when a deeper read is allowed. Otherwise do not read it.

| Stage | File | What is written there | When to read it |
|---|---|---|---|
| **L0** | One line of `avatars/INDEX.md` | Example: `ryoma. Explainer. A calm, plain tone. 2D full body and bust-up, lip sync available. Own-voice clone.` | An avatar list, and resolving "is anyone here?" |
| **L1** | `AVATAR.md` (**135 lines or fewer**) | Frontmatter (`description` and `when_to_use`), a persona summary (first person, tone, and the top NG items), a capability table, and a pointer to L2 | An insert decision, script generation, and decision-card generation. Everyday work stops here. |
| **L2** | `persona/`, `voice/`, and `renditions/*/rendition.json` | The full text and every declaration | Specific stages only. Lip-sync prerender reads only the matching rendition. A two-person script reads only `relationships.json`. Voice generation reads only `voice.json`. |

- AVATAR.md frontmatter follows the same search-signal rule as `description` and `when_to_use` on an asset `meta.json`. Vocabulary lines up across schemas.
- The line cap on AVATAR.md is 135 lines. Going over is a subject of `validate-avatar.mjs`. A missing file and a file that breaks the rule fail.
- A person (the owner or the character's author) leads the persona core of AVATAR.md. An LLM stays at proposing and formatting.

## 4. `avatar.json` schema v0

The machine-readable source of truth. The full schema is `packages/schemas/avatar.schema.json` (`$id: urn:akari-video:schema:avatar:v0`).

```jsonc
{
  "version": 0,
  "id": "ryoma",
  "display_name": "Ryoma",
  "variants": [],                        // example: ["ryoma-casual"]. Not a separate person.
  "persona": {
    "first_person": "I",
    "tone": "calm and familiar",          // free text, centered on the tone vocabulary of the direction engine
    "speech_style": "Explain by unpacking the idea. Define a technical term once, then use it.",
    "verbal_tics": ["you know"],
    "energy": 40,                         // 0-100. See section 9.
    "ng": ["definite investment advice"],
    "default_role": "explainer"           // the role vocabulary in section 7
  },
  "voice": {                              // detail is voice/voice.json. This is the minimum needed to resolve.
    "lane": "fal-clone",                  // voicevox, fal-clone, or recorded. Follows narration-tts. Section 10.
    "ref": "profile:owner-ja",
    "credit": null
  },
  "renditions": [                         // a summary of capability declarations. Detail is each rendition.json. Section 5.
    {
      "id": "2d-fullbody",
      "kind": "2d",                       // 2d, 3d, or photo
      "capabilities": {
        "lipsync": true,
        "expressions": ["neutral", "happy", "..."],
        "framing": ["fullbody"]
      }
    }
  ],
  "default_rendition": null,              // null means ask on a decision card every time (the insert flow of section 7)
  "rights": {                             // section 8. Required. Cannot be omitted.
    "subject": "person",                  // person, original, or third_party
    "consent": "self",                    // self, signed:<path>, or terms:<url>
    "credit_required": false,
    "distribution": "private"             // private, org, or sellable
  }
}
```

## 5. `rendition.json` schema v0

The source of truth for each `renditions/<rendition-id>/rendition.json`. The full schema is `packages/schemas/avatar-rendition.schema.json` (`$id: urn:akari-video:schema:avatar-rendition:v0`).

```jsonc
{
  "version": 0,
  "id": "2d-bustup",
  "kind": "2d",
  "capabilities": {
    "lipsync": true,
    "expressions": ["neutral", "happy", "sad", "angry", "surprised", "laugh"],
    "framing": ["bustup"]
  },
  "assets": {                            // an index of file names relative to the rendition directory
    "expressions": {
      "neutral": "master-neutral-closed.png",
      "happy": "happy.png"
      // one entry for each item of capabilities.expressions
    },
    "lipsync": {                          // lip-sync states. Examples: neutral-closed, neutral-half, neutral-open.
      "neutral-closed": "master-neutral-closed.png",
      "neutral-half": "neutral-half.png",
      "neutral-open": "neutral-open.png"
    }
  }
}
```

- Every file name listed in `assets` must resolve to a real file under the rendition directory at validation time. A missing file fails, and every missing name is listed (section 11).
- `capabilities` has the same shape as `renditions[].capabilities` on the `avatar.json` side, which is the summary. The detailed asset index lives on this `rendition.json`.

## 6. `relationships.json` schema v0

Relations among several avatars.

A two-person exchange cannot be written from individual personas alone. The name one avatar uses for another, and the distance between them, are attributes of the pair. They live in `persona/relationships.json`. That file is L2, and it is read only when generating a two-person script.

```jsonc
{
  "version": 0,
  "relations": [
    {
      "to": "zundamon",                  // the other avatar's id
      "calls_them": "Zundamon",          // the name used for them
      "register": "casual",              // casual or polite
      "dynamic": "Teacher and student. It works when this avatar is the one learning."
    }
  ]
}
```

- The declaration is one way. A to B and B to A are separate rows. A registration with only one avatar may use an empty `relations: []`.
- Consuming this file, generating a two-person script that takes the relation into account, is a later stage. This contract sets the data shape only.

## 7. Role vocabulary

Five roles.

Start with five words, and evolve by addition only. `explainer`, `listener`, `tsukkomi`, `narrator`, and `guest`. `persona.default_role` is the default. A scene may override it.

## 8. Rights and license

`rights` is required.

`rights` is a required field of avatar.json. Omitting it is a validation error.

| Field | Values | Meaning |
|---|---|---|
| `subject` | `person`, `original`, or `third_party` | `person` is a real person. `original` is an original character. `third_party` is a character such as a VOICEVOX character. |
| `consent` | `self`, `signed:<path>`, or `terms:<url>` | A record of the person's own consent (`person`), a path to a signed consent form, or a third-party terms URL |
| `credit_required` | boolean | Whether a credit line is required |
| `distribution` | `private`, `org`, or `sellable` | How far it may be distributed |

- An avatar with `subject: "person"` cannot have `distribution: "sellable"`. That is a validation error.
- An avatar with `subject: "person"` cannot be placed under the public `catalog/avatars/`. That is a validation error (section 1).
- `subject: "third_party"` records the terms URL and the credit obligation in `consent` and `credit_required`.

## 9. `energy` is a different axis from treatment flashiness

`persona.energy` (an integer from 0 to 100) is a different axis from the treatment engine's flash level, how showy the treatment is.

- The flash level is how showy the treatment is. Edit strength such as hooks. Vocabulary of the treatment engine and the intake wizard.
- `energy` is the character's own heat. 0 is calm. 100 is high energy.

The two share only the scale, a range of 0 to 100. Do not mix the meanings. A high `energy` (a heated character) in a video with a low flash level (a calm treatment) is a valid combination.

## 10. Voice

No new lane. A reference only.

An avatar's voice consumes the three lanes of the narration-tts contract as they are: `voicevox`, `fal-clone`, and `recorded`. What this contract adds is only the reference "the speaker of the script is an avatar, so voice resolution becomes automatic." The lanes, the engine adapters, and the provenance rules stay the source of truth on the narration-tts contract. They do not change.

## 11. Validation

`packages/schemas/bin/validate-avatar.mjs <avatar-dir>` checks the following.

1. Structural validation against `avatar.schema.json` and `avatar-rendition.schema.json`.
2. `rights` is required. A missing field fails.
3. `rights.subject: "person"` combined with `rights.distribution: "sellable"` is forbidden.
4. An avatar with `rights.subject: "person"` under the public `catalog/avatars/` is forbidden.
5. The 135-line cap on `AVATAR.md`.
6. Every file name listed in `assets` of each `rendition.json` resolves to a real file. A missing file is listed in full.

## 12. Versioning

Apply the three principles of `contract-2026-07-17-data-contract-versioning.md` to all of `avatar.json`, `rendition.json`, and `relationships.json`. `version` is an integer starting at 0. Evolution is additive. The reader is tolerant. Field names are snake_case. A breaking change happens only as a `version` bump that ships with an explicit migration.

## 13. Revision note (S2, 2026-07-26)

- `minItems` on `renditions` was relaxed from `1` to `0` (`packages/schemas/avatar.schema.json` and `validate-avatar.mjs`). This expresses a voice-only avatar, a case that registers a voice and has no rendition. An example is registering the VOICEVOX preset proposal of section 1 into the personal scope. Every existing `avatar.json` with one or more `renditions` stays valid. That fits the principle "additive evolution." It is not a breaking change.
- When `renditions` is `[]`, `default_rendition` stays `null`. There is no rendition to choose. A non-null value is a validation error, because it does not exist in `renditions[]`.
- The `avatar.json` sample in section 4 is unchanged, and still shows one or more `renditions`. A voice-only avatar is expressed only by this note. The existing sample is not rewritten into a voice-only example.

**English** | [Japanese](./contract-2026-08-12-chat-approval-v0.ja.md)

# chat-approval contract v0 (chat notification and button approval)

- Date: 2026-08-12
- Status: **v0 draft. Needs owner review.**
- Depends on `contract-2026-08-02-setup-remote-v0.md` (the tailnet-only viewing path, which supplies the report URL), `contract-2026-07-25-project-structure-v0.md` (the approval-report artifact), `packages/decision-cards/report-helper.mjs` (the only implementation of read, write, and commit for `decisions.json`), and `skills/manage-connections` (the only entry for the connection registry and credentials).
- Scope: **notify chat** when an approval gate is reached, and return an approval **only by tapping a button**.
- Out of scope: free-text instructions from chat, starting or driving an agent, carrying footage through chat, and more than one channel. v0 is Telegram only.

## 0. Place in the system

**Chat is a pipe, not a brain.** It carries a "ready" notice, a link to the report, images, and **an approval reply from a closed list**. The AKARI pipeline still owns the edit decision. `decisions.json` still owns the approval record. The chat layer owns no source of truth.

## 1. Decisions

| Question | Decision |
|---|---|
| What to add | **Notification and approval only.** Do not start an agent from chat. That is a separate contract. |
| Write path | The bridge **does not write `decisions.json` itself**. It calls the report-helper HTTP API (`POST /api/state` and `POST /api/commit`) through 127.0.0.1. Atomic write, validation, mode `0600`, and the 409 on a double commit stay as the existing implementation already does them. |
| Receive path | **Long polling** (`getUpdates`). Do not create a public endpoint, a webhook, or a tunnel. Do not open an inbound port to the internet. |
| Input vocabulary | **A closed vocabulary only.** Process a `callback_data` only when it matches the defined set. Do not process free text. |
| Channel | Telegram only (v0). The implementation lives in `packages/chat-bridge/`, in a shape that can add LINE or Discord later. |

## 2. Why free text stays out (the center of this contract)

Passing free text through to an agent opens the prompt-injection window that the trust-boundary contract in `planning` (private) already covers. A button's `callback_data` is a **finite set defined by the sender**. The receiver only has to drop a value that is not in the set. v0 builds on that property.

- Express a send-back as "do not commit, and return a link that opens the report". Free-text reasons belong on the report.
- If a free-text message arrives, do not process it. Reply with the fixed line "Use the report".

## 3. Safety rules (hard rules)

1. **Do not put the token under git, in a report, in a log, or in a conversation.** The only place is `~/.akari/credentials.env` (mode `600`). The agent does not read the value. It names the KEY only.
2. **An allowlist of chat IDs is required.** Drop every update from a chat ID that is not registered. Do not process it. Anyone can reach the bot's username, so without this list a third party could approve.
3. **The bridge does not listen on a port.** Send and receive are outbound long polling only.
4. **Do not write `decisions.json` directly** (the decision in §1). Go through report-helper only.
5. **Do not process an update twice.** Make it idempotent on `update_id`. Telegram may deliver again.
6. **Send only the report's images and text.** Do not send original camera footage, secrets, or the internal shape of paths.
7. **Do not call it done until a live check passes.** The notice must reach a real device, and a button tap must update `decisions.json`.

## 4. Pieces

| Piece | Place | Role |
|---|---|---|
| Bridge | `packages/chat-bridge/telegram.mjs` | Send the notice, long-poll, call the report-helper API |
| Setup skill | `skills/setup-chat-approval/` | doctor, then BotFather guidance (a human step), then obtain the chat ID, then the live check. Same shape as `setup-remote` |
| Connection registration | `.akari/connections.json` | Owned by `manage-connections` (waiting on the choice in §5) |

### Message shape

```
<project name>. Approval needed.
<summary, 1 or 2 lines>
[a few keyframe images]

[ Open report (URL) ] [ Commit with defaults ] [ Later ]
```

- "Open report" is a URL button. The URL is tailnet-only. Telegram's servers cannot reach it, so there is no link preview. Set `disable_web_page_preview`.
- "Commit with defaults" calls `POST /api/commit` with every card left at its default. That is the same action as `accept-all` on the report.
- Room for v1: expand a choice button per card. `data-option` is a finite set, so this still fits §2.

## 5. Waiting on a decision. Extending `kind` in `connections.json`

`kind` in the current schema is a closed enum: `genai`, `image`, `video`, `tts`, `music`, `sns`, `analytics`. **There is no slot for notification.** Hard rule 7 of `manage-connections` says not to use a connection that is absent from the registry. Pick one of the following.

| Option | What it does | Assessment |
|---|---|---|
| **A. Add `notify` to the enum** | Update the schema, validation, examples, and the mirror on the `apps/shell` side | **Preferred.** Notification is unlike every existing kind. It is a round trip, not a post outward. Future LINE and Discord use the same slot. |
| B. Reuse the existing `sns` | Zero schema change | `sns` is the slot for posting to an SNS. An approval round trip is a different thing. The meaning gets muddy. |
| C. Leave it off the registry | Finish with credentials.env alone | Breaks hard rule 7. Do not take this option. |

## 6. Artifacts and acceptance

- **L0.** Skill lint, schema validation, and existing tests are green.
- **L1.** Deterministic unit tests. Drop a chat ID that is not allowed. Drop an unknown `callback_data`. Idempotency of `update_id`. Free text is not processed. The token does not leak into output.
- **L2.** A real device. The notice arrives on a phone, and a button tap updates `decisions.json`.

## 7. Later (called out as out of scope)

- Choice buttons per card (v1).
- More channels (LINE, Discord, Slack).
- Starting an agent from chat, or free-text instructions. That needs a separate trust-boundary contract. A resident agent, such as Hermes, belongs here too.
- A resume mechanism on the agent side while approval is pending. Today a person says "continue". A design that polls a file in between is separate.

**English** | [Japanese](./contract-2026-08-02-setup-remote-v0.ja.md)

# setup-remote skill contract v0 (remote viewing, approval, and footage handoff)

- Date: 2026-08-02
- Status: **v0 draft. Needs owner review.** The direction and the priority order were approved by the owner on 2026-08-02. The decision basis and the comparison research stay in a private internal record.
- Depends on `contract-2026-07-25-project-structure-v0.md` (the approval-report artifact is `<project>/.akari/reports/*.html` plus keyframe stills), `contract-2026-08-02-creator-root-v1.md` (the canonical workspace layout, the footage drop at `inbox/`, and the rule that **secrets live only in machine settings**), and the preview server (`akari --preview`, default port 4567).
- Scope: a new skill, `setup-remote`, that guides setup of two paths from **another device** such as a phone. (a) View the approval report and the preview. (b) Deliver shot footage to the workspace.
- Out of scope: an approval round trip through a resident chat agent (notice, then approve by reply. A future separate contract). Automating a cloud-sync lane such as Dropbox (v0 only explains it). Exposure to the public internet (§3 hard rule).

## 0. Place in the system

Approval does not require sitting at the desk. The machine runs analysis and render. The person only looks at the report and says OK or send it back. One tool, Tailscale, makes that viewing and the footage handoff possible from a phone. A private network only means **unpublished by default**. The default includes only methods where "a settings mistake published it to the world" cannot happen by structure.

## 1. Decisions (the v0 frame)

| Question | Decision |
|---|---|
| Method | **Tailscale** (tailnet only). Viewing uses `tailscale serve` to put the preview server and the approval-report helper on tailnet-only HTTPS. Footage uses **Taildrop** (send straight from the share sheet to the device. Not through a cloud. No practical size limit. No quality loss). |
| Rejected or deferred | Cloudflare Tunnel plus Access is a **separate contract** for when sharing with someone outside the tailnet becomes a requirement. Do not make "publish, then guard with a gate" the default. Cloudflare Pages does not fit, because reports are generated locally as needed. |
| Footage transport priority | **Taildrop (implemented in v0)**, then Dropbox camera upload, then iCloud Photos, then Google Drive, in that order. v0 only presents the later ones as choices. Google Photos is out of scope. The Library API limit makes automatic fetch impossible. |
| OS | Write for both macOS and Windows. Tailscale and Taildrop support both. Step branches live in SKILL.md. |

## 2. Skill duties, five phases

1. **doctor.** Judge the Tailscale install state deterministically: not installed, installed but not logged in, or configured. Also detect whether the preview server can start, and the current serve settings.
2. **Install guide, handoff of the human steps.** Do not automate the installer sudo, the GUI login, or installing the phone app. A macOS cask is a .pkg and requires an interactive sudo. That was measured. The skill says "this step is yours", confirms completion with doctor, then moves on. Repeat that shape.
3. **serve settings.** `tailscale serve` turns the two allowlist entries (§3) into tailnet-only HTTPS URLs. To keep the externally visible mouth stable, the default **fixes the external port and maps the internal port**.

   | External | Internal | Contents |
   |---|---|---|
   | `https://<host>.ts.net/` | 4567 | Preview server |
   | `https://<host>.ts.net:8443/` | the helper's dynamic port | Approval report and `decisions.json` |

   The report helper's internal port may change on every start. The external URL stays fixed, so a link pasted into chat does not die on the next start. A path branch (`--set-path /report`) joins the choices only after the prefix-stripping behavior is measured. Until it is measured, it is not the default.
4. **Taildrop receive settings.** Fix the receive folder and connect it to the workspace `inbox/`. If a direct path can be set, set it. If it cannot, explain the move from the receive box into `inbox/`.
5. **Live check.** From the other device, (a) the serve URL opens, and (b) a Taildrop test file appears in `inbox/`. When both pass, record the URL and the receive path in the completion report and stop.

## 3. Safety rules (hard rules)

- The default is **tailnet only**. Do **not use or suggest** `tailscale funnel`, which publishes to the public internet. Handle it only when the user explicitly asks, and only after a risk explanation and an explicit approval.
- The only targets that may be served are **the following two allowlist entries** (extended 2026-08-12):
  - (a) The **preview server** (`akari --preview`, default 4567).
  - (b) The **decision-cards report helper** (`packages/decision-cards/report-helper.mjs`). It serves the approval report and does read, write, and commit of `decisions.json`. It binds to `127.0.0.1`.

  Do not serve any other port, app, or filesystem. To grow the allowlist, **revise this contract first**. Do not add an entry by a judgment inside the skill.
- Do not write secrets into the workspace or a project (the creator-root v1 rule). Tailscale holds its own credentials. The skill holds none.
- The skill does not finish an install on its own (§2 phase 2, the human step). Show every network-settings change first, and run it only after approval.

## 4. Connection to intake

- The Taildrop receive target lands in the workspace `inbox/` (the drop inlet in creator-root v1 §3).
- v0 does **not define an automatic selection rule** for "edit the thing I just shot" (the latest N files, the last 24 hours, and similar). A person pointing at a file inside `inbox/` is enough. Automatic selection is a future contract on the intake side.
- A cloud-sync lane such as Dropbox must still normalize to "the sync folder is what gets watched". Whatever the transport, the final shape is "a file exists in a local folder".

## 5. Artifacts and acceptance

Artifacts: `skills/setup-remote/SKILL.md` (and, if needed, a deterministic `bin/doctor.mjs`), plus registration in `docs/skills.md` and `docs/skills.ja.md` (skill 19, under "prepare the project and the footage").

- **L0.** SKILL.md shape and skill lint pass.
- **L1.** doctor correctly judges the three states: not installed, not logged in, configured.
- **L2.** A live smoke test from another device. (a) The preview serve URL opens. (b) Open the approval report and save a decision, and `decisions.json` actually updates. (c) A Taildrop test file appears in `inbox/`. This is the live check in §2 phase 5.

## 6. Later (called out as out of scope)

- A resident chat agent. An approval gate is reached, chat gets a notice (a link, or a picture of the report), and a reply approves or sends it back. Cut a separate contract after the prerequisite check is done.
- Turning cloud-sync lanes into doctor checks and automatic setup, in the order Dropbox, iCloud, Google Drive.
- Sharing outside the tailnet, so a client or a collaborator can look with only a browser. A separate contract for Cloudflare Tunnel plus Access (one-time PIN).
- An automatic footage-selection rule from `inbox/` (the latest N files), and an automatic connection to create-project and analyze-footage.

## 7. L2 measurements (2026-08-12, owner's iPhone and macOS)

**What passed:**

| Check | Result |
|---|---|
| Preview viewing from another device | Pass. It displayed over the tailnet. The felt speed was more than enough, because the path is direct WireGuard. |
| **Playback of a video embedded in the report** | Pass. It played on a real iOS device, and **seek succeeded** (H.264 640x360, 6 seconds). |
| Taildrop arrival | Pass. The real receive path is **`~/Downloads/`** (macOS GUI build, fixed by measurement). |
| Taildrop does not degrade the file | Pass. 92 MB, HEVC, 1180x2556, 60 fps, still **15.7 Mbps**, with no re-encode. |
| Taildrop into the workspace `inbox/` | Pass. Connected by a **move**. The destination is `~/Akari/inbox/`. The macOS standalone build cannot change the receive folder, so the path is a move, not a direct setting. That matches the assumption in §2 phase 4. |
| **Approval round trip (`decisions.json`)** | Pass. A tap on the phone wrote back to the file on the Mac. Three paths passed: a single-select card (`thumbnail`, default to another candidate), an integer slider (`direction.intensity`, 50 to 75), and **commit (`completedAt` filled in)**. `byDefault: false` and `answeredAt` updated as expected. The file stayed mode `0600`. |

- The Taildrop measurement supports the claim that a chat attachment is a poor transport, which is why that path is out of scope. The same 92 MB file cannot pass the Telegram Bot API standard receive limit of 20 MB.
- The received file was HEVC. That is a real case where the preview server needs its automatic H.264 proxy in daily use.

**What did not pass (L2 is not closed):**

| Gap | State |
|---|---|
| HTTPS | **TLS for `tailscale serve` did not come up.** The measurements above used plain HTTP inside the tailnet instead. Confidentiality holds because the traffic is inside WireGuard, but a feature that needs a secure context cannot be used. **Do not make plain HTTP the default.** |

**HTTPS failure split (2026-08-12).** This is not a defect in the skill or in the serve settings.

- HTTPS is enabled on the tailnet (`CertDomains` in `tailscale status --json` contains the domain).
- The serve configuration itself is fine. The same path answers 200 in 0.28 seconds over plain HTTP.
- CAA allows issuance (`issue "letsencrypt.org"` on `ts.net`).
- The Let's Encrypt order is `status: invalid` every time. The order id is new every time, so this is a validation failure, not a rate limit.
- **Five disposable TXT records had piled up on `_acme-challenge.<host>.<tailnet>.ts.net`.** That matches a DNS-01 validation failure. The current token is suspected of not being published correctly.
- This is a **tailnet-side problem** (Tailscale DNS or the control plane). Retrying only adds more TXT records and does not improve, so stop and move to the next move. Candidates: (a) rename the machine and recreate the `_acme-challenge` name with it (the serve URL changes). (b) Ask Tailscale support.

## 8. Revision history

| Date | Change | Reason |
|---|---|---|
| 2026-08-02 | v0 first edition | none |
| 2026-08-12 | §3 grew the serve allowlist from 1 entry to 2 (added the decision-cards report helper). §2 phase 3 states the external-port map. §5 L2 adds the measured approval round trip. | The original scope (§0, "look at the report and say OK or send it back") included approval from the start, but the hard rule was too narrow (`serve` means preview only). **The contract had no path that serves the approval report.** This corrects a mismatch between the scope and the hard rule. It does not widen the scope. |

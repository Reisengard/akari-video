# EN-3 verification receipts

Shell chrome, export UI, companion controls, theme descriptions, tab commands,
and Map wording now use English. The Open section and optional Map row have a
regression test. EN-3's wording budget is zero. Original Japanese source comments
remain for EN-28; CSS notes were moved outside CSS template strings.

Baseline: `8093e0f06eb1a3f20cedd7f8c0b5a9be3b1b4fea` (EN-1 on main).
Environment: Windows, PowerShell, 2026-10-03. Run helpers from the repository root.

## Passing checks

- `npm run build:ext` in `apps/shell`: exit 0 (`build-ext.log`).
- `npm run lint` in `apps/shell`: exit 0, five existing warnings (`lint.log`).
- Each extension's `npm test` includes `tsc -b`: shell-strip 297/297,
  theme 25/25, tabs 10/10, world-view 16/16 (`head-*.log`).
- `npm run check:english-wording` in the clean isolated EN-3 checkout:
  exit 0, `english-wording ok` (`wording-clean-checkout.log`).
- `node apps/shell/extensions/akari-shell-strip/evidence/en-3/check-slice.mjs`:
  the actual wording checker reports `english-wording ok` for an EN-3 source-only
  fixture (`wording-slice.log`).

## Unfinished gates

- Companion: 99 pass, four failures, reproduced unchanged on the baseline.
  Two depend on POSIX file permissions; two depend on SIGTERM delivery.
  See `head-companion.log` and `baseline-companion-1.log`.
- Shared-tree wording check fails other slices' budgets after extension builds:
  EN-5 through EN-9 include ignored compiled `lib` output. EN-3 is zero.
  See `wording-full.log`; the clean checkout passes the full-tree gate.
- Performance rule failed. Trunk-first runs were 17.763, 7.182, and 7.482 seconds;
  median 7.482, limit 8.230. Head took 12.489 seconds and a repeat took 12.364.
  Trunk-after took 7.991. Full npm-test wall time includes compilation.
  Baseline shell-strip tests have seven existing Windows failures, so this is
  also not a clean passing-baseline comparison. Head fixes their portable path
  expectations and CRLF source snapshot; production behavior is unchanged.
  See `*-shell-strip*.json` and logs. Helpers: `baseline.mjs`, `head-benchmark.mjs`.
- Electron did not open: initial `npm start` lacked generated
  `lib/backend/electron-main.js` and reported an unusable GPU process (`boot.log`).
  A subsequent full `npm run build` stopped at missing native
  `@theia/ffmpeg` addon (`build-shell.log`). No live screenshots or video exist;
  none of the ten live lanes or the operator visual review gate is complete.
- The plan's Grok swarm, drive, deslop, and no-comments tooling/playbooks are
  unavailable in this session. No swarm or merge-ready verdict is claimed.

This change is ready for code review, but has **not met EN-3's merge gates**.
The operator retains merge authority.

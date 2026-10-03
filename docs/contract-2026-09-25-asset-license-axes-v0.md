**English** | [Japanese](./contract-2026-09-25-asset-license-axes-v0.ja.md)

# Footage license axes v0

`license` on a footage `meta.json` may add two optional axes. `commercial` is `allowed`, `prohibited`, or `unknown`. `attributionRequired` is `true`, `false`, or `null`. Readers still use the old `scope`, `spdx`, and `attribution_required` values. Writers do not rewrite them. `null` means the axis cannot be decided.

## Derivation

| Declared value or old value | Commercial use | Default attribution |
|---|---|---|
| `CC0-1.0`, `LicenseRef-AKARI-Assets-v0`, `LicenseRef-AKARI-Sounds-Terms-v0`, `MIT`, `OFL-1.1` | allowed | false |
| Versioned `CC-BY-*` (`CC-BY-SA-*`, `CC-BY-ND-*`, and other forms that do not contain NC) | allowed | true |
| `CC-BY-NC-*`, including combinations with SA or ND | prohibited | true |
| Any other SPDX id that contains `NC` as a separated token | prohibited | null when it cannot be told apart |
| Old `scope: commercial-ok` | allowed | null when unset |
| Old `scope: non-commercial` | prohibited | null when unset |
| Old `scope: attribution` | allowed | true |
| An unsupported scope such as `scope: paid-license-required`, combined with an SPDX id that cannot be told apart | unknown | null when unset |
| `meta.json` exists, but `license` is missing or cannot be told apart | unknown | null when unset |
| No `meta.json` | Out of scope. No finding is reported for the user's own footage | Out of scope |

A boolean old `attribution_required` is copied onto the attribution axis. Versioned CC-BY attribution prefers `true`. When the new pair of axes is present, it wins. A commercial ban from an SPDX `NC` token wins over an old `scope: commercial-ok`. An unknown scope alone does not decide commercial use. A known SPDX id supplies the derived value instead. Neither axis is filled in from the other.

## Display before Export

For footage that is in use, edit-lint reports `license.non-commercial` as a warning. It reports `license.unknown` and `license.attribution` as info. Each finding's `details` has `asset`, `name`, and `credit`. Credit prefers the first line of `CREDIT.txt` in the same footage directory. If that file is absent, credit is built from the title, the author, and the SPDX id. The Export screen shows only the matching rows, and the name list can be opened and closed. A row that requires attribution can copy the credit. These findings do not stop Export.

Existing `assets/` and `catalog/` metadata is checked in full by `packages/asset-resolver/test/license-axes.test.mjs`. Paths whose commercial axis is unknown are listed in the test output. The check does not change the source metadata.

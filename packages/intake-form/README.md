# @akari-video/intake-form

[English](README.md) | [日本語](README.ja.md)

A standalone browser intake form for AKARI Video. It reads and writes
`.akari/intake.json` without requiring the app, external npm dependencies, or
a network listener beyond `127.0.0.1`.

## Usage

```sh
node packages/intake-form/intake-form-helper.mjs <project-root> [--port N]
```

The helper prints `intake-form: http://127.0.0.1:<port>/  (project: ...)`.
Open that address in a browser. Submitting the form writes
`<project-root>/.akari/intake.json` with `status: "submitted"`.

## Files and endpoints

`intake-form-server.mjs` exports `createIntakeFormServer(projectRoot)`,
which returns an HTTP server without listening. The CLI wrapper is
`intake-form-helper.mjs`; the static form is `intake-form-template.html`.

- `GET /` serves the form.
- `GET /api/state` reads the intake file, returning 404 when absent.
- `POST /api/state` writes the complete intake file, creating `.akari/` if needed.

## Relationship to the app

The shell home widget implements the same intake flow in React. Both forms use
the same intake file and stable task and autonomy IDs. Display labels come from
`packages/schemas/intake.schema.json`: `x-akari-labels` and
`x-akari-autonomy-labels`. The React constants and HTML tables are manual
mirrors; tests compare both maps to the schema to prevent drift.

The rendering implementations remain independent so this package can work
without the app.

## Tests

```sh
node --test packages/intake-form/test/*.mjs
```

The tests verify file persistence, schema validation, and both label mirrors.

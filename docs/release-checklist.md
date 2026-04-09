# Release Checklist

## Goal

This checklist is the minimum release gate for a demo-safe, thesis-safe build of the extension.

## 1. Metadata

- `package.json` version is updated correctly.
- `publisher`, `repository`, `homepage`, and `bugs` fields are valid.
- `README.md` reflects the current feature set.
- `DEVELOPMENT.md` reflects the current Node version and script names.
- `CHANGELOG.md` includes the release notes for the current version.
- The command list matches the implemented extension commands.

## 2. Build And Package

- `npm run compile`
- `npm run build:webview`
- `npm run test:local`
- `npm run test:integration`
- `npm run package:vsix`

Expected result:
- No TypeScript compile errors
- Webview bundle generated successfully
- Local test suite passes
- VS Code integration suite passes
- `.vsix` package is produced

## 3. Workflow Smoke Test

Use the step-by-step checklist in [clean-install-smoke.md](/home/munkh-orgil/Documents/uml-orm-refactor/docs/clean-install-smoke.md).

Expected result:
- No command crashes
- Generated files open successfully
- Imported diagram is editable
- Diagnostics appear when partial imports occur

## 4. Benchmark Evidence

- Benchmark corpus is available:
  - `examples/simple-5-classes.orm.json`
  - `examples/full-relationships-10-classes.orm.json`
  - parser stress snippets from `docs/evaluation-evidence.md`
- Measurement rubric is up to date
- Latest measured results summary is reflected in the thesis

## 5. Marketplace And VSIX Readiness

- Extension icon and branding assets are present
- License is included
- Package file whitelist is still correct
- `uml-orm-refactor-*.vsix` installs successfully
- Marketplace description does not overclaim production maturity

## Positioning Statement

Use this wording in release and defense material:

`production-oriented VS Code extension with validated core workflows for UML-to-ORM, repository skeleton generation, reverse parsing, and database-aware DDL generation`

# Changelog

## 0.2.2

- Updated Marketplace-facing documentation copy for clearer user onboarding and feature highlights.
- Aligned extension naming and presentation with `UML to ORM Designer` branding.
- Refined README structure for a more concise public listing experience.

## 0.2.1

- Added user-facing `Generate DDL` command flow.
- Added user-facing `Generate Repository` command flow for repository / DAO skeletons.
- Unified webview, activity bar, and command palette generation behavior.
- Improved import diagnostics with parser kind, confidence, and issue summaries.
- Hardened generated entity methods so UML operations render as non-executable placeholders instead of runtime-failing stubs.
- Standardized the release baseline on Node.js 20 with explicit `test:integration` and `package:vsix` scripts.
- Added benchmark/evaluation evidence documentation, clean-install smoke guidance, and release checklist updates.
- Added CI workflow for compile, build, local tests, VS Code integration tests, and VSIX packaging.

## 0.2.0

- Initialized `uml-orm-refactor` publish-ready project structure.
- Added clean architecture layers: `domain`, `application`, `shared/contracts`.
- Added typed webview-extension message contracts.
- Refactored core schema update/delete logic to domain operations.
- Added publish metadata (`publisher`, `repository`, `bugs`, `homepage`).
- Added package file whitelist and Node 20 compatible `vsce` scripts.

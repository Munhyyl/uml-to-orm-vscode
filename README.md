# UML to ORM Refactor

VS Code extension for designing UML class diagrams visually and generating ORM code from a shared intermediate representation.

## What It Does

- Visual UML class diagram editor for `.orm.json` files
- Forward engineering to `Prisma`, `TypeORM`, `SQLAlchemy`, `Django`, and `Hibernate`
- Reverse engineering from `.prisma`, `.ts/.js`, `.py`, and `.java` schema/model files
- UML-aware relationship editing:
  `association`, `aggregation`, `composition`, `inheritance`, `realization`, `dependency`
- XMI 2.5.1 export/import through a UML metamodel bridge
- VS Code custom editor, activity bar project view, save/export/import workflows

## Architecture

The project is organized around a single JSON-based IR: `ProjectSchema`.

```text
src/
├── extension.ts                  # VS Code activation, commands, tree view
├── editor/                       # Custom editor provider + document lifecycle
├── webview/                      # React + React Flow diagram editor
├── domain/schema/                # Pure schema operations and helpers
├── generators/                   # ORM code generators
├── parsers/                      # Reverse engineering services
├── types/                        # IR, UML metamodel, converter types
├── xmi/                          # XMI import/export
├── shared/contracts/             # Typed webview messaging contracts
├── application/state/            # Shared history utilities
└── test/                         # Unit and regression tests
```

Main flow:

`Diagram UI -> ProjectSchema -> Generator / Parser / UML Converter -> Code or XMI`

## Supported Targets

| Language | ORM | Forward | Reverse |
| --- | --- | --- | --- |
| TypeScript | Prisma | Yes | Yes |
| TypeScript | TypeORM | Yes | Yes |
| Python | SQLAlchemy | Yes | Yes |
| Python | Django | Yes | Yes |
| Java | Hibernate | Yes | Yes |

Reverse parsing is rule-based and best-effort. Common entity/field/relation patterns are supported, but uncommon syntax and framework-specific edge cases may still need manual cleanup after import.

## Development

Install and build:

```bash
npm install
npm run compile
npm run build:webview
```

Run in VS Code:

1. Open the repo in VS Code
2. Press `F5`
3. In the Extension Development Host, create or open a `.orm.json` file

Useful commands:

```bash
npm run compile
npm run lint
npm run build:webview
npm run preflight
```

Local verification used in this repo:

```bash
npx mocha --ui tdd \
  dist/test/history.test.js \
  dist/test/prismaGenerator.test.js \
  dist/test/generatorRegression.test.js \
  dist/test/schemaValidator.test.js \
  dist/test/xmiRoundTrip.test.js
```

## Current Notes

- Undo/redo is backed by a shared history utility and wired into the webview editor flow.
- XMI round-trip behavior is covered by regression tests.
- Generators now use actual primary key names when emitting foreign key references.
- Django generation preserves non-default primary keys.
- TypeORM interface generation avoids invalid empty imports.

## Known Limitations

- Reverse parsers use regex/rule-based extraction, not full AST parsing.
- Automated VS Code integration tests still depend on `vscode-test` runtime availability.
- The editor currently focuses on UML class diagrams only.

## License

MIT

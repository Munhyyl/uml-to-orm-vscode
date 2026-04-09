# UML to ORM Refactor

VS Code extension for designing UML class diagrams visually and generating ORM code from a shared intermediate representation.

## What It Does

- Visual UML class diagram editor for `.orm.json` files
- Forward engineering to `Prisma`, `TypeORM`, `SQLAlchemy`, `Django`, and `Hibernate`
- Reverse engineering from `.prisma`, `.ts/.js`, `.py`, and `.java` schema/model files
- Database-aware generation for `PostgreSQL` and `MySQL`
- Database-specific DDL artifact generation alongside ORM code
- Repository / DAO skeleton generation for all 5 ORM targets
- UML-aware relationship editing:
  `association`, `aggregation`, `composition`, `inheritance`, `realization`, `dependency`
- XMI 2.5.1 export/import through a UML metamodel bridge
- VS Code custom editor, activity bar project view, save/export/import workflows
- User-facing `Generate DDL` and `Generate Repository` workflows

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

Reverse parsing is adapter-based and syntax-aware. Prisma uses a dedicated DSL parser, TypeORM uses the TypeScript compiler API, Python imports use CST-backed parsing, and Hibernate imports use Java syntax parsing with annotation-aware extraction.

## Development

Supported local and CI runtime: `Node.js 20.x`.

Install and build:

```bash
nvm use
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
npm run test:local
npm run test:integration
npm run preflight
npm run package:vsix
```

## Current Notes

- Undo/redo is backed by a shared history utility and wired into the webview editor flow.
- XMI round-trip behavior is covered by regression tests.
- Generators now use actual primary key names when emitting foreign key references.
- Django generation preserves non-default primary keys.
- TypeORM interface generation avoids invalid empty imports.
- Parser imports now return diagnostics + confidence instead of silent best-effort only.
- Canonical forward/reverse round-trip regression tests cover all 5 ORMs across PostgreSQL/MySQL.
- DDL generation is available both through `CodeGeneratorService.generateArtifacts()` and the extension command `Generate DDL`.
- Repository generation is exposed as a separate `Generate Repository` command and keeps parser/reverse scope unchanged.
- A GitHub Actions CI workflow now verifies compile, webview build, local tests, VS Code integration tests, and VSIX packaging.

## Known Limitations

- Parser coverage is strongest for canonical/generated code and common ORM patterns; advanced handwritten metaprogramming may still import partially with warnings.
- Automated VS Code integration tests use a pinned `vscode-test` host version and are intended to run on Linux with a display server or `xvfb`.
- The editor currently focuses on UML class diagrams only.

## License

MIT

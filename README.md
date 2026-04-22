# UML to ORM Designer

Design UML class diagrams in VS Code and generate ORM models, repository skeletons, and database DDL from a shared schema.

## Highlights

- Visual UML class diagram editor for `.orm.json` files
- Forward generation for `Prisma`, `TypeORM`, `SQLAlchemy`, `Django`, and `Hibernate`
- Reverse import from `.prisma`, `.ts/.js`, `.py`, and `.java` model files
- Database-aware artifact generation for `PostgreSQL` and `MySQL`
- DDL generation and Repository/DAO skeleton generation workflows
- UML-aware relation editing: `association`, `aggregation`, `composition`, `inheritance`, `realization`, `dependency`
- XMI 2.5.1 export and import

## Quick Start

1. Create or open a `.orm.json` file in VS Code.
2. Model entities and relationships in the custom diagram editor.
3. Run commands from the Command Palette:

- `UML to ORM: Generate ORM Code`
- `UML to ORM: Generate DDL`
- `UML to ORM: Generate Repository`
- `UML to ORM: Import Schema from Code`
- `UML to ORM: Export to XMI (UML 2.5.1)`
- `UML to ORM: Import from XMI`

## Architecture

The extension uses one JSON-based intermediate model: `ProjectSchema`.

```text
Diagram UI -> ProjectSchema -> Generator / Parser / UML Converter -> Code or XMI
```

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

## Notes

- Undo/redo is backed by shared history utilities in the webview flow.
- XMI round-trip behavior is covered by regression tests.
- Parser imports return diagnostics and confidence metadata.
- Canonical forward/reverse regression tests cover all five ORM targets across PostgreSQL and MySQL.

## Known Limitations

- Parser coverage is strongest for canonical/generated code and common ORM patterns; advanced handwritten metaprogramming may still import partially with warnings.
- Automated VS Code integration tests use a pinned `vscode-test` host version and are intended to run on Linux with a display server or `xvfb`.
- The editor currently focuses on UML class diagrams only.

## License

MIT

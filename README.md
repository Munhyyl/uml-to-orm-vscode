# UML to ORM Refactor - VS Code Extension

A publish-ready clean architecture refactor of the UML ↔ ORM VS Code extension.

## Features

✨ **Visual UML Editor** - Drag-and-drop interface to design database schemas  
🔄 **Bi-directional** - Forward engineering (UML → Code) and Reverse engineering (Code → UML)  
🛠️ **Multi-ORM Support** - Prisma, TypeORM, SQLAlchemy, Django, Hibernate  
🌍 **Multi-language** - TypeScript, Python, Java  
💾 **Schema Persistence** - Save and load `.orm.json` files

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run compile
   npm run build:webview
   ```
4. Open the folder in VS Code and press `F5` to launch the extension host

## Clean Architecture Structure

```
├── src/
│   ├── extension.ts              # Extension entry point
│   ├── application/
│   │   └── state/                # App state & history utilities
│   ├── domain/
│   │   └── schema/               # Pure schema operations
│   ├── shared/
│   │   └── contracts/            # Typed message contracts
│   ├── types/
│   │   └── schema.ts             # Core IR types
│   ├── editor/
│   │   └── diagramEditorProvider.ts  # Custom editor provider
│   ├── generators/
│   │   ├── codeGeneratorService.ts
│   │   └── orm/
│   │       ├── prismaGenerator.ts
│   │       ├── typeORMGenerator.ts
│   │       ├── sqlalchemyGenerator.ts
│   │       └── hibernateGenerator.ts
│   ├── parsers/
│   │   └── schemaParserService.ts    # Reverse engineering
│   └── webview/
│       ├── DiagramEditor.tsx     # Main React component
│       ├── EntityNode.tsx        # React Flow node
│       ├── Toolbar.tsx
│       ├── PropertyPanel.tsx
│       └── index.tsx             # Webview entry point
├── package.json
├── tsconfig.json
└── README.md
```

## Packaging (Local / Marketplace)

```bash
npm run compile
npm run build:webview
npm run package
```

Node.js 20+ is recommended for `@vscode/vsce` packaging.

## Usage

### Creating a New Diagram

1. Run `UML to ORM: Open Editor` command
2. Enter a name for your diagram (saved as `.orm.json`)
3. Start designing with the visual editor

### Adding Entities

1. Click **+ Add Entity** button
2. Click on an entity in the canvas to select it
3. In the right panel, edit properties and add attributes
4. Set primary key, required fields, and unique constraints

### Generating Code

1. With a diagram open, run `UML to ORM: Generate Code`
2. Select your target ORM and language
3. View generated code in the output panel

### Importing Existing Schema

1. Run `UML to ORM: Import Schema from Code`
2. Select a Prisma `.prisma`, TypeORM `.ts`, SQLAlchemy `.py`, or Hibernate `.java` file
3. The diagram will be generated automatically

## Intermediate Representation (IR)

All diagrams use a JSON-based IR for universal compatibility:

```typescript
interface ProjectSchema {
  version: '1.0';
  entities: ClassEntity[];
  relations: Relation[];
  config: ProjectConfig;
}
```

This allows:

- ✅ Consistent data flow between UI and generators
- ✅ Easy serialization/deserialization
- ✅ Support for multiple ORMs without duplicating logic
- ✅ Future extensibility

## Supported ORMs & Languages

| Language   | ORM        | Status |
| ---------- | ---------- | ------ |
| TypeScript | Prisma     | ✅     |
| TypeScript | TypeORM    | ✅     |
| Python     | SQLAlchemy | ✅     |
| Python     | Django     | 🚧     |
| Java       | Hibernate  | ✅     |

## Roadmap

- [ ] Complete Django ORM support
- [ ] Advanced relationship visualization
- [ ] Export to database migration scripts
- [ ] Validation and constraint rules
- [ ] Collaboration features (multi-user editing)
- [ ] Database diagram import (reverse-engineer from live DB)

## License

MIT

## Contributing

Contributions welcome! Please submit issues and PRs to improve the extension.

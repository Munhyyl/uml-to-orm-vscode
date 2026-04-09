# Development Guide

## Getting Started

### Prerequisites

- Node.js 20.x
- npm
- VS Code 1.85+

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd uml-orm-refactor

# Use the project runtime
nvm use

# Install dependencies
npm install

# Build the extension
npm run compile
npm run build:webview
```

### Running the Extension

1. Open the project in VS Code
2. Press `F5` to launch the Extension Development Host
3. This opens a new VS Code window with the extension loaded

### Development Workflow

#### Extending the Code Generator

To add support for a new ORM:

1. Add a catalog entry in `src/shared/ormCatalog.ts`
2. Create a generator in `src/generators/orm/`
3. Register it in `src/generators/codeGeneratorService.ts`
4. Add an ORM dialect profile in `src/generators/ormDialectProfiles.ts`
5. Add a parser adapter in `src/parsers/adapters/` if reverse import is required
6. Extend the regression and round-trip tests

Example:

```typescript
export class MyOrmGenerator implements CodeGenerator {
  async generate(schema: ProjectSchema): Promise<string> {
    // Implement generation logic
    return generatedCode;
  }
}
```

4. Register it in the ORM generator map:

```typescript
this.generators.set('MyORM', new MyOrmGenerator());
```

#### Adding New Data Types

1. Update `src/types/schema.ts` - add to `DataType` union
2. Update each generator's `mapDataType()` method
3. Update the UI components to display the new type

#### Modifying the Webview

The webview is built with React and React Flow:

1. Edit components in `src/webview/`
2. Run `npm run watch:webview` during development
3. The extension will automatically reload

### Project Structure

```
src/
├── extension.ts                       # VS Code activation, commands, tree view
├── editor/                            # Custom editor provider + document lifecycle
├── generators/
│   ├── codeGeneratorService.ts        # ORM entity/model generation entry point
│   ├── ddlGeneratorService.ts         # Database-aware DDL generation
│   ├── repositoryGeneratorService.ts  # Repository / DAO generation entry point
│   ├── orm/                           # ORM entity/model generators
│   └── repository/                    # Repository / DAO generators
├── parsers/
│   ├── schemaParserService.ts         # Reverse import registry
│   └── adapters/                      # ORM-specific parser adapters
├── shared/
│   ├── ormCatalog.ts                  # ORM/database metadata catalog
│   └── contracts/                     # Typed webview messaging contracts
├── types/                             # ProjectSchema, parsing contracts, UML types
├── utils/                             # Validation and shared helpers
├── webview/                           # React + React Flow editor
├── xmi/                               # XMI import/export
└── test/                              # Unit, regression, round-trip, integration tests
```

### Testing

Fast local regression suite:

```bash
npm run test:local
```

VS Code extension-host integration suite:

```bash
npm run test:integration
```

### Building for Release

```bash
npm run compile
npm run build:webview
npm run package:vsix
```

This creates a `.vsix` file that can be distributed.

### Debugging

#### Extension Code (TypeScript)

- Set breakpoints in VS Code
- Run `F5` to start debugging
- Debug console shows extension logs

#### Webview Code (React)

- The webview runs in a VS Code webview context
- Use `console.log()` and check VS Code's "Developer Tools"
- In the extension host window, go to Help → Toggle Developer Tools

### Common Tasks

#### Adding a New Command

1. Register in `package.json` under `contributes.commands`
2. Implement in `extension.ts`
3. Add keyboard shortcut (optional) in `package.json`

#### Customizing the Editor UI

1. Edit React components in `src/webview/`
2. Use inline `style` objects for styling (not TailwindCSS)
3. State is managed via React `useState` hooks in `DiagramEditor.tsx`

#### Supporting a New Language / Database

1. Add to `TargetLanguage` type in `src/types/schema.ts`
2. Create new generator(s) in `src/generators/orm/`
3. Update catalog metadata in `src/shared/ormCatalog.ts`
4. Update reverse parser registration in `src/parsers/schemaParserService.ts`

To add a new database target:

1. Extend `DatabaseType` in `src/types/schema.ts`
2. Add support rules to `src/shared/ormCatalog.ts`
3. Add ORM dialect mappings in `src/generators/ormDialectProfiles.ts`
4. Add DDL dialect mappings in `src/generators/ddlDialectProfiles.ts`
5. Add regression and DDL tests

To add a repository generation convention:

1. Add repository artifact metadata in `src/shared/ormCatalog.ts`
2. Create a generator in `src/generators/repository/`
3. Register it in `src/generators/repositoryGeneratorService.ts`
4. Add generator regression coverage and VS Code command-flow coverage

### Performance Tips

- Use React Flow's node virtualization for large diagrams
- Memoize expensive computations
- Lazy load generators as needed

### Publishing to VS Code Marketplace

1. Create a Microsoft account and get publisher access
2. Update version in `package.json`
3. Run `npm run publish` (requires Azure DevOps token)

### Troubleshooting

**Webview not loading:**

- Check browser console in Developer Tools
- Verify `dist/webview.js` exists
- Check for CSP (Content Security Policy) errors

**Generators not working:**

- Verify schema is valid (run SchemaValidator)
- Check console output for error messages
- Enable TypeScript strict mode

**React components not updating:**

- Ensure state is immutable (spread objects/arrays)
- Check `useState` / `useCallback` dependencies
- Check for circular dependencies

## Contributing

See README.md for contribution guidelines.

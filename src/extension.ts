import * as vscode from 'vscode';
import * as path from 'path';
import { DiagramEditorProvider } from './editor/diagramEditorProvider';
import { createEmptySchema } from './domain/schema/schemaOperations';
import { CodeGeneratorService } from './generators/codeGeneratorService';
import { DdlGeneratorService } from './generators/ddlGeneratorService';
import { RepositoryGeneratorService } from './generators/repositoryGeneratorService';
import { SchemaParserService } from './parsers/schemaParserService';
import { OrmType, ProjectSchema, TargetLanguage } from './types/schema';
import { ParseResult } from './types/parsing';
import { projectSchemaToUMLModel } from './types/umlConverter';
import { exportToXMI } from './xmi/xmiExporter';
import { importFromXMI } from './xmi/xmiImporter';
import {
  buildDdlFileName,
  buildGeneratedFileName,
  getAllTargetLanguages,
  getDefaultDatabase,
  getOrmsForLanguage,
  getOutputFilters,
  getRepositoryOutputFilters,
  getSupportedDatabases,
  buildRepositoryFileName,
  normalizeProjectSchema,
  resolveDatabase,
} from './shared/ormCatalog';
import { buildImportNotificationMessage, formatParseSummary } from './shared/artifactPresentation';

const REFACTOR_VIEW_TYPE = 'uml-orm-refactor.diagramEditor';
const REFACTOR_PROJECT_VIEW_ID = 'uml-orm-refactor.projectView';
const DIAGRAMS_LABEL = '📂 Diagrams';
const ACTIONS_LABEL = '⚙ Actions';
const REFACTOR_COMMANDS = {
  openEditor: 'uml-orm-refactor.openEditor',
  generateCode: 'uml-orm-refactor.generateCode',
  generateDDL: 'uml-orm-refactor.generateDDL',
  generateRepository: 'uml-orm-refactor.generateRepository',
  importSchema: 'uml-orm-refactor.importSchema',
  exportXMI: 'uml-orm-refactor.exportXMI',
  importXMI: 'uml-orm-refactor.importXMI',
} as const;

interface GenerationCommandOptions {
  useCurrentConfig?: boolean;
  schemaOverride?: ProjectSchema;
}

function getPrimaryWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.workspaceFolders?.[0];
}

function getFileName(uri: vscode.Uri): string {
  return uri.path.split('/').pop() || uri.fsPath;
}

async function openFileBeside(uri: vscode.Uri): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside });
}

function cloneSchema(schema: ProjectSchema): ProjectSchema {
  return JSON.parse(JSON.stringify(schema)) as ProjectSchema;
}

function getSchemaFromTextEditor(): ProjectSchema | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !editor.document.fileName.endsWith('.orm.json')) {
    return undefined;
  }

  try {
    return JSON.parse(editor.document.getText()) as ProjectSchema;
  } catch {
    void vscode.window.showErrorMessage('Failed to parse schema from active editor.');
    return undefined;
  }
}

async function promptGenerationTarget(schema: ProjectSchema): Promise<ProjectSchema | undefined> {
  const workingSchema = cloneSchema(schema);
  const languagePick = await vscode.window.showQuickPick(
    getAllTargetLanguages().map((language) => ({
      label: language,
      description: language === workingSchema.config.targetLanguage ? '(одоогийн)' : '',
    })),
    { placeHolder: 'Хэл сонгоно уу', title: 'Код генерац — Хэл' },
  );
  if (!languagePick) {
    return undefined;
  }

  const selectedLanguage = languagePick.label as TargetLanguage;
  const ormChoices = getOrmsForLanguage(selectedLanguage);
  let selectedOrm: OrmType = ormChoices[0];
  if (ormChoices.length > 1) {
    const ormPick = await vscode.window.showQuickPick(
      ormChoices.map((orm) => ({
        label: orm,
        description: orm === workingSchema.config.orm ? '(одоогийн)' : '',
      })),
      { placeHolder: 'ORM сонгоно уу', title: 'Код генерац — ORM' },
    );
    if (!ormPick) {
      return undefined;
    }
    selectedOrm = ormPick.label as OrmType;
  }

  const databaseChoices = getSupportedDatabases(selectedOrm);
  let selectedDatabase = resolveDatabase(workingSchema.config);
  if (!databaseChoices.includes(selectedDatabase)) {
    selectedDatabase = getDefaultDatabase(selectedOrm);
  }
  if (databaseChoices.length > 1) {
    const databasePick = await vscode.window.showQuickPick(
      databaseChoices.map((database) => ({
        label: database,
        description: database === selectedDatabase ? '(одоогийн)' : '',
      })),
      { placeHolder: 'Өгөгдлийн сан сонгоно уу', title: 'Код генерац — Database' },
    );
    if (!databasePick) {
      return undefined;
    }
    selectedDatabase = databasePick.label as typeof selectedDatabase;
  }

  workingSchema.config.targetLanguage = selectedLanguage;
  workingSchema.config.orm = selectedOrm;
  workingSchema.config.database = selectedDatabase;
  return workingSchema;
}

async function resolveSchemaForGeneration(editorProvider: DiagramEditorProvider): Promise<ProjectSchema | undefined> {
  return editorProvider.getActiveSchema() || getSchemaFromTextEditor();
}

function buildImportSchemaFileName(sourceFileUri: vscode.Uri): string {
  const extension = path.extname(sourceFileUri.fsPath);
  const baseName = path.basename(sourceFileUri.fsPath, extension);
  return `${baseName}.orm.json`;
}

function writeParseDiagnostics(
  outputChannel: vscode.OutputChannel,
  sourceUri: vscode.Uri,
  parseResult: ParseResult,
): void {
  const summary = formatParseSummary(parseResult);
  outputChannel.clear();
  outputChannel.appendLine(`Import diagnostics for ${sourceUri.fsPath}`);
  outputChannel.appendLine(summary.detail);
  if (parseResult.issues.length > 0) {
    outputChannel.appendLine('');
    outputChannel.appendLine('Issue list:');
    parseResult.issues.forEach((issue, index) => {
      const location = issue.location
        ? ` @ ${issue.location.startLine}:${issue.location.startColumn}`
        : '';
      const scope = issue.entityName
        ? ` [${issue.entityName}${issue.memberName ? `.${issue.memberName}` : ''}]`
        : '';
      outputChannel.appendLine(
        `${index + 1}. ${issue.severity.toUpperCase()} ${issue.code}${scope}${location} - ${issue.message}`,
      );
    });
  }
}

// ─── Activity Bar TreeDataProvider ─────────────────────────────────

class ProjectTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue: string,
    public readonly command?: vscode.Command,
    public readonly iconPath?: vscode.ThemeIcon,
  ) {
    super(label, collapsibleState);
    this.contextValue = contextValue;
    if (iconPath) this.iconPath = iconPath;
  }
}

class ProjectViewProvider implements vscode.TreeDataProvider<ProjectTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ProjectTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ProjectTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ProjectTreeItem): Promise<ProjectTreeItem[]> {
    if (!element) {
      // Root items
      return [
        new ProjectTreeItem(
          '✨ New Diagram',
          vscode.TreeItemCollapsibleState.None,
          'action',
          { command: REFACTOR_COMMANDS.openEditor, title: 'New Diagram' },
          new vscode.ThemeIcon('add'),
        ),
        new ProjectTreeItem(
          DIAGRAMS_LABEL,
          vscode.TreeItemCollapsibleState.Expanded,
          'category',
          undefined,
          new vscode.ThemeIcon('file-code'),
        ),
        new ProjectTreeItem(
          ACTIONS_LABEL,
          vscode.TreeItemCollapsibleState.Expanded,
          'category',
          undefined,
          new vscode.ThemeIcon('tools'),
        ),
      ];
    }

    if (element.label === DIAGRAMS_LABEL) {
      // Find all .orm.json files in workspace
      const files = await vscode.workspace.findFiles('**/*.orm.json', '**/node_modules/**');
      return files.map((file) => {
        const name = getFileName(file);
        return new ProjectTreeItem(
          name,
          vscode.TreeItemCollapsibleState.None,
          'diagram',
          { command: 'vscode.openWith', title: 'Open Diagram', arguments: [file, REFACTOR_VIEW_TYPE] },
          new vscode.ThemeIcon('symbol-class'),
        );
      });
    }

    if (element.label === ACTIONS_LABEL) {
      return [
        new ProjectTreeItem(
          'Generate Code',
          vscode.TreeItemCollapsibleState.None,
          'action',
          { command: REFACTOR_COMMANDS.generateCode, title: 'Generate Code' },
          new vscode.ThemeIcon('play'),
        ),
        new ProjectTreeItem(
          'Generate DDL',
          vscode.TreeItemCollapsibleState.None,
          'action',
          { command: REFACTOR_COMMANDS.generateDDL, title: 'Generate DDL' },
          new vscode.ThemeIcon('database'),
        ),
        new ProjectTreeItem(
          'Generate Repository',
          vscode.TreeItemCollapsibleState.None,
          'action',
          { command: REFACTOR_COMMANDS.generateRepository, title: 'Generate Repository' },
          new vscode.ThemeIcon('repo'),
        ),
        new ProjectTreeItem(
          'Import Schema',
          vscode.TreeItemCollapsibleState.None,
          'action',
          { command: REFACTOR_COMMANDS.importSchema, title: 'Import Schema' },
          new vscode.ThemeIcon('cloud-download'),
        ),
        new ProjectTreeItem(
          'Export XMI',
          vscode.TreeItemCollapsibleState.None,
          'action',
          { command: REFACTOR_COMMANDS.exportXMI, title: 'Export XMI' },
          new vscode.ThemeIcon('cloud-upload'),
        ),
        new ProjectTreeItem(
          'Import XMI',
          vscode.TreeItemCollapsibleState.None,
          'action',
          { command: REFACTOR_COMMANDS.importXMI, title: 'Import XMI' },
          new vscode.ThemeIcon('cloud-download'),
        ),
      ];
    }

    return [];
  }
}

export function activate(context: vscode.ExtensionContext) {
  console.log('UML to ORM Generator extension is now active');
  const diagnosticsChannel = vscode.window.createOutputChannel('UML to ORM');
  context.subscriptions.push(diagnosticsChannel);

  // Register custom editor for .orm.json files
  const editorProvider = new DiagramEditorProvider(context);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      REFACTOR_VIEW_TYPE,
      editorProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    )
  );

  // File system watcher for .orm.json files
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.orm.json');
  context.subscriptions.push(watcher);

  // Register Activity Bar TreeDataProvider
  const projectViewProvider = new ProjectViewProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(REFACTOR_PROJECT_VIEW_ID, projectViewProvider)
  );

  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleProjectViewRefresh = () => {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      projectViewProvider.refresh();
    }, 300);
  };

  context.subscriptions.push(
    new vscode.Disposable(() => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = undefined;
      }
    })
  );

  // Refresh tree when .orm.json files change
  watcher.onDidCreate(scheduleProjectViewRefresh);
  watcher.onDidDelete(scheduleProjectViewRefresh);
  watcher.onDidChange(scheduleProjectViewRefresh);

  const runGenerationWorkflow = async (
    mode: 'code' | 'ddl' | 'repository',
    options: GenerationCommandOptions = {},
  ) => {
    const schema = options.schemaOverride
      ? normalizeProjectSchema(cloneSchema(options.schemaOverride))
      : await resolveSchemaForGeneration(editorProvider);
    if (!schema) {
      vscode.window.showErrorMessage('No diagram open. Please open a .orm.json file first.');
      return;
    }

    if (!schema.entities || schema.entities.length === 0) {
      vscode.window.showErrorMessage('No entities in diagram. Add entities before generating output.');
      return;
    }

    const generationSchema = options.useCurrentConfig
      ? cloneSchema(schema)
      : await promptGenerationTarget(schema);
    if (!generationSchema) {
      return;
    }

    try {
      const projectName = generationSchema.config.projectName || 'schema';
      const database = resolveDatabase(generationSchema.config);

      if (mode === 'code') {
        const generator = new CodeGeneratorService();
        const code = await generator.generate(generationSchema);
        const defaultFileName = buildGeneratedFileName(projectName, generationSchema.config.orm, database);
        const filterLabel = getOutputFilters(generationSchema.config.orm);
        const workspaceFolder = getPrimaryWorkspaceFolder();
        const defaultUri = workspaceFolder
          ? vscode.Uri.joinPath(workspaceFolder.uri, defaultFileName)
          : undefined;

        const saveUri = await vscode.window.showSaveDialog({
          defaultUri,
          filters: { ...filterLabel, 'All files': ['*'] },
          title: `${generationSchema.config.orm} (${database}) код хадгалах`,
        });
        if (!saveUri) {
          return;
        }

        await vscode.workspace.fs.writeFile(saveUri, Buffer.from(code));
        await openFileBeside(saveUri);
        vscode.window.showInformationMessage(
          `✅ ${generationSchema.config.orm} (${database}) код үүсгэгдлээ: ${getFileName(saveUri)}`,
        );
        return;
      }

      if (mode === 'repository') {
        const repositoryCode = await new RepositoryGeneratorService().generate(generationSchema);
        const defaultFileName = buildRepositoryFileName(projectName, generationSchema.config.orm, database);
        const workspaceFolder = getPrimaryWorkspaceFolder();
        const defaultUri = workspaceFolder
          ? vscode.Uri.joinPath(workspaceFolder.uri, defaultFileName)
          : undefined;

        const saveUri = await vscode.window.showSaveDialog({
          defaultUri,
          filters: { ...getRepositoryOutputFilters(generationSchema.config.orm), 'All files': ['*'] },
          title: `${generationSchema.config.orm} (${database}) repository хадгалах`,
        });
        if (!saveUri) {
          return;
        }

        await vscode.workspace.fs.writeFile(saveUri, Buffer.from(repositoryCode));
        await openFileBeside(saveUri);
        vscode.window.showInformationMessage(
          `✅ ${generationSchema.config.orm} (${database}) repository үүсгэгдлээ: ${getFileName(saveUri)}`,
        );
        return;
      }

      const ddl = new DdlGeneratorService().generate(generationSchema);
      const workspaceFolder = getPrimaryWorkspaceFolder();
      const defaultUri = workspaceFolder
        ? vscode.Uri.joinPath(workspaceFolder.uri, buildDdlFileName(projectName, database))
        : undefined;

      const saveUri = await vscode.window.showSaveDialog({
        defaultUri,
        filters: { SQL: ['sql'], 'All files': ['*'] },
        title: `${database} DDL хадгалах`,
      });
      if (!saveUri) {
        return;
      }

      await vscode.workspace.fs.writeFile(saveUri, Buffer.from(ddl));
      vscode.window.showInformationMessage(
        `✅ ${database} DDL үүсгэгдлээ: ${getFileName(saveUri)}`,
      );
      await openFileBeside(saveUri);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to generate ${mode === 'code' ? 'code' : 'DDL'}: ${error}`);
    }
  };

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand(REFACTOR_COMMANDS.openEditor, async () => {
      // Create a new diagram file
      const fileName = await vscode.window.showInputBox({
        prompt: 'Enter diagram file name (without extension)',
        validateInput: (value) => {
          if (!value || value.trim() === '') return 'Name cannot be empty';
          if (!/^[a-zA-Z0-9_-]+$/.test(value)) return 'Only alphanumeric characters, dash, and underscore allowed';
          return null;
        },
      });

      if (!fileName) return;

      const workspaceFolder = getPrimaryWorkspaceFolder();
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
      }

      const uri = vscode.Uri.joinPath(workspaceFolder.uri, `${fileName}.orm.json`);
      const defaultSchema = createEmptySchema(fileName);

      await vscode.workspace.fs.writeFile(
        uri,
        Buffer.from(JSON.stringify(defaultSchema, null, 2))
      );
      
      await vscode.commands.executeCommand('vscode.openWith', uri, REFACTOR_VIEW_TYPE);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(REFACTOR_COMMANDS.generateCode, async (options?: GenerationCommandOptions) => {
      await runGenerationWorkflow('code', options);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(REFACTOR_COMMANDS.generateDDL, async (options?: GenerationCommandOptions) => {
      await runGenerationWorkflow('ddl', options);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(REFACTOR_COMMANDS.generateRepository, async (options?: GenerationCommandOptions) => {
      await runGenerationWorkflow('repository', options);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(REFACTOR_COMMANDS.importSchema, async () => {
      const files = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: {
          'Schema files': ['prisma', 'ts', 'py', 'java'],
          'All files': ['*'],
        },
      });

      if (!files || files.length === 0) return;

      try {
        const parser = new SchemaParserService();
        const parseResult = await parser.parseFile(files[0]);
        const schema = parseResult.schema;
        const summary = formatParseSummary(parseResult);
        writeParseDiagnostics(diagnosticsChannel, files[0], parseResult);

        const workspaceFolder = getPrimaryWorkspaceFolder();
        const defaultImportUri = workspaceFolder
          ? vscode.Uri.joinPath(workspaceFolder.uri, buildImportSchemaFileName(files[0]))
          : undefined;
        const targetUri = await vscode.window.showSaveDialog({
          defaultUri: defaultImportUri,
          filters: { 'UML ORM Schema': ['json'], 'All files': ['*'] },
          title: 'Импортолсон схемийг хадгалах',
        });
        if (!targetUri) {
          return;
        }

        await vscode.workspace.fs.writeFile(
          targetUri,
          Buffer.from(JSON.stringify(schema, null, 2))
        );
        await vscode.commands.executeCommand('vscode.openWith', targetUri, REFACTOR_VIEW_TYPE);

        const importMessage = buildImportNotificationMessage(summary);
        if (summary.errorCount > 0 || summary.warningCount > 0) {
          const action = await vscode.window.showWarningMessage(
            `Импорт хийгдлээ. ${importMessage}`,
            'Оношилгоо харах',
          );
          if (action === 'Оношилгоо харах') {
            diagnosticsChannel.show(true);
          }
        } else {
          vscode.window.showInformationMessage(`Импорт амжилттай. ${importMessage}`);
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to import schema: ${error}`);
      }
    })
  );

  // ─── XMI Export Command ──────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand(REFACTOR_COMMANDS.exportXMI, async () => {
      const schema = editorProvider.getActiveSchema();
      if (!schema) {
        vscode.window.showErrorMessage('No diagram open. Please open a .orm.json file first.');
        return;
      }
      if (!schema.entities || schema.entities.length === 0) {
        vscode.window.showErrorMessage('No entities in diagram. Add entities before exporting.');
        return;
      }

      try {
        const { model, diagram } = projectSchemaToUMLModel(schema);
        const xmiContent = exportToXMI(model, diagram);

        const projectName = schema.config.projectName || 'diagram';
        const defaultFileName = `${projectName}_uml.xmi`;
        const workspaceFolder = getPrimaryWorkspaceFolder();
        const defaultUri = workspaceFolder
          ? vscode.Uri.joinPath(workspaceFolder.uri, defaultFileName)
          : undefined;

        const saveUri = await vscode.window.showSaveDialog({
          defaultUri,
          filters: { 'XMI files': ['xmi', 'xml'], 'All files': ['*'] },
          title: 'XMI файл хадгалах',
        });
        if (!saveUri) return;

        await vscode.workspace.fs.writeFile(saveUri, Buffer.from(xmiContent));
        await openFileBeside(saveUri);

        const savedName = getFileName(saveUri);
        vscode.window.showInformationMessage(`✅ XMI экспорт хийгдлээ: ${savedName}`);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to export XMI: ${error}`);
      }
    })
  );

  // ─── XMI Import Command ──────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand(REFACTOR_COMMANDS.importXMI, async () => {
      const files = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: {
          'XMI files': ['xmi', 'xml'],
          'All files': ['*'],
        },
      });

      if (!files || files.length === 0) return;

      try {
        const fileData = await vscode.workspace.fs.readFile(files[0]);
        const xmiContent = new TextDecoder().decode(fileData);
        const schema = importFromXMI(xmiContent);

        const workspaceFolder = getPrimaryWorkspaceFolder();
        if (workspaceFolder) {
          const newUri = vscode.Uri.joinPath(
            workspaceFolder.uri,
            `imported-xmi-${Date.now()}.orm.json`
          );
          await vscode.workspace.fs.writeFile(
            newUri,
            Buffer.from(JSON.stringify(schema, null, 2))
          );
          await vscode.commands.executeCommand('vscode.openWith', newUri, REFACTOR_VIEW_TYPE);
          vscode.window.showInformationMessage('✅ XMI imported successfully!');
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to import XMI: ${error}`);
      }
    })
  );
}

export function deactivate() {
  console.log('UML to ORM Generator extension is now deactivated');
}

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

const EXTENSION_ID = 'munkhorgil.uml-orm-refactor';
const INTEGRATION_ROOT =
  process.env.UML_ORM_INTEGRATION_ROOT ||
  fs.mkdtempSync(path.join(os.tmpdir(), 'uml-orm-refactor-vscode-fallback-'));

function integrationPath(...segments: string[]): string {
  return path.join(INTEGRATION_ROOT, ...segments);
}

async function waitForFile(uri: vscode.Uri, timeoutMs = 5000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      await vscode.workspace.fs.stat(uri);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Timed out waiting for file: ${uri.fsPath}`);
}

function stubWindowMethod<T extends keyof typeof vscode.window>(
  name: T,
  replacement: (typeof vscode.window)[T],
): () => void {
  const original = (vscode.window as any)[name];
  (vscode.window as any)[name] = replacement;
  return () => {
    (vscode.window as any)[name] = original;
  };
}

async function activateExtension(): Promise<void> {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(extension, `Extension ${EXTENSION_ID} should be available in the test host`);
  await extension?.activate();
}

suite('VS Code Command Flow', () => {
  suiteSetup(async () => {
    await activateExtension();
  });

  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  test('openEditor handles the current workspace state correctly', async () => {
    let errorMessage = '';
    const restoreInputBox = stubWindowMethod('showInputBox', (async () => 'integration_created') as any);
    const restoreError = stubWindowMethod('showErrorMessage', (async (message: string) => {
      errorMessage = message;
      return undefined;
    }) as any);
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const createdUri = workspaceFolder
      ? vscode.Uri.joinPath(workspaceFolder.uri, 'integration_created.orm.json')
      : undefined;

    if (createdUri) {
      try {
        await vscode.workspace.fs.delete(createdUri);
      } catch {
        // ignore
      }
    }

    try {
      await vscode.commands.executeCommand('uml-orm-refactor.openEditor');

      if (createdUri) {
        await waitForFile(createdUri);
        const fileContent = JSON.parse(fs.readFileSync(createdUri.fsPath, 'utf8'));
        assert.strictEqual(fileContent.config.projectName, 'integration_created');
      } else {
        assert.strictEqual(errorMessage, 'No workspace folder open');
      }
    } finally {
      restoreInputBox();
      restoreError();
    }
  });

  test('generateCode writes an ORM file using command prompts', async () => {
    const schemaUri = vscode.Uri.file(integrationPath('integration-sample.orm.json'));
    const outputUri = vscode.Uri.file(integrationPath('generated_prisma.prisma'));
    const pickQueue = ['TypeScript', 'Prisma', 'PostgreSQL'];

    try {
      await vscode.workspace.fs.delete(outputUri);
    } catch {
      // ignore
    }

    const restoreQuickPick = stubWindowMethod('showQuickPick', (async () => {
      const next = pickQueue.shift();
      return next ? ({ label: next } as any) : undefined;
    }) as any);
    const restoreSaveDialog = stubWindowMethod('showSaveDialog', (async () => outputUri) as any);
    const restoreInfo = stubWindowMethod('showInformationMessage', (async () => undefined) as any);

    try {
      const doc = await vscode.workspace.openTextDocument(schemaUri);
      await vscode.window.showTextDocument(doc, { preview: false });
      await vscode.commands.executeCommand('uml-orm-refactor.generateCode');

      await waitForFile(outputUri);
      const generated = fs.readFileSync(outputUri.fsPath, 'utf8');
      assert.ok(generated.includes('provider = "postgresql"'));
      assert.ok(generated.includes('model User'));
    } finally {
      restoreQuickPick();
      restoreSaveDialog();
      restoreInfo();
    }
  });

  test('generateDDL writes a SQL file using command prompts', async () => {
    const schemaUri = vscode.Uri.file(integrationPath('integration-sample.orm.json'));
    const outputUri = vscode.Uri.file(integrationPath('generated_postgresql.sql'));
    const pickQueue = ['TypeScript', 'Prisma', 'PostgreSQL'];

    try {
      await vscode.workspace.fs.delete(outputUri);
    } catch {
      // ignore
    }

    const restoreQuickPick = stubWindowMethod('showQuickPick', (async () => {
      const next = pickQueue.shift();
      return next ? ({ label: next } as any) : undefined;
    }) as any);
    const restoreSaveDialog = stubWindowMethod('showSaveDialog', (async () => outputUri) as any);
    const restoreInfo = stubWindowMethod('showInformationMessage', (async () => undefined) as any);

    try {
      const doc = await vscode.workspace.openTextDocument(schemaUri);
      await vscode.window.showTextDocument(doc, { preview: false });
      await vscode.commands.executeCommand('uml-orm-refactor.generateDDL');

      await waitForFile(outputUri);
      const ddl = fs.readFileSync(outputUri.fsPath, 'utf8');
      assert.ok(ddl.includes('CREATE TABLE user'));
      assert.ok(ddl.includes('JSONB'));
      assert.ok(ddl.includes('FOREIGN KEY (authorId) REFERENCES user(id)'));
    } finally {
      restoreQuickPick();
      restoreSaveDialog();
      restoreInfo();
    }
  });

  test('generateRepository writes a repository file using command prompts', async () => {
    const schemaUri = vscode.Uri.file(integrationPath('integration-sample.orm.json'));
    const outputUri = vscode.Uri.file(integrationPath('generated_repository.ts'));
    const pickQueue = ['TypeScript', 'Prisma', 'PostgreSQL'];

    try {
      await vscode.workspace.fs.delete(outputUri);
    } catch {
      // ignore
    }

    const restoreQuickPick = stubWindowMethod('showQuickPick', (async () => {
      const next = pickQueue.shift();
      return next ? ({ label: next } as any) : undefined;
    }) as any);
    const restoreSaveDialog = stubWindowMethod('showSaveDialog', (async () => outputUri) as any);
    const restoreInfo = stubWindowMethod('showInformationMessage', (async () => undefined) as any);

    try {
      const doc = await vscode.workspace.openTextDocument(schemaUri);
      await vscode.window.showTextDocument(doc, { preview: false });
      await vscode.commands.executeCommand('uml-orm-refactor.generateRepository');

      await waitForFile(outputUri);
      const repositoryCode = fs.readFileSync(outputUri.fsPath, 'utf8');
      assert.ok(repositoryCode.includes(`import { Prisma, PrismaClient } from '@prisma/client';`));
      assert.ok(repositoryCode.includes('class UserRepository'));
      assert.ok(repositoryCode.includes('async findById(id: number)'));
    } finally {
      restoreQuickPick();
      restoreSaveDialog();
      restoreInfo();
    }
  });

  test('importSchema saves an imported diagram and reports diagnostics summary', async () => {
    const sourceUri = vscode.Uri.file(integrationPath('partial.prisma'));
    const targetUri = vscode.Uri.file(integrationPath('imported_partial.orm.json'));
    const partialPrisma = `
datasource db {
  provider = "postgresql"
  url = env("DATABASE_URL")
}

model User {
  id String @id
  broken ???
}
`;

    fs.writeFileSync(sourceUri.fsPath, partialPrisma, 'utf8');
    try {
      await vscode.workspace.fs.delete(targetUri);
    } catch {
      // ignore
    }

    let warningMessage = '';
    const restoreOpenDialog = stubWindowMethod('showOpenDialog', (async () => [sourceUri]) as any);
    const restoreSaveDialog = stubWindowMethod('showSaveDialog', (async () => targetUri) as any);
    const restoreWarning = stubWindowMethod('showWarningMessage', (async (message: string) => {
      warningMessage = message;
      return undefined;
    }) as any);

    try {
      await vscode.commands.executeCommand('uml-orm-refactor.importSchema');

      await waitForFile(targetUri);
      const imported = JSON.parse(fs.readFileSync(targetUri.fsPath, 'utf8'));
      assert.ok(imported.entities.some((entity: { name: string }) => entity.name === 'User'));
      assert.ok(warningMessage.includes('confidence'));
      assert.ok(warningMessage.includes('Prisma (PostgreSQL)'));
    } finally {
      restoreOpenDialog();
      restoreSaveDialog();
      restoreWarning();
    }
  });
});

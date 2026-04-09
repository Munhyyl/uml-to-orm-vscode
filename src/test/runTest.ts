import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runTests } from 'vscode-test';

const TEST_VSCODE_VERSION = '1.114.0';

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');
    const fixtureWorkspace = path.resolve(extensionDevelopmentPath, 'src/test/fixtures/workspace-template');
    const integrationWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'uml-orm-refactor-vscode-tests-'));
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uml-orm-refactor-vscode-user-'));
    const userSettingsDir = path.join(userDataDir, 'User');

    fs.cpSync(fixtureWorkspace, integrationWorkspace, { recursive: true });
    fs.mkdirSync(userSettingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(userSettingsDir, 'settings.json'),
      JSON.stringify(
        {
          'security.workspace.trust.enabled': false,
          'update.mode': 'none',
          'extensions.autoCheckUpdates': false,
          'extensions.autoUpdate': false,
        },
        null,
        2,
      ),
    );

    const electronRunAsNode = process.env.ELECTRON_RUN_AS_NODE;
    delete process.env.ELECTRON_RUN_AS_NODE;
    try {
      await runTests({
        extensionDevelopmentPath,
        extensionTestsPath,
        extensionTestsEnv: {
          UML_ORM_INTEGRATION_ROOT: integrationWorkspace,
        },
        launchArgs: [integrationWorkspace, '--disable-extensions', '--user-data-dir', userDataDir],
        platform: 'linux-x64',
        version: TEST_VSCODE_VERSION,
      });
    } finally {
      if (electronRunAsNode !== undefined) {
        process.env.ELECTRON_RUN_AS_NODE = electronRunAsNode;
      }
    }
  } catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  }
}

main();

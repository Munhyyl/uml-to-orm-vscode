import * as path from 'path';
import Mocha from 'mocha';
// `glob` is available transitively with CommonJS exports in this workspace.
// Use `require` here to stay compatible with both runtime and its older typings.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const glob = require('glob') as { sync(pattern: string, options: { cwd: string }): string[] };

export async function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 10000,
  });

  const testsRoot = path.resolve(__dirname, '..');

  const files = glob.sync('**/*.vscode.test.js', { cwd: testsRoot });

  files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

  return new Promise<void>((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} tests failed.`));
      } else {
        resolve();
      }
    });
  });
}

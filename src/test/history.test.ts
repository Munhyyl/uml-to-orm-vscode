import * as assert from 'assert';
import { createHistory, pushHistory, canUndo, canRedo } from '../application/state/history';
import { ProjectSchema } from '../types/schema';

function makeSchema(name: string): ProjectSchema {
  return {
    version: '1.0',
    entities: [
      {
        id: `entity_${name}`,
        name,
        attributes: [
          {
            id: `attr_${name}`,
            name: 'id',
            type: 'String',
            visibility: 'private',
            isPrimary: true,
            isNullable: false,
            isUnique: true,
          },
        ],
        position: { x: 0, y: 0 },
      },
    ],
    relations: [],
    config: {
      targetLanguage: 'TypeScript',
      orm: 'Prisma',
    },
  };
}

suite('History Utilities', () => {
  test('keeps the latest index after overflow', () => {
    let history = createHistory(makeSchema('a'), 2);
    history = pushHistory(history, makeSchema('b'));
    history = pushHistory(history, makeSchema('c'));

    assert.strictEqual(history.stack.length, 2);
    assert.strictEqual(history.index, 1);
    assert.strictEqual(history.stack[0].entities[0].name, 'b');
    assert.strictEqual(history.stack[1].entities[0].name, 'c');
  });

  test('reports undo/redo availability correctly', () => {
    let history = createHistory(makeSchema('a'));

    assert.strictEqual(canUndo(history), false);
    assert.strictEqual(canRedo(history), false);

    history = pushHistory(history, makeSchema('b'));

    assert.strictEqual(canUndo(history), true);
    assert.strictEqual(canRedo(history), false);

    history = { ...history, index: 0 };
    assert.strictEqual(canUndo(history), false);
    assert.strictEqual(canRedo(history), true);
  });
});

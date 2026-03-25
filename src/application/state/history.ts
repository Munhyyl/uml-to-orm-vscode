import { ProjectSchema } from '../../types/schema';

export interface HistoryState {
  stack: ProjectSchema[];
  index: number;
  maxItems: number;
}

export function createHistory(initial: ProjectSchema, maxItems = 50): HistoryState {
  return {
    stack: [JSON.parse(JSON.stringify(initial))],
    index: 0,
    maxItems,
  };
}

export function pushHistory(history: HistoryState, schema: ProjectSchema): HistoryState {
  const next = history.stack.slice(0, history.index + 1);
  next.push(JSON.parse(JSON.stringify(schema)));

  if (next.length > history.maxItems) {
    next.shift();
    return { ...history, stack: next, index: next.length - 1 };
  }

  return { ...history, stack: next, index: next.length - 1 };
}

export function canUndo(history: HistoryState): boolean {
  return history.index > 0;
}

export function canRedo(history: HistoryState): boolean {
  return history.index < history.stack.length - 1;
}

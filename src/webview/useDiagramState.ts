import { useReducer, useCallback, useRef } from 'react';
import { ProjectSchema, ClassEntity, Relation, OrmType, TargetLanguage } from '../types/schema';

// ─── State & Action Types ──────────────────────────────────────

export interface DiagramState {
  schema: ProjectSchema;
  selectedEntityId: string | null;
  selectedRelationId: string | null;
}

export type DiagramAction =
  | { type: 'SET_SCHEMA'; payload: ProjectSchema }
  | { type: 'SELECT_ENTITY'; payload: string | null }
  | { type: 'SELECT_RELATION'; payload: string | null }
  | { type: 'DESELECT_ALL' }
  | { type: 'UPDATE_SCHEMA_CONFIG'; payload: { orm?: OrmType; targetLanguage?: TargetLanguage } }
  | { type: 'CLEAR_SELECTION_BY_DELETION'; payload: { entityIds?: string[]; relationIds?: string[] } };

// ─── Reducer Function ─────────────────────────────────────────

export function diagramReducer(state: DiagramState, action: DiagramAction): DiagramState {
  switch (action.type) {
    case 'SET_SCHEMA':
      return {
        ...state,
        schema: action.payload,
      };

    case 'SELECT_ENTITY':
      return {
        ...state,
        selectedEntityId: action.payload,
        selectedRelationId: null,
      };

    case 'SELECT_RELATION':
      return {
        ...state,
        selectedRelationId: action.payload,
        selectedEntityId: null,
      };

    case 'DESELECT_ALL':
      return {
        ...state,
        selectedEntityId: null,
        selectedRelationId: null,
      };

    case 'UPDATE_SCHEMA_CONFIG':
      return {
        ...state,
        schema: {
          ...state.schema,
          config: {
            ...state.schema.config,
            orm: action.payload.orm || state.schema.config.orm,
            targetLanguage: action.payload.targetLanguage || state.schema.config.targetLanguage,
          },
        },
      };

    case 'CLEAR_SELECTION_BY_DELETION': {
      const { entityIds = [], relationIds = [] } = action.payload;
      const entityIdSet = new Set(entityIds);
      const relationIdSet = new Set(relationIds);
      return {
        ...state,
        selectedEntityId:
          state.selectedEntityId && entityIdSet.has(state.selectedEntityId) ? null : state.selectedEntityId,
        selectedRelationId:
          state.selectedRelationId && relationIdSet.has(state.selectedRelationId) ? null : state.selectedRelationId,
      };
    }

    default:
      return state;
  }
}

// ─── Custom Hook: useSchemaReducer ────────────────────────────

export interface HistoryState {
  stack: ProjectSchema[];
  index: number;
}

export function useDiagramState(initialSchema: ProjectSchema) {
  const [state, dispatch] = useReducer(diagramReducer, {
    schema: initialSchema,
    selectedEntityId: null,
    selectedRelationId: null,
  });

  const historyRef = useRef<HistoryState>({
    stack: [JSON.parse(JSON.stringify(initialSchema))],
    index: 0,
  });

  const MAX_HISTORY = 50;

  const pushHistory = useCallback((schema: ProjectSchema) => {
    const { stack, index } = historyRef.current;
    // Remove any future history if we're not at the end
    historyRef.current.stack = stack.slice(0, index + 1);
    historyRef.current.stack.push(JSON.parse(JSON.stringify(schema)));
    if (historyRef.current.stack.length > MAX_HISTORY) {
      historyRef.current.stack.shift();
    } else {
      historyRef.current.index = historyRef.current.stack.length - 1;
    }
  }, []);

  const undo = useCallback(() => {
    if (historyRef.current.index <= 0) return;
    historyRef.current.index -= 1;
    const schema = JSON.parse(JSON.stringify(historyRef.current.stack[historyRef.current.index]));
    dispatch({ type: 'SET_SCHEMA', payload: schema });
    dispatch({ type: 'DESELECT_ALL' });
  }, []);

  const redo = useCallback(() => {
    if (historyRef.current.index >= historyRef.current.stack.length - 1) return;
    historyRef.current.index += 1;
    const schema = JSON.parse(JSON.stringify(historyRef.current.stack[historyRef.current.index]));
    dispatch({ type: 'SET_SCHEMA', payload: schema });
    dispatch({ type: 'DESELECT_ALL' });
  }, []);

  const canUndo = historyRef.current.index > 0;
  const canRedo = historyRef.current.index < historyRef.current.stack.length - 1;

  return {
    state,
    dispatch,
    pushHistory,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}

// ─── Custom Hook: useClipboard ────────────────────────────────

export function useClipboard() {
  const clipboardRef = useRef<ClassEntity | null>(null);

  const copy = useCallback((entity: ClassEntity) => {
    clipboardRef.current = JSON.parse(JSON.stringify(entity));
  }, []);

  const paste = useCallback((): ClassEntity | null => {
    return clipboardRef.current ? JSON.parse(JSON.stringify(clipboardRef.current)) : null;
  }, []);

  const hasCopied = clipboardRef.current !== null;

  return { copy, paste, hasCopied };
}

// ─── Custom Hook: useVscodeMessaging ──────────────────────────

export function useVscodeMessaging() {
  const getVscodeApi = useCallback(() => {
    return (window as any).__vscodeApi as { postMessage?: (message: any) => void } | undefined;
  }, []);

  const postMessage = useCallback((command: string, payload?: any) => {
    const vscode = getVscodeApi();
    vscode?.postMessage?.({ command, ...payload });
  }, [getVscodeApi]);

  return { postMessage, getVscodeApi };
}

// ─── Custom Hook: useConfirmation ─────────────────────────────

export function useConfirmation() {
  const confirmationResolversRef = useRef<Map<string, (confirmed: boolean) => void>>(new Map());

  const requestConfirmation = useCallback(
    (message: string, detail?: string, confirmLabel = 'Delete'): Promise<boolean> => {
      const vscode = (window as any).__vscodeApi as { postMessage?: (message: any) => void } | undefined;

      if (!vscode?.postMessage) {
        return Promise.resolve(false);
      }

      const requestId = `confirm_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      return new Promise<boolean>((resolve) => {
        confirmationResolversRef.current.set(requestId, resolve);
        vscode?.postMessage?.({
          command: 'requestConfirmation',
          requestId,
          message,
          detail,
          confirmLabel,
        });
      });
    },
    []
  );

  const handleConfirmationResult = useCallback((requestId: string, confirmed: boolean) => {
    const resolve = confirmationResolversRef.current.get(requestId);
    if (resolve) {
      resolve(confirmed);
      confirmationResolversRef.current.delete(requestId);
    }
  }, []);

  const cleanup = useCallback(() => {
    confirmationResolversRef.current.forEach((resolve) => resolve(false));
    confirmationResolversRef.current.clear();
  }, []);

  return { requestConfirmation, handleConfirmationResult, cleanup };
}

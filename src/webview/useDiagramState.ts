import { useReducer, useCallback, useRef, useState } from 'react';
import { ProjectSchema, ClassEntity, OrmType, TargetLanguage } from '../types/schema';
import {
  createHistory,
  pushHistory as pushHistoryState,
  canUndo as canUndoHistory,
  canRedo as canRedoHistory,
  HistoryState,
} from '../application/state/history';

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

export function useDiagramState(initialSchema: ProjectSchema) {
  const [state, dispatch] = useReducer(diagramReducer, {
    schema: initialSchema,
    selectedEntityId: null,
    selectedRelationId: null,
  });
  const [, setHistoryVersion] = useState(0);

  const historyRef = useRef<HistoryState>(createHistory(initialSchema));

  const pushHistory = useCallback((schema: ProjectSchema) => {
    historyRef.current = pushHistoryState(historyRef.current, schema);
    setHistoryVersion((version) => version + 1);
  }, []);

  const undo = useCallback(() => {
    if (!canUndoHistory(historyRef.current)) return;
    historyRef.current.index -= 1;
    const schema = JSON.parse(JSON.stringify(historyRef.current.stack[historyRef.current.index]));
    dispatch({ type: 'SET_SCHEMA', payload: schema });
    dispatch({ type: 'DESELECT_ALL' });
    setHistoryVersion((version) => version + 1);
  }, []);

  const redo = useCallback(() => {
    if (!canRedoHistory(historyRef.current)) return;
    historyRef.current.index += 1;
    const schema = JSON.parse(JSON.stringify(historyRef.current.stack[historyRef.current.index]));
    dispatch({ type: 'SET_SCHEMA', payload: schema });
    dispatch({ type: 'DESELECT_ALL' });
    setHistoryVersion((version) => version + 1);
  }, []);

  const canUndo = canUndoHistory(historyRef.current);
  const canRedo = canRedoHistory(historyRef.current);

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

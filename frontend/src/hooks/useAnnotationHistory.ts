/**
 * useAnnotationHistory - 标注历史管理 Hook
 * 支持撤销/重做功能
 */
import { useState, useCallback, useRef } from 'react';

interface HistoryState<T> {
  past: T[];
  present: T | null;
  future: T[];
}

interface UseAnnotationHistoryReturn<T> {
  state: T | null;
  canUndo: boolean;
  canRedo: boolean;
  set: (newState: T) => void;
  undo: () => void;
  redo: () => void;
  reset: (initialState?: T) => void;
  history: HistoryState<T>;
}

export function useAnnotationHistory<T>(
  initialState?: T,
  maxHistoryLength: number = 50
): UseAnnotationHistoryReturn<T> {
  const [history, setHistory] = useState<HistoryState<T>>({
    past: [],
    present: initialState ?? null,
    future: [],
  });

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const set = useCallback((newState: T) => {
    setHistory((prev) => {
      const newPast = prev.present !== null 
        ? [...prev.past, prev.present]
        : prev.past;
      
      // 限制历史长度
      const trimmedPast = newPast.length > maxHistoryLength
        ? newPast.slice(-maxHistoryLength)
        : newPast;

      return {
        past: trimmedPast,
        present: newState,
        future: [], // 清除重做历史
      };
    });
  }, [maxHistoryLength]);

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.past.length === 0) return prev;

      const newPast = prev.past.slice(0, -1);
      const previousState = prev.past[prev.past.length - 1];
      const newFuture = prev.present !== null
        ? [prev.present, ...prev.future]
        : prev.future;

      return {
        past: newPast,
        present: previousState,
        future: newFuture,
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((prev) => {
      if (prev.future.length === 0) return prev;

      const [nextState, ...restFuture] = prev.future;
      const newPast = prev.present !== null
        ? [...prev.past, prev.present]
        : prev.past;

      return {
        past: newPast,
        present: nextState,
        future: restFuture,
      };
    });
  }, []);

  const reset = useCallback((initialState?: T) => {
    setHistory({
      past: [],
      present: initialState ?? null,
      future: [],
    });
  }, []);

  return {
    state: history.present,
    canUndo,
    canRedo,
    set,
    undo,
    redo,
    reset,
    history,
  };
}

export default useAnnotationHistory;

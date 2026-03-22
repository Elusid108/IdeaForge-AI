import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";

interface UndoEntry {
  label: string;
  undoFn: () => Promise<void>;
  redoFn: () => Promise<void>;
}

export function useActionUndo() {
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [redoStack, setRedoStack] = useState<UndoEntry[]>([]);
  const isProcessing = useRef(false);

  const pushAction = useCallback((label: string, undoFn: () => Promise<void>, redoFn: () => Promise<void>) => {
    setUndoStack(prev => [...prev.slice(-19), { label, undoFn, redoFn }]);
    setRedoStack([]);
  }, []);

  const undo = useCallback(async () => {
    if (isProcessing.current) return;
    setUndoStack(prev => {
      const entry = prev[prev.length - 1];
      if (!entry) return prev;
      isProcessing.current = true;
      entry.undoFn().then(() => {
        toast.info(`Undone: ${entry.label}`);
        setRedoStack(r => [...r, entry]);
      }).catch(() => {
        toast.error("Undo failed");
      }).finally(() => { isProcessing.current = false; });
      return prev.slice(0, -1);
    });
  }, []);

  const redo = useCallback(async () => {
    if (isProcessing.current) return;
    setRedoStack(prev => {
      const entry = prev[prev.length - 1];
      if (!entry) return prev;
      isProcessing.current = true;
      entry.redoFn().then(() => {
        toast.info(`Redone: ${entry.label}`);
        setUndoStack(u => [...u, entry]);
      }).catch(() => {
        toast.error("Redo failed");
      }).finally(() => { isProcessing.current = false; });
      return prev.slice(0, -1);
    });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;

      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  return { pushAction, undo, redo, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 };
}

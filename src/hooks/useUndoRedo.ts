import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/localDb";
import { toast } from "sonner";

export interface HistoryEntry {
  id: string;
  brainstorm_id: string;
  user_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  metadata: any;
  position: number;
  created_at: string;
}

interface UseUndoRedoOptions {
  brainstormId: string | undefined;
  userId: string | undefined;
  onRevert: (fieldName: string, value: string | null, metadata: any) => void;
  onReapply: (fieldName: string, value: string | null, metadata: any) => void;
  enabled?: boolean;
}

export function useUndoRedo({ brainstormId, userId, onRevert, onReapply, enabled = true }: UseUndoRedoOptions) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [pointer, setPointer] = useState(-1); // points to the current position in history
  const isProcessing = useRef(false);

  // Load history on mount
  useEffect(() => {
    if (!brainstormId || !userId || !enabled) return;
    (async () => {
      const { data, error } = await supabase
        .from("brainstorm_history")
        .select("*")
        .eq("brainstorm_id", brainstormId)
        .order("position", { ascending: true })
        .limit(100);
      if (!error && data) {
        setHistory(data as HistoryEntry[]);
        setPointer(data.length - 1);
      }
    })();
  }, [brainstormId, userId, enabled]);

  const pushEntry = useCallback(async (fieldName: string, oldValue: string | null, newValue: string | null, metadata?: any) => {
    if (!brainstormId || !userId) return;

    // Remove any entries after the current pointer (branching)
    const newPosition = pointer + 1;
    const entriesToRemove = history.filter(e => e.position >= newPosition);
    if (entriesToRemove.length > 0) {
      await supabase
        .from("brainstorm_history")
        .delete()
        .eq("brainstorm_id", brainstormId)
        .gte("position", newPosition);
    }

    const { data, error } = await supabase
      .from("brainstorm_history")
      .insert({
        brainstorm_id: brainstormId,
        user_id: userId,
        field_name: fieldName,
        old_value: oldValue,
        new_value: newValue,
        metadata: metadata || null,
        position: newPosition,
      })
      .select()
      .single();

    if (!error && data) {
      const trimmedHistory = history.filter(e => e.position < newPosition);
      const newHistory = [...trimmedHistory, data as HistoryEntry];
      setHistory(newHistory);
      setPointer(newHistory.length - 1);
    }
  }, [brainstormId, userId, history, pointer]);

  const undo = useCallback(async () => {
    if (pointer < 0 || isProcessing.current) return;
    isProcessing.current = true;
    const entry = history[pointer];
    if (entry) {
      onRevert(entry.field_name, entry.old_value, entry.metadata);
      setPointer(p => p - 1);
    }
    isProcessing.current = false;
  }, [pointer, history, onRevert]);

  const redo = useCallback(async () => {
    if (pointer >= history.length - 1 || isProcessing.current) return;
    isProcessing.current = true;
    const entry = history[pointer + 1];
    if (entry) {
      onReapply(entry.field_name, entry.new_value, entry.metadata);
      setPointer(p => p + 1);
    }
    isProcessing.current = false;
  }, [pointer, history, onReapply]);

  // Keyboard listener
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
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
  }, [undo, redo, enabled]);

  return { pushEntry, undo, redo, canUndo: pointer >= 0, canRedo: pointer < history.length - 1 };
}

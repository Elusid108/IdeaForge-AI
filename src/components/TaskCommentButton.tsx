import { useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/localDb";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

interface TaskCommentButtonProps {
  taskId: string;
  taskType: "project" | "campaign";
}

export default function TaskCommentButton({ taskId, taskType }: TaskCommentButtonProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState("");
  const [open, setOpen] = useState(false);

  const { data: comments = [] } = useQuery({
    queryKey: ["task-comments", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_comments" as any)
        .select("*")
        .eq("task_id", taskId)
        .eq("task_type", taskType)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
    enabled: open,
  });

  // Separate count query that's always active
  const { data: commentCount = 0 } = useQuery({
    queryKey: ["task-comment-count", taskId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("task_comments" as any)
        .select("*", { count: "exact", head: true })
        .eq("task_id", taskId)
        .eq("task_type", taskType);
      if (error) throw error;
      return count || 0;
    },
  });

  const addComment = useMutation({
    mutationFn: async (content: string) => {
      const { error } = await supabase.from("task_comments" as any).insert({
        task_id: taskId,
        task_type: taskType,
        user_id: user!.id,
        content,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-comments", taskId] });
      queryClient.invalidateQueries({ queryKey: ["task-comment-count", taskId] });
      setNewComment("");
    },
  });

  const handleSubmit = () => {
    if (!newComment.trim()) return;
    addComment.mutate(newComment.trim());
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-primary relative"
          onClick={(e) => e.stopPropagation()}
        >
          <MessageSquare className="h-3 w-3" />
          {commentCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[8px] font-bold rounded-full h-3.5 min-w-[14px] flex items-center justify-center px-0.5">
              {commentCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Comments</p>
        <div className="max-h-48 overflow-y-auto space-y-2 mb-2">
          {comments.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">No comments yet</p>
          ) : (
            comments.map((c: any) => (
              <div key={c.id} className="text-xs space-y-0.5 border-b border-border/30 pb-1.5 last:border-0">
                <p className="text-foreground whitespace-pre-wrap">{c.content}</p>
                <p className="text-[10px] text-muted-foreground/60">
                  {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                </p>
              </div>
            ))
          )}
        </div>
        <div className="flex gap-1">
          <Textarea
            placeholder="Add a comment…"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            className="min-h-[60px] text-xs resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && newComment.trim()) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <Button
            size="icon"
            className="h-8 w-8 shrink-0 self-end"
            disabled={!newComment.trim() || addComment.isPending}
            onClick={handleSubmit}
          >
            <Send className="h-3 w-3" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

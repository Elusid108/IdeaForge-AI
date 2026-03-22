import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/localDb";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

interface TaskCommentsSectionProps {
  taskId: string;
  taskType: "project" | "campaign";
}

export default function TaskCommentsSection({ taskId, taskType }: TaskCommentsSectionProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: comments = [] } = useQuery({
    queryKey: ["task-comments-section", taskId],
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
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [comments]);

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
      queryClient.invalidateQueries({ queryKey: ["task-comments-section", taskId] });
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
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Comments</p>
      <div ref={scrollRef} className="max-h-[200px] overflow-y-auto space-y-2 border rounded-md p-2 bg-muted/30">
        {comments.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">No comments yet</p>
        ) : (
          comments.map((c: any) => (
            <div key={c.id} className="text-xs border-b border-border/30 pb-1.5 last:border-0">
              <p className="whitespace-pre-wrap">{c.content}</p>
              <p className="text-[10px] text-muted-foreground/60">
                {format(new Date(c.created_at), "MMM d, yyyy 'at' h:mm a")}
              </p>
            </div>
          ))
        )}
      </div>
      <div className="flex gap-1 mt-2">
        <Input
          placeholder="Add a comment…"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          className="text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter" && newComment.trim()) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <Button
          size="icon"
          className="h-8 w-8 shrink-0"
          disabled={!newComment.trim() || addComment.isPending}
          onClick={handleSubmit}
        >
          <Send className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

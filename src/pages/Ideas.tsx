import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Lightbulb, Grid3X3, List, LayoutGrid, Mic, MicOff, Loader2, Brain, ChevronDown, ChevronRight, ChevronLeft, Ban, Wrench, X, Megaphone, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { getRows, insertRow, updateRow } from "@/lib/google-sheets-db";
import { openGeminiSettings, processIdeaClient } from "@/services/ai-service";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

const CATEGORY_COLORS: Record<string, string> = {
  "Product": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "Process": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "Fixture/Jig": "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "Tool": "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "Art": "bg-pink-500/20 text-pink-400 border-pink-500/30",
  "Hardware/Electronics": "bg-red-500/20 text-red-400 border-red-500/30",
  "Software/App": "bg-violet-500/20 text-violet-400 border-violet-500/30",
  "Environment/Space": "bg-teal-500/20 text-teal-400 border-teal-500/30",
};

function IdeaCard({ idea, onClick }: { idea: any; onClick: () => void }) {
  const isProcessing = idea.status === "processing";
  const isProcessed = idea.status === "processed" || idea.status === "brainstorming" || idea.status === "scrapped";
  const isScrapped = idea.status === "scrapped";
  const categoryClass = CATEGORY_COLORS[idea.category] || "bg-secondary text-secondary-foreground";

  return (
    <Card
      onClick={onClick}
      className={`cursor-pointer border-border/50 bg-card/50 transition-all hover:border-primary/30 hover:bg-card/80 ${
        isProcessing ? "animate-processing-glow border-primary/40" : ""
      }`}
    >
      <CardHeader className="px-4 pt-3 pb-1">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-yellow-400 shrink-0" />
          {isScrapped ? (
            <Badge className="text-xs border bg-zinc-500/20 text-zinc-400 border-zinc-500/30">
              <Ban className="h-3 w-3 mr-1" /> Scrapped
            </Badge>
          ) : isProcessed && idea.category ? (
            <Badge className={`text-xs border ${categoryClass}`}>{idea.category}</Badge>
          ) : isProcessing ? (
            <div className="flex items-center gap-1.5 text-xs text-primary">
              <Loader2 className="h-3 w-3 animate-spin" />
              Processing…
            </div>
          ) : (
            <Badge variant="secondary" className="text-xs">{idea.category || "New"}</Badge>
          )}
          {idea.status === "brainstorming" && (
            <Badge variant="outline" className="text-xs text-primary border-primary/30">
              <Brain className="h-3 w-3 mr-1" /> Brainstorming
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-0 space-y-1">
        {isProcessed && idea.title ? (
          <p className="text-sm font-bold leading-snug">{idea.title}</p>
        ) : null}
        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
          {isProcessed && idea.processed_summary
            ? idea.processed_summary
            : idea.raw_dump.slice(0, 140) + (idea.raw_dump.length > 140 ? "…" : "")}
        </p>

        {isProcessed && idea.tags && idea.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {idea.tags.slice(0, 4).map((tag: string) => (
              <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
            ))}
            {idea.tags.length > 4 && (
              <Badge variant="secondary" className="text-[10px]">+{idea.tags.length - 4}</Badge>
            )}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground/60">
          {format(new Date(idea.created_at), "MMM d, yyyy")}
        </p>
      </CardContent>
    </Card>
  );
}

function IdeaListRow({ idea, onClick }: { idea: any; onClick: () => void }) {
  const isProcessed = idea.status === "processed" || idea.status === "brainstorming" || idea.status === "scrapped";
  const isScrapped = idea.status === "scrapped";
  const categoryClass = CATEGORY_COLORS[idea.category] || "bg-secondary text-secondary-foreground";

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/50 bg-card/50 cursor-pointer hover:border-primary/30 hover:bg-card/80 transition-all"
    >
      <Lightbulb className="h-4 w-4 text-yellow-400 shrink-0" />
      {isScrapped ? (
        <Badge className="text-[10px] border bg-zinc-500/20 text-zinc-400 border-zinc-500/30 shrink-0">Scrapped</Badge>
      ) : idea.category ? (
        <Badge className={`text-[10px] border ${categoryClass} shrink-0`}>{idea.category}</Badge>
      ) : (
        <Badge variant="secondary" className="text-[10px] shrink-0">New</Badge>
      )}
      <span className="text-sm font-medium truncate min-w-0 max-w-[200px]">{idea.title || "Untitled"}</span>
      <span className="text-xs text-muted-foreground truncate overflow-hidden min-w-0 flex-1 hidden sm:block">
        {(isProcessed && idea.processed_summary ? idea.processed_summary : idea.raw_dump || "").slice(0, 80)}
      </span>
      {idea.tags?.length > 0 && (
        <div className="hidden md:flex gap-1 shrink-0">
          {idea.tags.slice(0, 2).map((t: string) => (
            <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
          ))}
        </div>
      )}
      <span className="text-[10px] text-muted-foreground/60 shrink-0">{format(new Date(idea.created_at), "MMM d")}</span>
    </div>
  );
}

function IdeaDetailModal({
  idea,
  open,
  onOpenChange,
  onDelete,
  onStartBrainstorm,
  onScrap,
  isDeleting,
  isStarting,
  isScrapping,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: {
  idea: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
  onStartBrainstorm: () => void;
  onScrap: () => void;
  isDeleting: boolean;
  isStarting: boolean;
  isScrapping: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}) {
  const navigate = useNavigate();

  const categoryClass = idea ? (CATEGORY_COLORS[idea.category] || "bg-secondary text-secondary-foreground") : "";
  const isBrainstorming = idea?.status === "brainstorming";
  const isScrapped = idea?.status === "scrapped";

  const { data: linkedBrainstorm } = useQuery({
    queryKey: ["idea-linked-brainstorm", idea?.id],
    queryFn: async () => {
      const rows = await getRows("brainstorms", { idea_id: idea!.id });
      const row = rows.find((r) => r.deleted_at == null || r.deleted_at === "");
      if (!row) return null;
      return { id: row.id as string, title: row.title as string };
    },
    enabled: !!idea?.id,
  });

  const { data: linkedProject } = useQuery({
    queryKey: ["idea-linked-project", linkedBrainstorm?.id],
    queryFn: async () => {
      const rows = await getRows("projects", { brainstorm_id: linkedBrainstorm!.id });
      const row = rows.find((r) => r.deleted_at == null || r.deleted_at === "");
      if (!row) return null;
      return { id: row.id as string, name: row.name as string };
    },
    enabled: !!linkedBrainstorm?.id,
  });

  const { data: linkedCampaign } = useQuery({
    queryKey: ["idea-linked-campaign", linkedProject?.id],
    queryFn: async () => {
      const rows = await getRows("campaigns", { project_id: linkedProject!.id });
      const row = rows.find((r) => r.deleted_at == null || r.deleted_at === "");
      if (!row) return null;
      return { id: row.id as string, title: row.title as string };
    },
    enabled: !!linkedProject?.id,
  });

  if (!idea) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl h-[85vh] flex flex-col p-0 gap-0 [&>button]:hidden">
        <div className="flex items-center gap-2 px-6 pt-6 pb-3 shrink-0">
          {onPrev && (
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onPrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          <DialogTitle className="flex-1 text-lg font-semibold leading-none tracking-tight">{idea.title || "Idea Details"}</DialogTitle>
          {onNext && (
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 ml-4" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <DialogDescription className="sr-only">View idea details, delete, or start a brainstorm</DialogDescription>

        <div className="flex-1 overflow-y-auto px-6 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs text-muted-foreground">
              Created {format(new Date(idea.created_at), "MMM d, yyyy 'at' h:mm a")}
            </p>
            {idea.category && (
              <Badge className={`text-xs border ${categoryClass}`}>{idea.category}</Badge>
            )}
            {linkedBrainstorm && (
              <Badge
                variant="outline"
                className="text-xs gap-1 cursor-pointer hover:bg-accent transition-colors"
                onClick={() => { onOpenChange(false); navigate(`/brainstorms/${linkedBrainstorm.id}`); }}
              >
                <Brain className="h-3 w-3 text-pink-400" /> Linked Brainstorm
              </Badge>
            )}
            {linkedProject && (
              <Badge
                variant="outline"
                className="text-xs gap-1 cursor-pointer hover:bg-accent transition-colors"
                onClick={() => { onOpenChange(false); navigate(`/projects/${linkedProject.id}`); }}
              >
                <Wrench className="h-3 w-3 text-blue-400" /> Linked Project
              </Badge>
            )}
            {linkedCampaign && (
              <Badge
                variant="outline"
                className="text-xs gap-1 cursor-pointer hover:bg-accent transition-colors"
                onClick={() => { onOpenChange(false); navigate(`/campaigns/${linkedCampaign.id}`); }}
              >
                <Megaphone className="h-3 w-3 text-orange-400" /> Linked Campaign
              </Badge>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Raw Dump</p>
            <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground whitespace-pre-wrap">
              {idea.raw_dump}
            </div>
          </div>

          {idea.processed_summary && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Summary</p>
              <p className="text-sm leading-relaxed">{idea.processed_summary}</p>
            </div>
          )}

          {idea.key_features && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Key Features</p>
              <div className="text-sm text-muted-foreground prose prose-sm max-w-none [&_ul]:mt-0 [&_ul]:mb-0 [&_li]:my-0">
                <div dangerouslySetInnerHTML={{ __html: idea.key_features.replace(/^- /gm, "• ").replace(/\n/g, "<br/>") }} />
              </div>
            </div>
          )}

          {idea.tags && idea.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pb-4">
              {idea.tags.map((tag: string) => (
                <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
              ))}
            </div>
          )}
        </div>

        <Separator />
        <div className="flex items-center justify-end gap-2 px-6 py-4 shrink-0">
          {!isBrainstorming && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={isDeleting} className="mr-auto">
                  {isDeleting ? "Deleting…" : "Delete"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Move to trash?</AlertDialogTitle>
                  <AlertDialogDescription>This will move the idea to trash. You can restore it later.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {!isBrainstorming && (
            <Button variant="secondary" onClick={onScrap} disabled={isScrapping}>
              {isScrapped ? "Un-scrap" : "Scrap"}
            </Button>
          )}
          <Button
            onClick={onStartBrainstorm}
            disabled={isBrainstorming || isStarting || idea.status === "processing"}
            className="gap-2"
          >
            <Brain className="h-4 w-4" />
            {isBrainstorming ? "Brainstorming…" : isStarting ? "Starting…" : "Start Brainstorm"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const IDEA_GROUPS = [
  { key: "fresh", label: "Fresh Ideas", statuses: ["new", "processing", "processed"] },
  { key: "brainstorming", label: "Brainstorming", statuses: ["brainstorming"] },
  { key: "scrapped", label: "Scrapped", statuses: ["scrapped"] },
];

export default function IdeasPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [dumpOpen, setDumpOpen] = useState(false);
  const [rawDump, setRawDump] = useState("");
  const [viewMode, setViewMode] = useState<"kanban" | "tile" | "list">(
    () => (localStorage.getItem("ideas-view-mode") as any) || "tile"
  );
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const [selectedIdea, setSelectedIdea] = useState<any>(null);
  const pendingIdeaIdRef = useRef<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("ideas-collapsed-groups");
      if (saved) return new Set(JSON.parse(saved));
      // Default collapsed: scrapped, brainstorming
      const defaults = new Set(["scrapped", "brainstorming"]);
      localStorage.setItem("ideas-collapsed-groups", JSON.stringify([...defaults]));
      return defaults;
    } catch { return new Set(["scrapped", "brainstorming"]); }
  });
  const [sortMode, setSortMode] = useState<string>(
    () => localStorage.getItem("ideas-sort-mode") || "newest"
  );

  const handleSortChange = (val: string) => {
    setSortMode(val);
    localStorage.setItem("ideas-sort-mode", val);
  };

  const sortItems = (items: any[]) => {
    const sorted = [...items];
    switch (sortMode) {
      case "category": return sorted.sort((a, b) => (a.category || "").localeCompare(b.category || ""));
      case "newest": return sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      case "oldest": return sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      case "alpha": return sorted.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
      case "alpha_desc": return sorted.sort((a, b) => (b.title || "").localeCompare(a.title || ""));
      case "recent": return sorted.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      default: return sorted;
    }
  };

  const toggleGroupCollapse = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      localStorage.setItem("ideas-collapsed-groups", JSON.stringify([...next]));
      return next;
    });
  };

  const setView = (mode: "kanban" | "tile" | "list") => {
    setViewMode(mode);
    localStorage.setItem("ideas-view-mode", mode);
  };

  const { data: ideas = [], isLoading } = useQuery({
    queryKey: ["ideas"],
    queryFn: async () => {
      const rows = await getRows("ideas");
      const active = rows.filter((r) => r.deleted_at == null || r.deleted_at === "");
      return active.sort(
        (a, b) =>
          new Date(String(b.created_at || 0)).getTime() -
          new Date(String(a.created_at || 0)).getTime(),
      );
    },
    refetchInterval: (query) => {
      const data = query.state.data as any[] | undefined;
      if (data?.some((i: any) => i.status === "processing")) return 3000;
      return false;
    },
  });

  useEffect(() => {
    if (pendingIdeaIdRef.current && ideas.length > 0) {
      const pending = ideas.find((i: any) => i.id === pendingIdeaIdRef.current);
      if (pending && pending.status !== "processing") {
        setSelectedIdea(pending);
        pendingIdeaIdRef.current = null;
      }
    }
  }, [ideas]);

  useEffect(() => {
    if (!ideas.length || !user) return;
    const brainstormingIdeas = ideas.filter((i: any) => i.status === "brainstorming");
    if (!brainstormingIdeas.length) return;

    (async () => {
      let updated = false;
      for (const idea of brainstormingIdeas) {
        const bRows = await getRows("brainstorms", { idea_id: idea.id });
        const hasBrainstorm = bRows.some(
          (r) => r.deleted_at == null || r.deleted_at === "",
        );
        if (!hasBrainstorm) {
          await updateRow("ideas", idea.id as string, {
            status: "scrapped",
            updated_at: new Date().toISOString(),
          });
          updated = true;
        }
      }
      if (updated) {
        queryClient.invalidateQueries({ queryKey: ["ideas"] });
      }
    })();
  }, [ideas, user]);

  const createIdea = useMutation({
    mutationFn: async (raw: string) => {
      const now = new Date().toISOString();
      const row = await insertRow("ideas", {
        raw_dump: raw,
        user_id: user!.id,
        status: "processing",
        created_at: now,
        updated_at: now,
        category: "",
        deleted_at: null,
        key_features: "",
        processed_summary: "",
        title: "",
        tags: [],
      });
      return row;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-items"] });
      setDumpOpen(false);
      setRawDump("");
      pendingIdeaIdRef.current = data.id as string;
      toast.success("Idea captured! AI is processing…");
      void processIdeaClient({
        idea_id: data.id as string,
        raw_dump: String(data.raw_dump ?? ""),
      })
        .catch((err: unknown) => {
          console.error("AI processing error:", err);
          const e = err as Error & { code?: string };
          if (e.code === "NO_API_KEY") openGeminiSettings();
          toast.error("AI processing failed — add a valid API key in Settings or try again.");
          pendingIdeaIdRef.current = null;
        })
        .finally(() => {
          queryClient.invalidateQueries({ queryKey: ["ideas"] });
        });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteIdea = useMutation({
    mutationFn: async (id: string) => {
      await updateRow("ideas", id, {
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
      setSelectedIdea(null);
      toast.success("Idea moved to trash");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const scrapIdea = useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: string }) => {
      const newStatus = currentStatus === "scrapped" ? "processed" : "scrapped";
      await updateRow("ideas", id, {
        status: newStatus,
        updated_at: new Date().toISOString(),
      });
      return newStatus;
    },
    onSuccess: (newStatus) => {
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
      queryClient.invalidateQueries({ queryKey: ["brainstorms"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-items"] });
      toast.success(newStatus === "scrapped" ? "Idea scrapped" : "Idea restored");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startBrainstorm = useMutation({
    mutationFn: async (idea: any) => {
      const title = idea.title || "Brainstorm";
      const now = new Date().toISOString();
      const row = await insertRow("brainstorms", {
        idea_id: idea.id,
        title,
        user_id: user!.id,
        compiled_description: idea.processed_summary || "",
        bullet_breakdown: idea.key_features || "",
        category: idea.category || null,
        tags: idea.tags ?? [],
        status: "active",
        chat_history: [],
        assistant_chat_history: [],
        created_at: now,
        updated_at: now,
        deleted_at: null,
      });
      await updateRow("ideas", idea.id, {
        status: "brainstorming",
        updated_at: new Date().toISOString(),
      });
      return row;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-items"] });
      setSelectedIdea(null);
      navigate(`/brainstorms/${data.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    return () => {
      isListeningRef.current = false;
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  const handleVoice = () => {
    if (!isListening) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        toast.error("Speech recognition not supported in this browser");
        return;
      }
      isListeningRef.current = true;
      setIsListening(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = "en-US";
      recognition.onresult = (event: any) => {
        const last = event.results[event.results.length - 1];
        if (last.isFinal) {
          setRawDump(prev => (prev ? prev + " " : "") + last[0].transcript);
        }
      };
      recognition.onend = () => {
        if (isListeningRef.current) {
          recognition.start();
        } else {
          setIsListening(false);
          recognitionRef.current = null;
        }
      };
      recognition.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        isListeningRef.current = false;
        setIsListening(false);
        recognitionRef.current = null;
      };
      recognitionRef.current = recognition;
      recognition.start();
    } else {
      isListeningRef.current = false;
      recognitionRef.current?.stop();
    }
  };

  const handleSave = () => {
    if (!rawDump.trim()) return;
    createIdea.mutate(rawDump.trim());
  };

  const currentIdea = selectedIdea ? ideas.find((i: any) => i.id === selectedIdea.id) || selectedIdea : null;
  const freshStatuses = ["new", "processing", "processed"];
  const freshIdeas = ideas.filter((i: any) => freshStatuses.includes(i.status));
  const currentFreshIndex = currentIdea ? freshIdeas.findIndex((i: any) => i.id === currentIdea.id) : -1;
  const canNav = freshIdeas.length > 1;
  const hasPrev = canNav;
  const hasNext = canNav;
  const isFreshIdea = currentFreshIndex >= 0;

  const renderGroupedContent = (groupItems: any[]) => {
    if (viewMode === "list") {
      return (
        <div className="space-y-1">
          {groupItems.map((idea: any) => (
            <IdeaListRow key={idea.id} idea={idea} onClick={() => setSelectedIdea(idea)} />
          ))}
        </div>
      );
    }
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {groupItems.map((idea: any) => (
          <IdeaCard key={idea.id} idea={idea} onClick={() => setSelectedIdea(idea)} />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Lightbulb className="h-8 w-8 text-yellow-400" />
            <h1 className="text-3xl font-bold">Ideas</h1>
          </div>
          <p className="text-muted-foreground">Capture raw thoughts and let AI help organize them</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setView("kanban")} className={viewMode === "kanban" ? "text-primary" : ""}>
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setView("tile")} className={viewMode === "tile" ? "text-primary" : ""}>
            <Grid3X3 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setView("list")} className={viewMode === "list" ? "text-primary" : ""}>
            <List className="h-4 w-4" />
          </Button>
          <Select value={sortMode} onValueChange={handleSortChange}>
            <SelectTrigger className="w-[150px] h-9 text-xs">
              <ArrowUpDown className="h-3 w-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Last Edited</SelectItem>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
              <SelectItem value="alpha">A-Z</SelectItem>
              <SelectItem value="alpha_desc">Z-A</SelectItem>
              <SelectItem value="category">Category</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setDumpOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Dump Idea
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : ideas.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20">
          <Lightbulb className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <p className="text-lg font-medium text-muted-foreground">No ideas yet</p>
          <p className="text-sm text-muted-foreground/70">Hit "Dump Idea" to capture your first thought</p>
        </div>
      ) : viewMode === "kanban" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {IDEA_GROUPS.map(group => {
            const groupItems = sortItems(ideas.filter((i: any) => group.statuses.includes(i.status)));
            const isCollapsed = collapsedGroups.has(group.key);
            return (
              <Collapsible key={group.key} open={!isCollapsed} onOpenChange={() => toggleGroupCollapse(group.key)}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-1 hover:text-primary transition-colors">
                  {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  <span className="text-sm font-semibold uppercase tracking-wider">{group.label}</span>
                  <Badge variant="secondary" className="text-[10px] ml-1">{groupItems.length}</Badge>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-3">
                  {groupItems.map((idea: any) => (
                    <IdeaCard key={idea.id} idea={idea} onClick={() => setSelectedIdea(idea)} />
                  ))}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {IDEA_GROUPS.map(group => {
            const groupItems = sortItems(ideas.filter((i: any) => group.statuses.includes(i.status)));
            if (groupItems.length === 0) return null;
            const isCollapsed = collapsedGroups.has(group.key);
            return (
              <Collapsible key={group.key} open={!isCollapsed} onOpenChange={() => toggleGroupCollapse(group.key)}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-1 hover:text-primary transition-colors">
                  {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  <span className="text-sm font-semibold uppercase tracking-wider">{group.label}</span>
                  <Badge variant="secondary" className="text-[10px] ml-1">{groupItems.length}</Badge>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  {renderGroupedContent(groupItems)}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}

      {/* Dump Idea Dialog */}
      <Dialog open={dumpOpen} onOpenChange={setDumpOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-primary" />
              Dump an Idea
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              placeholder="Just dump it — stream of consciousness, rough notes, half-baked thoughts…"
              className="min-h-[200px] resize-none"
              value={rawDump}
              onChange={(e) => setRawDump(e.target.value)}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleVoice}
              className={`gap-2 ${isListening ? "text-destructive" : ""}`}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              {isListening ? "Stop Recording" : "Voice Input"}
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDumpOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!rawDump.trim() || createIdea.isPending}>
              {createIdea.isPending ? "Saving…" : "Save Idea"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <IdeaDetailModal
        idea={currentIdea}
        open={!!selectedIdea}
        onOpenChange={(open) => { if (!open) setSelectedIdea(null); }}
        onDelete={() => currentIdea && deleteIdea.mutate(currentIdea.id)}
        onStartBrainstorm={() => currentIdea && startBrainstorm.mutate(currentIdea)}
        onScrap={() => {
          if (!currentIdea) return;
          const isScrapping = currentIdea.status !== "scrapped";
          scrapIdea.mutate({ id: currentIdea.id, currentStatus: currentIdea.status }, {
            onSuccess: () => {
              if (isScrapping && isFreshIdea) {
                const remaining = freshIdeas.filter((_: any, i: number) => i !== currentFreshIndex);
                if (remaining.length > 0) {
                  const nextIdx = currentFreshIndex >= remaining.length ? 0 : currentFreshIndex;
                  setSelectedIdea(remaining[nextIdx]);
                } else {
                  setSelectedIdea(null);
                }
              }
            },
          });
        }}
        isDeleting={deleteIdea.isPending}
        isStarting={startBrainstorm.isPending}
        isScrapping={scrapIdea.isPending}
        onPrev={isFreshIdea ? () => {
          const prev = currentFreshIndex <= 0 ? freshIdeas.length - 1 : currentFreshIndex - 1;
          setSelectedIdea(freshIdeas[prev]);
        } : undefined}
        onNext={isFreshIdea ? () => {
          const next = currentFreshIndex >= freshIdeas.length - 1 ? 0 : currentFreshIndex + 1;
          setSelectedIdea(freshIdeas[next]);
        } : undefined}
        hasPrev={hasPrev}
        hasNext={hasNext}
      />
    </div>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Brain, Plus, Grid3X3, List, LayoutGrid, ChevronDown, ChevronRight, ArrowUpDown } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/localDb";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
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

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-sky-500/20 text-sky-400 border-sky-500/30" },
  backburner: { label: "Backburner", className: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  scrapped: { label: "Scrapped", className: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30" },
  completed: { label: "Complete", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
};

const BRAINSTORM_GROUPS = [
  { key: "active", label: "Active", statuses: ["active"] },
  { key: "backburner", label: "Backburner", statuses: ["backburner"] },
  { key: "completed", label: "Complete", statuses: ["completed"] },
  { key: "scrapped", label: "SCRAPPED", statuses: ["scrapped"] },
];

export default function BrainstormsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<"kanban" | "tile" | "list">(
    () => (localStorage.getItem("brainstorms-view-mode") as any) || "tile"
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("brainstorms-collapsed-groups");
      if (saved) return new Set(JSON.parse(saved));
      const defaults = new Set(["scrapped", "completed"]);
      localStorage.setItem("brainstorms-collapsed-groups", JSON.stringify([...defaults]));
      return defaults;
    } catch { return new Set(["scrapped", "completed"]); }
  });
  const [sortMode, setSortMode] = useState<string>(
    () => localStorage.getItem("brainstorms-sort-mode") || "newest"
  );

  const handleSortChange = (val: string) => {
    setSortMode(val);
    localStorage.setItem("brainstorms-sort-mode", val);
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
      localStorage.setItem("brainstorms-collapsed-groups", JSON.stringify([...next]));
      return next;
    });
  };

  const setView = (mode: "kanban" | "tile" | "list") => {
    setViewMode(mode);
    localStorage.setItem("brainstorms-view-mode", mode);
  };

  const { data: brainstorms = [], isLoading } = useQuery({
    queryKey: ["brainstorms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brainstorms")
        .select("*, ideas(processed_summary, raw_dump)")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createBrainstorm = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("brainstorms")
        .insert({ user_id: user!.id, title: "Untitled Brainstorm" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["brainstorms"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-items"] });
      navigate(`/brainstorms/${data.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const renderCard = (b: any) => {
    const categoryClass = CATEGORY_COLORS[b.category] || "bg-secondary text-secondary-foreground";
    const tags: string[] = b.tags || [];
    const descPreview = b.compiled_description || (b.ideas?.processed_summary) || (b.ideas?.raw_dump?.slice(0, 140));
    const statusBadge = STATUS_BADGES[b.status] || STATUS_BADGES.active;

    return (
      <Card
        key={b.id}
        onClick={() => navigate(`/brainstorms/${b.id}`)}
        className="cursor-pointer border-border/50 bg-card/50 transition-all hover:border-primary/30 hover:bg-card/80"
      >
        <CardHeader className="px-4 pt-3 pb-1">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-pink-400 shrink-0" />
            {b.category ? (
              <Badge className={`text-xs border ${categoryClass}`}>{b.category}</Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">Uncategorized</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-3 pt-0 space-y-1">
          <p className="text-sm font-bold leading-snug">{b.title}</p>
          {descPreview && (
            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">{descPreview}</p>
          )}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.slice(0, 4).map((tag: string) => (
                <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
              ))}
              {tags.length > 4 && (
                <Badge variant="secondary" className="text-[10px]">+{tags.length - 4}</Badge>
              )}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground/60">{format(new Date(b.created_at), "MMM d, yyyy")}</p>
        </CardContent>
      </Card>
    );
  };

  const renderListRow = (b: any) => {
    const categoryClass = CATEGORY_COLORS[b.category] || "bg-secondary text-secondary-foreground";
    const tags: string[] = b.tags || [];
    const descPreview = b.compiled_description || (b.ideas?.processed_summary) || (b.ideas?.raw_dump?.slice(0, 80));

    return (
      <div
        key={b.id}
        onClick={() => navigate(`/brainstorms/${b.id}`)}
        className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/50 bg-card/50 cursor-pointer hover:border-primary/30 hover:bg-card/80 transition-all"
      >
        <Brain className="h-4 w-4 text-pink-400 shrink-0" />
        <Badge className={`text-[10px] border ${categoryClass} shrink-0`}>{b.category || "Uncategorized"}</Badge>
        <span className="text-sm font-medium truncate min-w-0 max-w-[200px]">{b.title}</span>
        <span className="text-xs text-muted-foreground truncate overflow-hidden min-w-0 flex-1 hidden sm:block">{(descPreview || "").slice(0, 80)}</span>
        {tags.length > 0 && (
          <div className="hidden md:flex gap-1 shrink-0">
            {tags.slice(0, 2).map((t: string) => (
              <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
            ))}
          </div>
        )}
        <span className="text-[10px] text-muted-foreground/60 shrink-0">{format(new Date(b.created_at), "MMM d")}</span>
      </div>
    );
  };

  const renderGroupedContent = (groupItems: any[]) => {
    if (viewMode === "list") {
      return <div className="space-y-1">{groupItems.map(renderListRow)}</div>;
    }
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {groupItems.map(renderCard)}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Brain className="h-8 w-8 text-pink-400" />
            <h1 className="text-3xl font-bold">Brainstorms</h1>
          </div>
          <p className="text-muted-foreground">Research workspaces for developing your ideas</p>
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
          <Button onClick={() => createBrainstorm.mutate()} disabled={createBrainstorm.isPending} className="gap-2">
            <Plus className="h-4 w-4" /> New Brainstorm
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : brainstorms.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20">
          <Brain className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <p className="text-lg font-medium text-muted-foreground">No brainstorms yet</p>
          <p className="text-sm text-muted-foreground/70">Start a brainstorm from an idea or create one directly</p>
        </div>
      ) : viewMode === "kanban" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {BRAINSTORM_GROUPS.map(group => {
            const groupItems = sortItems(brainstorms.filter((b: any) => group.statuses.includes(b.status)));
            const isCollapsed = collapsedGroups.has(group.key);
            return (
              <Collapsible key={group.key} open={!isCollapsed} onOpenChange={() => toggleGroupCollapse(group.key)}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-1 hover:text-primary transition-colors">
                  {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  <span className="text-sm font-semibold uppercase tracking-wider">{group.label}</span>
                  <Badge variant="secondary" className="text-[10px] ml-1">{groupItems.length}</Badge>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-3">
                  {groupItems.map(renderCard)}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {BRAINSTORM_GROUPS.map(group => {
            const groupItems = sortItems(brainstorms.filter((b: any) => group.statuses.includes(b.status)));
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
    </div>
  );
}

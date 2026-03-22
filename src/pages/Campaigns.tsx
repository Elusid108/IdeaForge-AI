import { Megaphone, LayoutGrid, Grid3X3, List, ArrowUpDown, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/localDb";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

const statusColumns = ["foundation_ip", "infrastructure_production", "asset_creation_prelaunch", "active_campaign", "operations_fulfillment"];
const statusLabels: Record<string, string> = {
  foundation_ip: "Foundation & IP",
  infrastructure_production: "Infrastructure & Production",
  asset_creation_prelaunch: "Asset Creation & Pre-Launch",
  active_campaign: "Active Campaign",
  operations_fulfillment: "Operations & Fulfillment",
};

const CAMPAIGN_GROUPS = statusColumns.map(s => ({ key: s, label: statusLabels[s], statuses: [s] }));

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

export default function CampaignsPage() {
  const [viewMode, setViewMode] = useState<"kanban" | "tile" | "list">(
    () => (localStorage.getItem("campaigns-view-mode") as any) || "kanban"
  );
  const [sortMode, setSortMode] = useState<string>(
    () => localStorage.getItem("campaigns-sort-mode") || "newest"
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("campaigns-collapsed-groups");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const navigate = useNavigate();

  const handleSortChange = (val: string) => {
    setSortMode(val);
    localStorage.setItem("campaigns-sort-mode", val);
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
      localStorage.setItem("campaigns-collapsed-groups", JSON.stringify([...next]));
      return next;
    });
  };

  const setView = (mode: "kanban" | "tile" | "list") => {
    setViewMode(mode);
    localStorage.setItem("campaigns-view-mode", mode);
  };

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns" as any)
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const renderCampaignCard = (c: any) => {
    const catClass = c.category ? CATEGORY_COLORS[c.category] || "bg-secondary text-secondary-foreground" : "";
    const tags: string[] = c.tags || [];
    const visibleTags = tags.slice(0, 4);
    const overflowCount = tags.length - 4;

    return (
      <Card
        key={c.id}
        onClick={() => navigate(`/campaigns/${c.id}`)}
        className="cursor-pointer border-border/50 bg-card/50 transition-all hover:border-primary/30 hover:bg-card/80"
      >
        <CardHeader className="px-4 pt-3 pb-1">
          <div className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-orange-400 shrink-0" />
            <Badge className={`text-xs border ${catClass}`}>{c.category || "Uncategorized"}</Badge>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-3 pt-0 space-y-1">
          <p className="text-sm font-bold leading-snug">{c.title}</p>
          {visibleTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {visibleTags.map((tag: string) => (
                <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">{tag}</Badge>
              ))}
              {overflowCount > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">+{overflowCount}</Badge>
              )}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground/60">{format(new Date(c.created_at), "MMM d, yyyy")}</p>
        </CardContent>
      </Card>
    );
  };

  const renderListRow = (c: any) => {
    const catClass = c.category ? CATEGORY_COLORS[c.category] || "bg-secondary text-secondary-foreground" : "";
    const tags: string[] = c.tags || [];

    return (
      <div
        key={c.id}
        onClick={() => navigate(`/campaigns/${c.id}`)}
        className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/50 bg-card/50 cursor-pointer hover:border-primary/30 hover:bg-card/80 transition-all"
      >
        <Megaphone className="h-4 w-4 text-orange-400 shrink-0" />
        <Badge className={`text-[10px] border ${catClass} shrink-0`}>{c.category || "Uncategorized"}</Badge>
        <span className="text-sm font-medium truncate min-w-0 max-w-[200px]">{c.title}</span>
        <span className="text-xs text-muted-foreground truncate overflow-hidden min-w-0 flex-1 hidden sm:block">{statusLabels[c.status] || c.status}</span>
        {tags.length > 0 && (
          <div className="hidden md:flex gap-1 shrink-0">
            {tags.slice(0, 2).map((t: string) => (
              <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
            ))}
          </div>
        )}
        <span className="text-[10px] text-muted-foreground/60 shrink-0">{format(new Date(c.created_at), "MMM d")}</span>
      </div>
    );
  };

  const renderGroupedContent = (groupItems: any[]) => {
    if (viewMode === "list") {
      return <div className="space-y-1">{groupItems.map(renderListRow)}</div>;
    }
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {groupItems.map(renderCampaignCard)}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Megaphone className="h-8 w-8 text-orange-400" />
            <h1 className="text-3xl font-bold">Campaigns</h1>
          </div>
          <p className="text-muted-foreground">Go-to-market pipeline</p>
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
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20">
          <Megaphone className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <p className="text-lg font-medium text-muted-foreground">No campaigns yet</p>
          <p className="text-sm text-muted-foreground/70">Promote a project with status "Done" to launch a campaign</p>
        </div>
      ) : viewMode === "kanban" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
          {statusColumns.map((status) => {
            const colItems = sortItems(campaigns.filter((c: any) => c.status === status));
            const isCollapsed = collapsedGroups.has(status);
            return (
              <Collapsible key={status} open={!isCollapsed} onOpenChange={() => toggleGroupCollapse(status)}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-1 hover:text-primary transition-colors">
                  {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  <span className="text-sm font-semibold uppercase tracking-wider">{statusLabels[status]}</span>
                  <Badge variant="secondary" className="text-[10px] ml-1">{colItems.length}</Badge>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-3">
                  {colItems.map(renderCampaignCard)}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {CAMPAIGN_GROUPS.map(group => {
            const groupItems = sortItems(campaigns.filter((c: any) => group.statuses.includes(c.status)));
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

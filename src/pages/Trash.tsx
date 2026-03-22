import { Trash2, RotateCcw, XCircle, Lightbulb, Brain, Wrench, Megaphone, ChevronRight } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/localDb";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";

function TrashSection({
  title,
  icon: Icon,
  items,
  isLoading,
  onRestore,
  onDelete,
  labelKey,
}: {
  title: string;
  icon: any;
  items: any[];
  isLoading: boolean;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  labelKey: string;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent">
        <Icon className="h-4 w-4" />
        {title} ({items.length})
        <ChevronRight className={`ml-auto h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : items.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No trashed {title.toLowerCase()}</p>
        ) : (
          items.map((item: any) => (
            <Card key={item.id} className="border-border/50 bg-card/50">
              <CardContent className="flex items-center justify-between p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{item[labelKey] || "Untitled"}</p>
                  <p className="text-xs text-muted-foreground">
                    Deleted {new Date(item.deleted_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => onRestore(item.id)}>
                    <RotateCcw className="h-3 w-3" /> Restore
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="gap-1 text-xs text-destructive hover:text-destructive">
                        <XCircle className="h-3 w-3" /> Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Permanently delete?</AlertDialogTitle>
                        <AlertDialogDescription>This cannot be undone. The item will be permanently removed.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => onDelete(item.id)}>Delete Forever</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function TrashPage() {
  const queryClient = useQueryClient();

  const { data: ideas = [], isLoading: loadingIdeas } = useQuery({
    queryKey: ["trash-ideas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ideas").select("*").not("deleted_at", "is", null).order("deleted_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: brainstorms = [], isLoading: loadingBrainstorms } = useQuery({
    queryKey: ["trash-brainstorms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("brainstorms").select("*").not("deleted_at", "is", null).order("deleted_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: projects = [], isLoading: loadingProjects } = useQuery({
    queryKey: ["trash-projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").not("deleted_at", "is", null).order("deleted_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: campaigns = [], isLoading: loadingCampaigns } = useQuery({
    queryKey: ["trash-campaigns"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("campaigns" as any).select("*") as any).not("deleted_at", "is", null).order("deleted_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const restore = (table: string, queryKey: string) =>
    useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase.from(table as any).update({ deleted_at: null } as any).eq("id", id);
        if (error) throw error;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [queryKey] });
        queryClient.invalidateQueries({ queryKey: [table === "ideas" ? "ideas" : table === "brainstorms" ? "brainstorms" : table === "projects" ? "projects" : "campaigns"] });
        toast.success("Restored!");
      },
      onError: (e: Error) => toast.error(e.message),
    });

  const permanentDelete = (table: string, queryKey: string) =>
    useMutation({
      mutationFn: async (id: string) => {
        if (table === "campaigns") {
          // Unlink the project when permanently deleting a campaign
          const campaign = campaigns.find((c: any) => c.id === id);
          if (campaign?.project_id) {
            await supabase.from("projects").update({ campaign_id: null } as any).eq("id", campaign.project_id);
          }
        }
        const { error } = await supabase.from(table as any).delete().eq("id", id);
        if (error) throw error;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [queryKey] });
        toast.success("Permanently deleted");
      },
      onError: (e: Error) => toast.error(e.message),
    });

  const restoreIdea = restore("ideas", "trash-ideas");
  const deleteIdea = permanentDelete("ideas", "trash-ideas");
  const restoreBrainstorm = restore("brainstorms", "trash-brainstorms");
  const deleteBrainstorm = permanentDelete("brainstorms", "trash-brainstorms");
  const restoreProject = restore("projects", "trash-projects");
  const deleteProject = permanentDelete("projects", "trash-projects");
  const restoreCampaign = restore("campaigns", "trash-campaigns");
  const deleteCampaign = permanentDelete("campaigns", "trash-campaigns");

  const totalTrashed = ideas.length + brainstorms.length + projects.length + campaigns.length;

  const emptyTrash = useMutation({
    mutationFn: async () => {
      // Unlink projects for trashed campaigns
      for (const c of campaigns) {
        if ((c as any).project_id) {
          await supabase.from("projects").update({ campaign_id: null } as any).eq("id", (c as any).project_id);
        }
      }
      // Delete all trashed items
      if (campaigns.length > 0) {
        const { error } = await supabase.from("campaigns" as any).delete().not("deleted_at", "is", null);
        if (error) throw error;
      }
      if (projects.length > 0) {
        const { error } = await supabase.from("projects").delete().not("deleted_at", "is", null);
        if (error) throw error;
      }
      if (brainstorms.length > 0) {
        const { error } = await supabase.from("brainstorms").delete().not("deleted_at", "is", null);
        if (error) throw error;
      }
      if (ideas.length > 0) {
        const { error } = await supabase.from("ideas").delete().not("deleted_at", "is", null);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trash-ideas"] });
      queryClient.invalidateQueries({ queryKey: ["trash-brainstorms"] });
      queryClient.invalidateQueries({ queryKey: ["trash-projects"] });
      queryClient.invalidateQueries({ queryKey: ["trash-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
      queryClient.invalidateQueries({ queryKey: ["brainstorms"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-items"] });
      toast.success("Trash emptied");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Trash2 className="h-7 w-7" /> Trash
          </h1>
          <p className="text-muted-foreground">Restore or permanently delete trashed items</p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="gap-2" disabled={totalTrashed === 0}>
              <Trash2 className="h-4 w-4" /> Empty Trash
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Empty trash?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete all {totalTrashed} trashed item{totalTrashed !== 1 ? "s" : ""}. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => emptyTrash.mutate()}>Delete All Forever</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="space-y-6">
        <TrashSection title="Ideas" icon={Lightbulb} items={ideas} isLoading={loadingIdeas} onRestore={(id) => restoreIdea.mutate(id)} onDelete={(id) => deleteIdea.mutate(id)} labelKey="title" />
        <TrashSection title="Brainstorms" icon={Brain} items={brainstorms} isLoading={loadingBrainstorms} onRestore={(id) => restoreBrainstorm.mutate(id)} onDelete={(id) => deleteBrainstorm.mutate(id)} labelKey="title" />
        <TrashSection title="Projects" icon={Wrench} items={projects} isLoading={loadingProjects} onRestore={(id) => restoreProject.mutate(id)} onDelete={(id) => deleteProject.mutate(id)} labelKey="name" />
        <TrashSection title="Campaigns" icon={Megaphone} items={campaigns} isLoading={loadingCampaigns} onRestore={(id) => restoreCampaign.mutate(id)} onDelete={(id) => deleteCampaign.mutate(id)} labelKey="title" />
      </div>
    </div>
  );
}

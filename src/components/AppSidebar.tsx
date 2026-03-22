import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ChevronRight, ChevronDown, LogOut, User, Trash2 } from "lucide-react";
import IdeaForgeLogo from "@/components/IdeaForgeLogo";
import { useAuth } from "@/contexts/AuthContext";
import { NavLink } from "@/components/NavLink";
import { supabase } from "@/lib/localDb";
import { useQuery } from "@tanstack/react-query";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const sections = [
  { label: "Ideas", href: "/ideas", emoji: "💡", table: "ideas" as const },
  { label: "Brainstorms", href: "/brainstorms", emoji: "🧠", table: "brainstorms" as const },
  { label: "Projects", href: "/projects", emoji: "🔧", table: "projects" as const },
  { label: "Campaigns", href: "/campaigns", emoji: "📣", table: "campaigns" as const },
];

const SIDEBAR_EXCLUDED_STATUSES: Record<string, string[]> = {
  ideas: ["brainstorming", "scrapped"],
  brainstorms: ["completed", "scrapped"],
  projects: ["done"],
};

function useSectionItems(table: "ideas" | "brainstorms" | "projects" | "campaigns", enabled: boolean) {
  return useQuery({
    queryKey: ["sidebar-items", table],
    queryFn: async () => {
      const nameCol = table === "projects" ? "name" : "title";
      const excluded = SIDEBAR_EXCLUDED_STATUSES[table] || [];
      let query = (supabase
        .from(table as any)
        .select(`id, ${nameCol}`) as any)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(20);
      if (excluded.length > 0) {
        for (const status of excluded) {
          query = query.neq("status", status);
        }
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((item: any) => ({
        id: item.id,
        title: item[nameCol] || "Untitled",
      }));
    },
    enabled,
    staleTime: 5_000,
  });
}

export function AppSidebar() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const closeMobileSidebar = () => {
    if (isMobile) setOpenMobile(false);
  };

  const toggleExpand = (label: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  };

  const ideasItems = useSectionItems("ideas", expanded.has("Ideas"));
  const brainstormsItems = useSectionItems("brainstorms", expanded.has("Brainstorms"));
  const projectsItems = useSectionItems("projects", expanded.has("Projects"));
  const campaignsItems = useSectionItems("campaigns" as any, expanded.has("Campaigns"));
  const itemsMap: Record<string, ReturnType<typeof useSectionItems>> = {
    Ideas: ideasItems,
    Brainstorms: brainstormsItems,
    Projects: projectsItems,
    Campaigns: campaignsItems,
  };

  const getDetailPath = (section: string, itemId: string) => {
    if (section === "Brainstorms") return `/brainstorms/${itemId}`;
    if (section === "Projects") return `/projects/${itemId}`;
    if (section === "Campaigns") return `/campaigns/${itemId}`;
    return `/ideas`;
  };

  return (
    <Sidebar className="border-r border-sidebar-border">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <IdeaForgeLogo className="h-5 w-5 text-primary" />
        </div>
        <span className="font-semibold text-sidebar-foreground">IdeaForge.AI</span>
        <span className="text-[10px] text-muted-foreground font-medium bg-muted px-1.5 py-0.5 rounded">v0.5</span>
      </div>

      <SidebarContent className="px-2 py-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {sections.map((section) => {
                const isExpanded = expanded.has(section.label);
                const query = itemsMap[section.label];
                const items = query?.data || [];

                return (
                  <div key={section.label}>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <div className="flex items-center w-full">
                          <NavLink
                            to={section.href}
                            className="text-sm text-sidebar-foreground hover:bg-sidebar-accent flex-1 flex items-center"
                            activeClassName="bg-sidebar-accent text-primary font-medium"
                            onClick={closeMobileSidebar}
                          >
                            <span className="mr-2">{section.emoji}</span>
                            {section.label}
                          </NavLink>
                          <button
                            onClick={(e) => toggleExpand(section.label, e)}
                            className="p-1 rounded hover:bg-sidebar-accent transition-colors"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-3 w-3 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-3 w-3 text-muted-foreground" />
                            )}
                          </button>
                        </div>
                      </SidebarMenuButton>
                    </SidebarMenuItem>

                    {isExpanded && (
                      <div className="ml-6 border-l border-sidebar-border pl-2 space-y-0.5 py-1">
                        {query?.isLoading ? (
                          <p className="text-xs text-muted-foreground px-2 py-1">Loading…</p>
                        ) : items.length === 0 ? (
                          <p className="text-xs text-muted-foreground/60 px-2 py-1 italic">No items</p>
                        ) : (
                          items.map((item) => (
                            <button
                              key={item.id}
                              onClick={() => { navigate(getDetailPath(section.label, item.id)); closeMobileSidebar(); }}
                              className={`w-full text-left text-xs px-2 py-1 rounded truncate hover:bg-sidebar-accent transition-colors text-sidebar-foreground/80 ${
                                location.pathname.includes(item.id) ? "bg-sidebar-accent text-primary font-medium" : ""
                              }`}
                            >
                              {item.title}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/trash"
                    className="text-sm text-sidebar-foreground hover:bg-sidebar-accent"
                    activeClassName="bg-sidebar-accent text-primary font-medium"
                    onClick={closeMobileSidebar}
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Trash
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
            <User className="h-4 w-4 text-primary" />
          </div>
          <span className="flex-1 truncate text-sm text-sidebar-foreground">{user?.email}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

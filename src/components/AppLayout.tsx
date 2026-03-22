import { useEffect, useRef } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { useAuth } from "@/contexts/AuthContext";
import { initDatabaseSheet } from "@/lib/google-sheets-db";
import { toast } from "sonner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const dbInitRef = useRef(false);

  useEffect(() => {
    if (!user) {
      dbInitRef.current = false;
      return;
    }
    if (dbInitRef.current) return;
    dbInitRef.current = true;
    void initDatabaseSheet().catch((e: unknown) => {
      dbInitRef.current = false;
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Could not open IdeaForge database spreadsheet: " + msg);
    });
  }, [user]);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <header className="flex h-14 items-center border-b border-border px-4">
            <SidebarTrigger />
          </header>
          <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
        </div>
      </div>
      <SettingsModal />
    </SidebarProvider>
  );
}

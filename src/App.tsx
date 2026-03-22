import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import LoginPage from "@/pages/Login";
import IdeasPage from "@/pages/Ideas";
import BrainstormsPage from "@/pages/Brainstorms";
import BrainstormWorkspace from "@/pages/BrainstormWorkspace";
import ProjectsPage from "@/pages/Projects";
import ProjectWorkspace from "@/pages/ProjectWorkspace";
import TrashPage from "@/pages/Trash";
import CampaignsPage from "@/pages/Campaigns";
import CampaignWorkspace from "@/pages/CampaignWorkspace";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <HashRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<Navigate to="/login" replace />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Navigate to="/ideas" replace />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/ideas"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <IdeasPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/brainstorms"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <BrainstormsPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/brainstorms/:id"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <BrainstormWorkspace />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <ProjectsPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:id"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <ProjectWorkspace />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/campaigns"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <CampaignsPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/campaigns/:id"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <CampaignWorkspace />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/trash"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <TrashPage />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </HashRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

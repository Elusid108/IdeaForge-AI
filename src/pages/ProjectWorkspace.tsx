import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Progress } from "@/components/ui/progress";
import FloatingChatWidget from "@/components/FloatingChatWidget";
import {
  ArrowLeft, Link as LinkIcon, Image, Film, StickyNote, X, Pencil,
  Grid3X3, List, ChevronDown, ChevronRight, ArrowUpDown, Trash2,
  Plus, Lightbulb, Brain, FileText, FolderOpen, Github, Star, GitFork, AlertCircle, GitCommit,
  CheckSquare, DollarSign, Calendar, ExternalLink, Receipt, Upload, Loader2,
  Bot, Send, Rocket, Megaphone, AlertTriangle, CheckCircle2, Code,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { useAuth } from "@/contexts/AuthContext";
import { deleteRow, getRows, insertRow, updateRow } from "@/lib/google-sheets-db";
import { supabase } from "@/lib/localDb";
import { gotchaChat, openGeminiSettings, projectChat } from "@/services/ai-service";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import EditableMarkdown from "@/components/EditableMarkdown";
import ReferenceViewer, { getVideoThumbnail } from "@/components/ReferenceViewer";
import RichTextNoteEditor from "@/components/RichTextNoteEditor";
import ReactMarkdown from "react-markdown";
import { markdownComponents } from "@/lib/markdownComponents";
import { format, formatDistanceToNow } from "date-fns";
import { useActionUndo } from "@/hooks/useActionUndo";
import TaskCommentButton from "@/components/TaskCommentButton";
import TaskCommentsSection from "@/components/TaskCommentsSection";
import { encodeWidgetData, parseWidgetData, WIDGET_TEMPLATES } from "@/lib/widgetUtils";

type RefType = "link" | "image" | "video" | "note" | "file" | "widget";
type SortMode = "az" | "za" | "newest" | "oldest";
type ChatMsg = { role: "user" | "assistant"; content: string; noteId?: string; noteTitle?: string; widgetId?: string; widgetTitle?: string; linkId?: string; linkTitle?: string; links?: { id: string; title: string }[] };

const EDIT_TITLES: Record<string, string> = { note: "Edit Note", link: "Edit Link", image: "Edit Image", video: "Edit Video", file: "Edit File", widget: "Edit Widget" };

const REF_ICONS: Record<string, any> = { link: LinkIcon, image: Image, video: Film, note: StickyNote, file: FileText, widget: Code };
const REF_ICON_COLORS: Record<string, string> = {
  note: "text-yellow-400",
  link: "text-blue-400",
  image: "text-emerald-400",
  video: "text-red-400",
  file: "text-orange-400",
  widget: "text-cyan-400",
};
const REF_TYPE_ORDER: RefType[] = ["note", "link", "image", "video", "file", "widget"];
const REF_TYPE_LABELS: Record<string, string> = { note: "Notes", link: "Links", image: "Images", video: "Videos", file: "Files", widget: "Widgets" };

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

const STATUS_OPTIONS = ["planning", "in_progress", "testing", "done"];

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
}
const STATUS_LABELS: Record<string, string> = {
  planning: "Planning", in_progress: "In Progress", testing: "Testing", done: "Done",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  medium: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
};

const PRIORITY_WEIGHT: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const sortTasks = (list: any[]) => [...list].sort((a, b) => {
  if (a.due_date && b.due_date) {
    const diff = new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    if (diff !== 0) return diff;
  } else if (a.due_date) return -1;
  else if (b.due_date) return 1;
  return (PRIORITY_WEIGHT[a.priority] ?? 2) - (PRIORITY_WEIGHT[b.priority] ?? 2);
});

const EXPENSE_CATEGORIES = ["General", "Materials", "Software", "Hardware", "Services", "Shipping", "Other"];

const stripHtml = (html: string) => html?.replace(/<[^>]*>/g, "").trim() || "";

export default function ProjectWorkspace() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [description, setDescription] = useState("");
  const [bullets, setBullets] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [editingGithub, setEditingGithub] = useState(false);
  const [githubDraft, setGithubDraft] = useState("");
  const [executionStrategy, setExecutionStrategy] = useState("");
  const [viewingRef, setViewingRef] = useState<any>(null);
  const [addRefType, setAddRefType] = useState<RefType | null>(null);
  const [editingRef, setEditingRef] = useState<any>(null);
  const [refForm, setRefForm] = useState({ title: "", url: "", description: "", widgetCode: "", widgetSummary: "", widgetInstructions: "" });
  const [refFile, setRefFile] = useState<File | null>(null);
  const [showLinkedIdea, setShowLinkedIdea] = useState(false);
  const [refViewMode, setRefViewMode] = useState<"grid" | "list">(
    () => (localStorage.getItem("ref-view-mode") as "grid" | "list") || "grid"
  );
  const [refSortMode, setRefSortMode] = useState<SortMode>(
    () => (localStorage.getItem("ref-sort-mode") as SortMode) || "newest"
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(`proj-ref-collapse-${id}`);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  // Task states
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [taskForm, setTaskForm] = useState({ title: "", description: "", priority: "medium", due_date: "", parent_task_id: "" });
  const [completedTasksOpen, setCompletedTasksOpen] = useState(false);
  const [viewingTask, setViewingTask] = useState<any>(null);

  // Expense states
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [editingExpense, setEditingExpense] = useState<any>(null);
  const [expenseForm, setExpenseForm] = useState({ title: "", description: "", amount: "", category: "General", date: format(new Date(), "yyyy-MM-dd"), vendor: "" });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  // Chatbot states
  const [chatHistory, setChatHistory] = useState<ChatMsg[]>([
    { role: "assistant", content: "👋 I'm your project assistant. I can help you:\n\n- **Create tasks & subtasks** with priorities and due dates\n- **Generate research notes** with book lists, resources, and recommendations\n- **Add reference links** (websites, tools, retailers, articles)\n- **Update your execution strategy**\n- **Create widgets** — mini web apps (calculators, converters, trackers, etc.)\n\nWhat would you like to work on?" }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isChatThinking, setIsChatThinking] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const [showReadme, setShowReadme] = useState(false);

  // Gotcha states
  const [showGotchaModal, setShowGotchaModal] = useState(false);
  const [gotchaSymptom, setGotchaSymptom] = useState("");
  const [gotchaModalState, setGotchaModalState] = useState<"define" | "autopsy" | "view">("define");
  const [viewingGotcha, setViewingGotcha] = useState<any>(null);
  const gotchaAnswerRef = useRef<HTMLTextAreaElement>(null);
  const [activeGotchaId, setActiveGotchaId] = useState<string | null>(null);
  const [gotchaAnswer, setGotchaAnswer] = useState("");
  const [gotchaQuestion, setGotchaQuestion] = useState("");
  const [isGotchaThinking, setIsGotchaThinking] = useState(false);
  const [gotchaChatHistory, setGotchaChatHistory] = useState<{ role: string; content: string }[]>([]);
  const [gotchaWhyRound, setGotchaWhyRound] = useState(0);
  const { pushAction } = useActionUndo();

  const { data: project, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      const rows = await getRows("projects");
      const row = rows.find((r) => r.id === id);
      if (!row) return null;
      let brainstorms: Record<string, unknown> | null = null;
      if (row.brainstorm_id) {
        const bRows = await getRows("brainstorms");
        const b = bRows.find((x) => x.id === row.brainstorm_id);
        if (b) {
          brainstorms = {
            id: b.id,
            title: b.title,
            idea_id: b.idea_id,
            compiled_description: b.compiled_description,
            bullet_breakdown: b.bullet_breakdown,
          };
        }
      }
      return { ...row, brainstorms };
    },
    enabled: !!id,
  });

  const { data: references = [] } = useQuery({
    queryKey: ["project-refs", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_references")
        .select("*")
        .eq("project_id", id!)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const brainstormId = project?.brainstorm_id;
  const { data: brainstormRefs = [] } = useQuery({
    queryKey: ["brainstorm-refs-for-project", brainstormId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brainstorm_references")
        .select("*")
        .eq("brainstorm_id", brainstormId!)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!brainstormId,
  });

  // Tasks query
  const { data: tasks = [] } = useQuery({
    queryKey: ["project-tasks", id],
    queryFn: async () => {
      const rows = await getRows("project_tasks", { project_id: id! });
      return [...rows].sort(
        (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
      );
    },
    enabled: !!id,
  });

  // Expenses query
  const { data: expenses = [] } = useQuery({
    queryKey: ["project-expenses", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_expenses")
        .select("*")
        .eq("project_id", id!)
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Gotchas query
  const { data: gotchas = [] } = useQuery({
    queryKey: ["project-gotchas", id],
    queryFn: async () => {
      const rows = await getRows("gotchas", { project_id: id! });
      return [...rows].sort(
        (a, b) =>
          new Date(String(b.created_at ?? 0)).getTime() -
          new Date(String(a.created_at ?? 0)).getTime(),
      );
    },
    enabled: !!id,
  });

  const totalExpenses = useMemo(() => expenses.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0), [expenses]);

  const activeTasks = useMemo(() => sortTasks(tasks.filter((t: any) => !t.completed)), [tasks]);
  const completedTasks = useMemo(() => sortTasks(tasks.filter((t: any) => t.completed)), [tasks]);

  useEffect(() => {
    if (project) {
      setTitleDraft(project.name);
      setDescription((project as any).compiled_description || "");
      setBullets((project as any).bullet_breakdown || "");
      setGithubUrl(project.github_repo_url || "");
      setExecutionStrategy((project as any).execution_strategy || "");
      const pch = (project as { chat_history?: ChatMsg[] }).chat_history;
      if (Array.isArray(pch) && pch.length > 0) {
        setChatHistory(pch as ChatMsg[]);
      }
    }
  }, [project]);

  // Auto-refresh when strategy is being generated in the background
  useEffect(() => {
    if (!executionStrategy && brainstormId) {
      const interval = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: ["project", id] });
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [executionStrategy, brainstormId, id, queryClient]);

  const githubParsed = useMemo(() => parseGitHubUrl(githubUrl), [githubUrl]);

  const { data: githubData } = useQuery({
    queryKey: ["github-repo", githubParsed?.owner, githubParsed?.repo],
    queryFn: async () => {
      const { owner, repo } = githubParsed!;
      const base = `https://api.github.com/repos/${owner}/${repo}`;
      const [repoRes, commitsRes] = await Promise.all([
        fetch(base),
        fetch(`${base}/commits?per_page=3`),
      ]);
      if (!repoRes.ok) throw new Error("Repo not found");
      const repoData = await repoRes.json();
      const commitsData = commitsRes.ok ? await commitsRes.json() : [];
      return { repo: repoData, commits: commitsData };
    },
    enabled: !!githubParsed,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const { data: readmeContent } = useQuery({
    queryKey: ["github-readme", githubParsed?.owner, githubParsed?.repo],
    queryFn: async () => {
      const { owner, repo } = githubParsed!;
      const mainRes = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/main/README.md`);
      if (mainRes.ok) return mainRes.text();
      const masterRes = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/master/README.md`);
      if (masterRes.ok) return masterRes.text();
      return null;
    },
    enabled: !!githubParsed && showReadme,
    staleTime: 5 * 60 * 1000,
  });

  const updateProject = useMutation({
    mutationFn: async (fields: Record<string, unknown>) => {
      await updateRow("projects", id!, {
        ...fields,
        updated_at: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", id] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-items"] });
    },
  });

  const deleteProject = useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString();
      if (project?.brainstorm_id) {
        await updateRow("brainstorms", String(project.brainstorm_id), {
          status: "active",
          updated_at: now,
        });
      }
      await updateRow("projects", id!, { deleted_at: now, updated_at: now });
    },
    onSuccess: () => {
      toast.success("Project moved to trash");
      queryClient.invalidateQueries({ queryKey: ["sidebar-items"] });
      navigate("/projects");
    },
  });

  const launchCampaign = useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString();
      const campaignRow = await insertRow("campaigns", {
        project_id: id!,
        user_id: user!.id,
        title: project?.name || "Untitled Campaign",
        category: (project as any)?.category ?? "",
        tags: (project as any)?.tags ?? [],
        chat_history: [],
        assistant_chat_history: [],
        interview_completed: false,
        status: "foundation_ip",
        created_at: now,
        updated_at: now,
        deleted_at: null,
        playbook: "",
        ip_strategy: "",
        marketing_links: "",
        marketing_plan: "",
        monetization_plan: "",
        operations_plan: "",
        primary_channel: "",
        revenue: "",
        sales_model: "",
        target_price: "",
        units_sold: "",
      });
      await updateRow("projects", id!, {
        campaign_id: campaignRow.id as string,
        updated_at: new Date().toISOString(),
      });
      return campaignRow;
    },
    onSuccess: (data) => {
      toast.success("Campaign launched!");
      queryClient.invalidateQueries({ queryKey: ["project", id] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-items"] });
      navigate(`/campaigns/${data.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Task mutations
  const addTask = useMutation({
    mutationFn: async (fields: any) => {
      const now = new Date().toISOString();
      await insertRow("project_tasks", {
        project_id: id!,
        user_id: user!.id,
        ...fields,
        sort_order: tasks.length,
        completed: fields.completed ?? false,
        created_at: now,
        updated_at: now,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-tasks", id] });
      setShowTaskDialog(false);
      setTaskForm({ title: "", description: "", priority: "medium", due_date: "", parent_task_id: "" });
    },
  });

  const updateTask = useMutation({
    mutationFn: async ({ taskId, fields }: { taskId: string; fields: Record<string, any> }) => {
      await updateRow("project_tasks", taskId, {
        ...fields,
        updated_at: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-tasks", id] });
      setEditingTask(null);
      setTaskForm({ title: "", description: "", priority: "medium", due_date: "", parent_task_id: "" });
    },
  });

  const deleteTask = useMutation({
    mutationFn: async (taskId: string) => {
      const task = tasks.find((t: any) => t.id === taskId);
      await deleteRow("project_tasks", taskId);
      return task;
    },
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: ["project-tasks", id] });
      if (task) {
        pushAction(
          `Delete task "${task.title}"`,
          async () => {
            await insertRow("project_tasks", {
              id: task.id,
              project_id: task.project_id,
              user_id: task.user_id,
              title: task.title,
              description: task.description || "",
              priority: task.priority,
              sort_order: task.sort_order,
              completed: task.completed,
              parent_task_id: task.parent_task_id ?? null,
              due_date: task.due_date ?? null,
              created_at: task.created_at ?? new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
            queryClient.invalidateQueries({ queryKey: ["project-tasks", id] });
          },
          async () => {
            await deleteRow("project_tasks", task.id);
            queryClient.invalidateQueries({ queryKey: ["project-tasks", id] });
          },
        );
      }
    },
  });

  const toggleTaskComplete = useMutation({
    mutationFn: async ({ taskId, completed }: { taskId: string; completed: boolean }) => {
      const now = new Date().toISOString();
      await updateRow("project_tasks", taskId, { completed, updated_at: now });
      const subtaskIds = (tasks || [])
        .filter((t: any) => t.parent_task_id === taskId)
        .map((t: any) => t.id as string);
      for (const sid of subtaskIds) {
        await updateRow("project_tasks", sid, { completed, updated_at: now });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project-tasks", id] }),
  });

  // Helper to toggle task with undo/redo support and cascade
  const handleToggleTask = (task: any, newCompleted: boolean) => {
    const subtasks = (tasks || []).filter((t: any) => t.parent_task_id === task.id);
    // Save previous states for undo
    const prevStates = [
      { id: task.id, completed: task.completed },
      ...subtasks.map((s: any) => ({ id: s.id, completed: s.completed })),
    ];
    const label = newCompleted ? `Complete: ${task.title}` : `Reopen: ${task.title}`;

    toggleTaskComplete.mutate({ taskId: task.id, completed: newCompleted });

    pushAction(
      label,
      async () => {
        const now = new Date().toISOString();
        for (const prev of prevStates) {
          await updateRow("project_tasks", prev.id as string, {
            completed: prev.completed,
            updated_at: now,
          });
        }
        queryClient.invalidateQueries({ queryKey: ["project-tasks", id] });
      },
      async () => {
        const now = new Date().toISOString();
        await updateRow("project_tasks", task.id, { completed: newCompleted, updated_at: now });
        const subIds = subtasks.map((s: any) => s.id as string);
        for (const sid of subIds) {
          await updateRow("project_tasks", sid, { completed: newCompleted, updated_at: now });
        }
        queryClient.invalidateQueries({ queryKey: ["project-tasks", id] });
      }
    );
  };

  const addExpense = useMutation({
    mutationFn: async (fields: any) => {
      const { error } = await supabase.from("project_expenses").insert({
        project_id: id!,
        user_id: user!.id,
        ...fields,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-expenses", id] });
      setShowExpenseDialog(false);
      setExpenseForm({ title: "", description: "", amount: "", category: "General", date: format(new Date(), "yyyy-MM-dd"), vendor: "" });
      setReceiptFile(null);
    },
  });

  const updateExpense = useMutation({
    mutationFn: async ({ expenseId, fields }: { expenseId: string; fields: Record<string, any> }) => {
      const { error } = await supabase.from("project_expenses").update(fields).eq("id", expenseId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-expenses", id] });
      setShowExpenseDialog(false);
      setEditingExpense(null);
      setExpenseForm({ title: "", description: "", amount: "", category: "General", date: format(new Date(), "yyyy-MM-dd"), vendor: "" });
    },
  });

  const deleteExpense = useMutation({
    mutationFn: async (expenseId: string) => {
      const expense = expenses.find((e: any) => e.id === expenseId);
      const { error } = await supabase.from("project_expenses").delete().eq("id", expenseId);
      if (error) throw error;
      return expense;
    },
    onSuccess: (expense) => {
      queryClient.invalidateQueries({ queryKey: ["project-expenses", id] });
      if (expense) {
        pushAction(
          `Delete expense "${expense.title}"`,
          async () => {
            await supabase.from("project_expenses").insert({
              id: expense.id, project_id: expense.project_id, user_id: expense.user_id,
              title: expense.title, description: expense.description || "", amount: expense.amount,
              category: expense.category, date: expense.date, vendor: expense.vendor,
              receipt_url: expense.receipt_url,
            });
            queryClient.invalidateQueries({ queryKey: ["project-expenses", id] });
          },
          async () => {
            await supabase.from("project_expenses").delete().eq("id", expense.id);
            queryClient.invalidateQueries({ queryKey: ["project-expenses", id] });
          },
        );
      }
    },
  });

  const addReference = useMutation({
    mutationFn: async ({ type, title, url, description, thumbnail_url }: { type: string; title: string; url?: string; description?: string; thumbnail_url?: string }) => {
      const { error } = await supabase.from("project_references").insert({
        project_id: id!,
        user_id: user!.id,
        type, title,
        url: url || "", description: description || "",
        sort_order: references.length,
        thumbnail_url: thumbnail_url || "",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-refs", id] });
      setAddRefType(null);
      setRefForm({ title: "", url: "", description: "", widgetCode: "", widgetSummary: "", widgetInstructions: "" });
      setRefFile(null);
    },
  });

  const updateReference = useMutation({
    mutationFn: async ({ refId, fields }: { refId: string; fields: Record<string, any> }) => {
      const { error } = await supabase.from("project_references").update(fields).eq("id", refId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-refs", id] });
      setEditingRef(null);
      setRefForm({ title: "", url: "", description: "", widgetCode: "", widgetSummary: "", widgetInstructions: "" });
    },
  });

  const deleteReference = useMutation({
    mutationFn: async (refId: string) => {
      const ref = references.find((r: any) => r.id === refId);
      const { error } = await supabase.from("project_references").delete().eq("id", refId);
      if (error) throw error;
      return ref;
    },
    onSuccess: (ref) => {
      queryClient.invalidateQueries({ queryKey: ["project-refs", id] });
      if (ref) {
        pushAction(
          `Delete reference "${ref.title}"`,
          async () => {
            await supabase.from("project_references").insert({
              id: ref.id, project_id: ref.project_id, user_id: ref.user_id,
              title: ref.title, type: ref.type, url: ref.url, description: ref.description,
              sort_order: ref.sort_order, thumbnail_url: ref.thumbnail_url,
            });
            queryClient.invalidateQueries({ queryKey: ["project-refs", id] });
          },
          async () => {
            await supabase.from("project_references").delete().eq("id", ref.id);
            queryClient.invalidateQueries({ queryKey: ["project-refs", id] });
          },
        );
      }
    },
  });

  const handleSaveTitle = () => {
    if (titleDraft.trim() && titleDraft !== project?.name) {
      updateProject.mutate({ name: titleDraft.trim() });
    }
    setEditingTitle(false);
  };

  const handleSaveGithubUrl = () => {
    if (githubDraft !== githubUrl) {
      setGithubUrl(githubDraft);
      updateProject.mutate({ github_repo_url: githubDraft });
    }
    setEditingGithub(false);
  };

  const handleRefClick = (ref: any) => {
    if (ref.type === "link" && ref.url) {
      const url = ref.url.match(/^https?:\/\//) ? ref.url : `https://${ref.url}`;
      window.open(url, "_blank", "noopener,noreferrer");
    } else if (ref.type === "file" && ref.url) {
      window.open(ref.url, "_blank", "noopener,noreferrer");
    } else if (ref.type === "note" || ref.type === "image" || ref.type === "video" || ref.type === "widget") {
      setViewingRef(ref);
    }
  };

  const handleEditRef = (ref: any) => {
    setEditingRef(ref);
    if (ref.type === "widget") {
      const wd = parseWidgetData(ref.description);
      setRefForm({ title: ref.title, url: ref.url || "", description: ref.description || "", widgetCode: wd.code, widgetSummary: wd.summary, widgetInstructions: wd.instructions });
    } else {
      setRefForm({ title: ref.title, url: ref.url || "", description: ref.description || "", widgetCode: "", widgetSummary: "", widgetInstructions: "" });
    }
  };

  const ensureHttps = (url: string) => {
    if (!url) return url;
    return url.match(/^https?:\/\//) ? url : `https://${url}`;
  };

  const handleAddRef = async () => {
    if (addRefType === "widget") {
      const encoded = encodeWidgetData(refForm.widgetCode, refForm.widgetSummary, refForm.widgetInstructions);
      addReference.mutate({ type: "widget", title: refForm.title, description: encoded });
      return;
    }
    if ((addRefType === "image" || addRefType === "file") && refFile) {
      const path = `${user!.id}/${id}/${Date.now()}-${refFile.name}`;
      const { error: uploadError } = await supabase.storage.from("brainstorm-references").upload(path, refFile);
      if (uploadError) { toast.error("Upload failed: " + uploadError.message); return; }
      const { data: urlData } = supabase.storage.from("brainstorm-references").getPublicUrl(path);
      addReference.mutate({
        type: addRefType,
        title: refForm.title || refFile.name,
        url: urlData.publicUrl,
        description: refForm.description,
        thumbnail_url: addRefType === "image" ? urlData.publicUrl : undefined,
      });
    } else if (addRefType === "link" || addRefType === "video") {
      const url = addRefType === "link" ? ensureHttps(refForm.url) : refForm.url;
      let thumbnail_url: string | null = null;
      if (addRefType === "video" && refForm.url) thumbnail_url = getVideoThumbnail(refForm.url);
      addReference.mutate({ type: addRefType, title: refForm.title, url, description: refForm.description, thumbnail_url: thumbnail_url || undefined });
    } else {
      addReference.mutate({ type: addRefType!, title: refForm.title, url: refForm.url, description: refForm.description });
    }
  };

  const handleAddExpense = async () => {
    let receiptUrl = "";
    if (receiptFile) {
      const path = `${user!.id}/${id}/receipts/${Date.now()}-${receiptFile.name}`;
      const { error: uploadError } = await supabase.storage.from("project-assets").upload(path, receiptFile);
      if (uploadError) { toast.error("Upload failed: " + uploadError.message); return; }
      const { data: urlData } = supabase.storage.from("project-assets").getPublicUrl(path);
      receiptUrl = urlData.publicUrl;
    }
    addExpense.mutate({
      title: expenseForm.title,
      description: expenseForm.description,
      amount: parseFloat(expenseForm.amount) || 0,
      category: expenseForm.category,
      date: expenseForm.date || undefined,
      receipt_url: receiptUrl,
      vendor: expenseForm.vendor,
    });
  };

  const toggleRefViewMode = (mode: "grid" | "list") => { setRefViewMode(mode); localStorage.setItem("ref-view-mode", mode); };
  const handleRefSortChange = (val: string) => { setRefSortMode(val as SortMode); localStorage.setItem("ref-sort-mode", val); };
  const toggleGroupCollapse = (type: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      localStorage.setItem(`proj-ref-collapse-${id}`, JSON.stringify([...next]));
      return next;
    });
  };

  const sortRefs = (refs: any[]) => {
    const sorted = [...refs];
    switch (refSortMode) {
      case "az": return sorted.sort((a, b) => a.title.localeCompare(b.title));
      case "za": return sorted.sort((a, b) => b.title.localeCompare(a.title));
      case "newest": return sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      case "oldest": return sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      default: return sorted;
    }
  };

  const getRefThumbnail = (ref: any): string | null => {
    if (ref.thumbnail_url) return ref.thumbnail_url;
    if (ref.type === "image" && ref.url) return ref.url;
    if (ref.type === "video" && ref.url) return getVideoThumbnail(ref.url);
    return null;
  };

  const groupedRefs = REF_TYPE_ORDER.map(type => ({
    type,
    label: REF_TYPE_LABELS[type],
    items: sortRefs(references.filter((r: any) => r.type === type)),
  })).filter(g => g.items.length > 0);

  const isLocked = !!(project as any)?.campaign_id;
  const projectCategory = (project as any)?.category;
  const projectTags: string[] = (project as any)?.tags || [];
  const categoryBadgeClass = projectCategory ? CATEGORY_COLORS[projectCategory] || "bg-secondary text-secondary-foreground" : "";

  const linkedBrainstorm = (project as any)?.brainstorms;
  const linkedIdeaId = linkedBrainstorm?.idea_id;

  const { data: linkedIdeaData } = useQuery({
    queryKey: ["linked-idea-for-project", linkedIdeaId],
    queryFn: async () => {
      const rows = await getRows("ideas", { id: linkedIdeaId! });
      return rows[0] ?? null;
    },
    enabled: !!linkedIdeaId,
  });

  // GitHub Pages link
  const githubPagesUrl = useMemo(() => {
    if (!githubData) return null;
    if (githubData.repo.homepage) return githubData.repo.homepage;
    if (githubData.repo.has_pages) return `https://${githubParsed?.owner}.github.io/${githubParsed?.repo}`;
    return null;
  }, [githubData, githubParsed]);

  // Chatbot handler
  const handleChatSubmit = async () => {
    if (!chatInput.trim() || isChatThinking) return;
    const userMsg: ChatMsg = { role: "user", content: chatInput.trim() };
    const newHistory = [...chatHistory, userMsg];
    setChatHistory(newHistory);
    setChatInput("");
    setIsChatThinking(true);

    // If project is locked, skip all actions
    const skipActions = isLocked;

    try {
      // Gather context
      const brainstormNotes = brainstormRefs
        .filter((r: any) => r.type === "note")
        .map((r: any) => `${r.title}: ${stripHtml(r.description || "")}`)
        .join("\n");
      const projectNotes = references
        .filter((r: any) => r.type === "note")
        .map((r: any) => `${r.title}: ${stripHtml(r.description || "")}`)
        .join("\n");
      const allNotes = [brainstormNotes, projectNotes].filter(Boolean).join("\n");
      const tasksList = tasks.map((t: any) => `[${t.completed ? "✓" : " "}] ${t.title} (${t.priority}${t.due_date ? ", due " + t.due_date : ""})`).join("\n");
      const widgetsList = references
        .filter((r: any) => r.type === "widget")
        .map((r: any) => {
          const wd = parseWidgetData(r.description);
          return `${r.title}: ${wd.summary || "(no summary)"} [code length: ${wd.code.length} chars]`;
        }).join("\n");

      const data = await projectChat({
        messages: newHistory,
        context: {
          title: project?.name || "",
          description,
          bullet_breakdown: bullets,
          execution_strategy: executionStrategy,
          notes: allNotes,
          tasks: tasksList,
          widgets: widgetsList,
        },
      });

      // Process actions (skip if locked)
      let createdNoteId: string | null = null;
      let createdNoteTitle: string | null = null;
      let createdWidgetId: string | null = null;
      let createdWidgetTitle: string | null = null;
      const createdLinks: { id: string; title: string }[] = [];
      if (data.actions && data.actions.length > 0 && !skipActions) {
        // Separate parent tasks and subtasks for two-pass insertion
        const taskActions = data.actions.filter((a: any) => a.action === "add_task");
        const parentTasks = taskActions.filter((a: any) => !a.parent_task_id);
        const subtasks = taskActions.filter((a: any) => !!a.parent_task_id);
        const otherActions = data.actions.filter((a: any) => a.action !== "add_task");

        // Pass 1: Insert parent tasks and build title->id mapping
        const titleToIdMap = new Map<string, string>();
        for (const action of parentTasks) {
          const now = new Date().toISOString();
          const taskRow = await insertRow("project_tasks", {
            project_id: id!,
            user_id: user!.id,
            title: action.title,
            description: action.description || "",
            priority: action.priority || "medium",
            due_date: action.due_date || null,
            parent_task_id: null,
            sort_order: tasks.length,
            completed: false,
            created_at: now,
            updated_at: now,
          });
          if (taskRow.id) titleToIdMap.set(action.title, taskRow.id as string);
          toast.success(`Task added: ${action.title}`);
        }

        // Pass 2: Insert subtasks, resolving parent_task_id by title
        for (const action of subtasks) {
          // Try to resolve parent_task_id: first check if it's a real UUID in existing tasks, then try title match
          let resolvedParentId = action.parent_task_id;
          const existingTask = tasks.find((t: any) => t.id === action.parent_task_id);
          if (!existingTask) {
            // Try matching by title from just-created parents
            const fromMap = titleToIdMap.get(action.parent_task_id);
            if (fromMap) {
              resolvedParentId = fromMap;
            } else {
              // Try fuzzy match - maybe the AI used a slightly different title
              for (const [title, taskId] of titleToIdMap.entries()) {
                if (title.toLowerCase().includes(action.parent_task_id.toLowerCase()) || action.parent_task_id.toLowerCase().includes(title.toLowerCase())) {
                  resolvedParentId = taskId;
                  break;
                }
              }
            }
          }
          const now = new Date().toISOString();
          await insertRow("project_tasks", {
            project_id: id!,
            user_id: user!.id,
            title: action.title,
            description: action.description || "",
            priority: action.priority || "medium",
            due_date: action.due_date || null,
            parent_task_id: resolvedParentId,
            sort_order: tasks.length,
            completed: false,
            created_at: now,
            updated_at: now,
          });
          toast.success(`Subtask added: ${action.title}`);
        }

        if (taskActions.length > 0) {
          queryClient.invalidateQueries({ queryKey: ["project-tasks", id] });
        }

        // Process other actions
        for (const action of otherActions) {
          if (action.action === "update_strategy" && action.strategy) {
            setExecutionStrategy(action.strategy);
            await updateRow("projects", id!, {
              execution_strategy: action.strategy,
              updated_at: new Date().toISOString(),
            });
            queryClient.invalidateQueries({ queryKey: ["project", id] });
            toast.success("Execution strategy updated");
          } else if (action.action === "create_note" && action.title) {
            const { data: noteData } = await supabase.from("project_references").insert({
              project_id: id!,
              user_id: user!.id,
              type: "note",
              title: action.title,
              description: action.content || "",
              sort_order: references.length,
            }).select("id").single();
            createdNoteId = noteData?.id || null;
            createdNoteTitle = action.title;
            queryClient.invalidateQueries({ queryKey: ["project-refs", id] });
            toast.success(`Note created: ${action.title}`);
          } else if (action.action === "create_widget" && action.title) {
            const widgetDesc = encodeWidgetData(action.code || "", action.summary || "", action.instructions || "");
            const { data: widgetData } = await supabase.from("project_references").insert({
              project_id: id!,
              user_id: user!.id,
              type: "widget",
              title: action.title,
              description: widgetDesc,
              sort_order: references.length,
            }).select("id").single();
            createdWidgetId = widgetData?.id || null;
            createdWidgetTitle = action.title;
            queryClient.invalidateQueries({ queryKey: ["project-refs", id] });
            toast.success(`Widget created: ${action.title}`);
          } else if (action.action === "update_widget" && action.title) {
            const existingWidget = references.find((r: any) => r.type === "widget" && r.title.toLowerCase() === action.title.toLowerCase());
            if (existingWidget) {
              const existingData = parseWidgetData(existingWidget.description);
              const updatedDesc = encodeWidgetData(action.code || existingData.code, action.summary || existingData.summary, action.instructions || existingData.instructions);
              const updateFields: Record<string, any> = { description: updatedDesc };
              if (action.new_title) updateFields.title = action.new_title;
              await supabase.from("project_references").update(updateFields).eq("id", existingWidget.id);
              queryClient.invalidateQueries({ queryKey: ["project-refs", id] });
              toast.success(`Widget updated: ${action.new_title || action.title}`);
            }
          } else if (action.action === "create_link" && action.title && action.url) {
            const { data: linkData } = await supabase.from("project_references").insert({
              project_id: id!,
              user_id: user!.id,
              type: "link",
              title: action.title,
              url: action.url.match(/^https?:\/\//) ? action.url : `https://${action.url}`,
              description: action.description || "",
              sort_order: references.length,
            }).select("id").single();
            if (linkData?.id) createdLinks.push({ id: linkData.id, title: action.title });
            queryClient.invalidateQueries({ queryKey: ["project-refs", id] });
          }
        }
        // Consolidated toast for links
        if (createdLinks.length === 1) toast.success(`Link added: ${createdLinks[0].title}`);
        else if (createdLinks.length > 1) toast.success(`${createdLinks.length} links added`);
      }

      const assistantMsg: ChatMsg = {
        role: "assistant",
        content: data.message || "Done.",
        ...(createdNoteId ? { noteId: createdNoteId, noteTitle: createdNoteTitle! } : {}),
        ...(createdWidgetId ? { widgetId: createdWidgetId, widgetTitle: createdWidgetTitle! } : {}),
        ...(createdLinks.length > 0 ? { links: createdLinks } : {}),
      };
      const nextChat = [...newHistory, assistantMsg];
      setChatHistory(nextChat);
      await updateRow("projects", id!, {
        chat_history: nextChat,
        updated_at: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ["project", id] });
    } catch (e: unknown) {
      const err = e as Error & { code?: string };
      if (err.code === "NO_API_KEY") openGeminiSettings();
      toast.error("Chat failed: " + err.message);
    } finally {
      setIsChatThinking(false);
      setTimeout(() => chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" }), 100);
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleChatSubmit();
    }
  };

  // Task row renderer
  const renderTaskRow = (task: any, indent = false) => (
    <div
      key={task.id}
      className={`flex items-center gap-3 p-2.5 rounded-lg border border-border/50 bg-card/50 transition-colors hover:border-primary/20 ${task.completed ? "opacity-60" : ""} ${indent ? "ml-6" : ""}`}
    >
      {!isLocked && (
        <Checkbox
          checked={task.completed}
          onCheckedChange={(checked) => handleToggleTask(task, !!checked)}
        />
      )}
      <div
        className="flex-1 min-w-0 cursor-pointer"
        onClick={() => setViewingTask(task)}
      >
        <p className={`text-sm font-medium ${task.completed ? "line-through text-muted-foreground" : ""}`}>{task.title}</p>
        {task.description && <p className="text-xs text-muted-foreground line-clamp-1">{task.description}</p>}
      </div>
      <TaskCommentButton taskId={task.id} taskType="project" />
      <Badge className={`text-[10px] border ${PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium}`}>
        {task.priority}
      </Badge>
      {task.due_date && (
        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {format(new Date(task.due_date), "MMM d")}
        </span>
      )}
      {!isLocked && (
        <div className="flex items-center gap-0.5 shrink-0">
          {!task.completed && !indent && (
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary" title="Add subtask" onClick={() => {
              setEditingTask(null);
              setTaskForm({ title: "", description: "", priority: "medium", due_date: "", parent_task_id: task.id });
              setShowTaskDialog(true);
            }}>
              <Plus className="h-3 w-3" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary" onClick={() => {
            setEditingTask(task);
            setTaskForm({ title: task.title, description: task.description || "", priority: task.priority, due_date: task.due_date || "", parent_task_id: (task as any).parent_task_id || "" });
            setShowTaskDialog(true);
          }}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => deleteTask.mutate(task.id)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );

  // Render tasks with subtasks grouped under parents
  const renderTaskList = (taskList: any[]) => {
    const topLevel = taskList.filter((t: any) => !(t as any).parent_task_id);
    const subtaskMap = new Map<string, any[]>();
    taskList.filter((t: any) => (t as any).parent_task_id).forEach((t: any) => {
      const pid = (t as any).parent_task_id;
      if (!subtaskMap.has(pid)) subtaskMap.set(pid, []);
      subtaskMap.get(pid)!.push(t);
    });

    return topLevel.flatMap((task: any) => {
      const subs = sortTasks(subtaskMap.get(task.id) || []);
      return [renderTaskRow(task, false), ...subs.map((s: any) => renderTaskRow(s, true))];
    });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Skeleton className="h-8 w-8" /></div>;
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground">Project not found</p>
        <Button variant="link" onClick={() => navigate("/projects")}>Back to projects</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate("/projects")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>

        {editingTitle && !isLocked ? (
          <Input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={handleSaveTitle}
            onKeyDown={(e) => e.key === "Enter" && handleSaveTitle()}
            className="max-w-sm text-xl font-bold"
            autoFocus
          />
        ) : (
          <h1
            className={`text-2xl font-bold ${!isLocked ? "cursor-pointer hover:text-primary" : ""} transition-colors`}
            onClick={() => !isLocked && setEditingTitle(true)}
          >
            {project.name}
          </h1>
        )}

        {!(project as any).campaign_id && (
          <Select value={project.status} onValueChange={(val) => updateProject.mutate({ status: val })}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(s => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="ml-auto flex items-center gap-2">
          {project.status === "done" && !(project as any).campaign_id && (
            <Button
              className="gap-2"
              onClick={() => launchCampaign.mutate()}
              disabled={launchCampaign.isPending}
            >
              <Rocket className="h-4 w-4" /> Launch Campaign
            </Button>
          )}
          {isLocked ? (
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 border gap-1">
              <Rocket className="h-3 w-3" /> Launched
            </Badge>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="gap-2">
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Move to trash?</AlertDialogTitle>
                  <AlertDialogDescription>This will move the project to trash. The linked brainstorm will be unlocked.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteProject.mutate()}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Created date + badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">
          Created {format(new Date(project.created_at), "MMM d, yyyy 'at' h:mm a")}
        </p>
        {projectCategory && (
          <Badge className={`text-xs border ${categoryBadgeClass}`}>{projectCategory}</Badge>
        )}
        {linkedIdeaId && (
          <Badge
            variant="outline"
            className="text-xs gap-1 cursor-pointer hover:bg-accent transition-colors"
            onClick={() => setShowLinkedIdea(true)}
          >
            <Lightbulb className="h-3 w-3 text-yellow-400" /> Linked Idea
          </Badge>
        )}
        {linkedBrainstorm && (
          <Badge
            variant="outline"
            className="text-xs gap-1 cursor-pointer hover:bg-accent transition-colors"
            onClick={() => navigate(`/brainstorms/${linkedBrainstorm.id}`)}
          >
            <Brain className="h-3 w-3 text-pink-400" /> Linked Brainstorm
          </Badge>
        )}
        {(project as any).campaign_id && (
          <Badge
            variant="outline"
            className="text-xs gap-1 cursor-pointer hover:bg-accent transition-colors"
            onClick={() => navigate(`/campaigns/${(project as any).campaign_id}`)}
          >
            <Megaphone className="h-3 w-3 text-orange-400" /> Linked Campaign
          </Badge>
        )}
      </div>

      {isLocked && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          This project is locked because it has an active campaign. Delete the linked campaign to unlock editing.
        </div>
      )}

      <Separator />

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left column */}
        <div className="lg:col-span-3 space-y-6">
          {/* Description - always shown */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Description</p>
            <EditableMarkdown
              value={description}
              onChange={setDescription}
              onSave={() => updateProject.mutate({ compiled_description: description })}
              placeholder="Project description…"
              minHeight="100px"
              readOnly={isLocked}
            />
          </div>

          {/* Execution Strategy */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Execution Strategy</p>
            {!executionStrategy && brainstormId ? (
              <Card className="border-dashed border-2 border-primary/30 bg-primary/5">
                <CardContent className="flex flex-col items-center justify-center py-8 gap-3">
                  <Loader2 className="h-8 w-8 text-primary animate-spin" />
                  <div className="text-center">
                    <p className="font-semibold text-sm">Generating Execution Strategy…</p>
                    <p className="text-xs text-muted-foreground mt-1">Your strategy is being created based on your brainstorm</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <EditableMarkdown
                value={executionStrategy}
                onChange={setExecutionStrategy}
                onSave={() => updateProject.mutate({ execution_strategy: executionStrategy } as any)}
                placeholder="Plan your execution strategy here…"
                minHeight="80px"
                readOnly={isLocked}
              />
            )}
          </div>

          {/* Project AI Chatbot - now floating */}

          {/* Tasks Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-primary" />
                <h2 className="text-lg font-semibold">Tasks</h2>
                <Badge variant="secondary" className="text-[10px]">
                  {completedTasks.length}/{tasks.length}
                </Badge>
              </div>
              {!isLocked && (
                <Button variant="outline" size="sm" className="gap-1 h-8" onClick={() => { setEditingTask(null); setTaskForm({ title: "", description: "", priority: "medium", due_date: "", parent_task_id: "" }); setShowTaskDialog(true); }}>
                  <Plus className="h-3 w-3" /> Add Task
                </Button>
              )}
            </div>
            {tasks.length > 0 && (
              <div className="flex items-center gap-3">
                <Progress value={tasks.length > 0 ? (completedTasks.length / tasks.length) * 100 : 0} className="h-2 flex-1" />
                <span className="text-xs text-muted-foreground whitespace-nowrap">{Math.round((completedTasks.length / tasks.length) * 100)}%</span>
              </div>
            )}

            {tasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-8">
                <CheckSquare className="mb-2 h-6 w-6 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No tasks yet</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {renderTaskList(activeTasks)}

                {completedTasks.length > 0 && (
                  <Collapsible open={completedTasksOpen} onOpenChange={setCompletedTasksOpen}>
                    <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-1.5 hover:text-primary transition-colors text-muted-foreground">
                      {completedTasksOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      <span className="text-xs font-medium">Completed ({completedTasks.length})</span>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-1.5 mt-1">
                      {renderTaskList(completedTasks)}
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            )}
          </div>

          {/* Gotchas */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <h2 className="text-lg font-semibold">Gotchas</h2>
                <Badge variant="secondary" className="text-[10px]">{gotchas.filter((g: any) => g.status !== "resolved").length}</Badge>
              </div>
              {!isLocked && (
                <Button variant="outline" size="sm" className="gap-1 h-8" onClick={() => { setGotchaSymptom(""); setGotchaModalState("define"); setGotchaChatHistory([]); setGotchaQuestion(""); setGotchaWhyRound(0); setActiveGotchaId(null); setShowGotchaModal(true); }}>
                  <Plus className="h-3 w-3" /> Add Gotcha
                </Button>
              )}
            </div>
            {gotchas.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-8">
                <AlertTriangle className="mb-2 h-6 w-6 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No gotchas tracked</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {gotchas.map((g: any) => (
                  <div key={g.id} className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${g.status === "resolved" ? "border-emerald-500/30 bg-emerald-500/5 opacity-70" : g.status === "investigating" ? "border-amber-500/30 bg-amber-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
                    <AlertTriangle className={`h-4 w-4 shrink-0 ${g.status === "resolved" ? "text-emerald-400" : "text-amber-400"}`} />
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => {
                      setViewingGotcha(g);
                      setGotchaSymptom(g.symptom);
                      setGotchaModalState("view");
                      setGotchaChatHistory((g.chat_history as any[]) || []);
                      setShowGotchaModal(true);
                    }}>
                      <p className="text-sm font-medium hover:text-primary transition-colors">{g.symptom}</p>
                      {g.root_cause && <p className="text-xs text-muted-foreground mt-0.5">{g.root_cause}</p>}
                    </div>
                    <Badge variant="secondary" className="text-[10px]">{g.status}</Badge>
                    {g.status === "active" && !isLocked && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
                        setActiveGotchaId(g.id); setGotchaSymptom(g.symptom); setGotchaModalState("autopsy");
                        const history = (g.chat_history as any[]) || [];
                        setGotchaChatHistory(history); setGotchaWhyRound(history.filter((m: any) => m.role === "user").length);
                        if (history.length === 0) {
                          setIsGotchaThinking(true); setShowGotchaModal(true);
                          gotchaChat({ symptom: g.symptom, chat_history: [{ role: "user", content: `The gotcha is: ${g.symptom}` }] })
                            .then((data) => { setGotchaQuestion(data?.next_question || data?.message || "Why did this happen?"); setIsGotchaThinking(false); })
                            .catch(() => { setGotchaQuestion("Why did this happen?"); setIsGotchaThinking(false); });
                        } else {
                          const lastAssistant = [...history].reverse().find((m: any) => m.role === "assistant");
                          setGotchaQuestion(lastAssistant?.content || "Why did this happen?");
                          setShowGotchaModal(true);
                        }
                      }}>Continue Autopsy</Button>
                    )}
                    {!isLocked && (
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={async () => {
                        await deleteRow("gotchas", g.id as string);
                        queryClient.invalidateQueries({ queryKey: ["project-gotchas", id] });
                      }}><X className="h-3 w-3" /></Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Resources moved to right column */}
        </div>

        {/* Right column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Tags */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Tags</p>
            {projectTags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {projectTags.map((tag: string) => (
                  <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/60 italic">No tags</p>
            )}
          </div>

          {/* Bullet Breakdown */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Bullet Breakdown</p>
            <EditableMarkdown
              value={bullets}
              onChange={setBullets}
              onSave={() => updateProject.mutate({ bullet_breakdown: bullets })}
              placeholder="- Key point 1&#10;- Key point 2"
              minHeight="80px"
              readOnly={isLocked}
            />
          </div>

          {/* Brainstorm References */}
          {brainstormRefs.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Brainstorm References</p>
              <div className="space-y-1.5">
                {brainstormRefs.map((ref: any) => {
                  const Icon = REF_ICONS[ref.type] || StickyNote;
                  const iconColor = REF_ICON_COLORS[ref.type] || "text-muted-foreground";
                  const previewText = ref.type === "note" ? stripHtml(ref.description) : ref.description;
                  return (
                    <div
                      key={ref.id}
                      className="flex items-center gap-2 p-1.5 rounded border border-border/30 bg-card/30 text-xs cursor-pointer hover:border-primary/30 transition-colors"
                      onClick={() => handleRefClick(ref)}
                    >
                      <Icon className={`h-3.5 w-3.5 ${iconColor} shrink-0`} />
                      <span className="truncate flex-1">{ref.title}</span>
                      {previewText && (
                        <span className="text-muted-foreground truncate max-w-[150px] hidden sm:inline">{previewText}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* GitHub Repository */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">GitHub Repository</p>
          {editingGithub && !isLocked ? (
              <Input
                value={githubDraft}
                onChange={(e) => setGithubDraft(e.target.value)}
                onBlur={handleSaveGithubUrl}
                onKeyDown={(e) => e.key === "Enter" && handleSaveGithubUrl()}
                placeholder="https://github.com/…"
                className="text-sm"
                autoFocus
              />
            ) : githubUrl ? (
              <p
                className={`text-sm text-primary truncate ${!isLocked ? "hover:underline cursor-pointer" : ""}`}
                onClick={() => !isLocked && (() => { setGithubDraft(githubUrl); setEditingGithub(true); })()}
              >
                {githubUrl}
              </p>
            ) : (
              <p
                className={`text-sm text-muted-foreground/60 italic ${!isLocked ? "cursor-pointer hover:text-muted-foreground" : ""}`}
                onClick={() => !isLocked && (() => { setGithubDraft(""); setEditingGithub(true); })()}
              >
                {isLocked ? "No GitHub URL" : "Click to add GitHub URL…"}
              </p>
            )}
          </div>

          {/* GitHub Activity Widget */}
          {githubData && (
            <Card className="border-border/50 bg-card/50">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Github className="h-4 w-4 text-muted-foreground" />
                  <a href={githubUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold hover:text-primary transition-colors truncate">
                    {githubData.repo.full_name}
                  </a>
                  {githubPagesUrl && (
                    <a href={githubPagesUrl} target="_blank" rel="noopener noreferrer" className="ml-auto">
                      <Badge variant="outline" className="text-[10px] gap-1 cursor-pointer hover:bg-accent">
                        <ExternalLink className="h-2.5 w-2.5" /> View Site
                      </Badge>
                    </a>
                  )}
                </div>
                {githubData.repo.description && (
                  <p className="text-xs text-muted-foreground">{githubData.repo.description}</p>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-xs gap-1"><Star className="h-3 w-3" /> {githubData.repo.stargazers_count}</Badge>
                  <Badge variant="secondary" className="text-xs gap-1"><GitFork className="h-3 w-3" /> {githubData.repo.forks_count}</Badge>
                  <Badge variant="secondary" className="text-xs gap-1"><AlertCircle className="h-3 w-3" /> {githubData.repo.open_issues_count} issues</Badge>
                </div>
                {githubData.commits.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Recent Commits</p>
                    <div className="space-y-1.5">
                      {githubData.commits.map((c: any) => (
                        <div key={c.sha} className="flex items-start gap-2 text-xs">
                          <GitCommit className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate">{c.commit.message.split("\n")[0]}</p>
                            <p className="text-muted-foreground/60">{formatDistanceToNow(new Date(c.commit.author.date), { addSuffix: true })}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <Collapsible open={showReadme} onOpenChange={setShowReadme}>
                  <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                    {showReadme ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    README
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    {readmeContent ? (
                      <div className="rounded-lg bg-muted/30 border border-border/30 p-3 max-h-[400px] overflow-y-auto">
                        <div className="prose prose-invert prose-sm max-w-none [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-0.5 [&_p]:my-1.5">
                          <ReactMarkdown components={markdownComponents}>{readmeContent}</ReactMarkdown>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground/60 italic">Loading README…</p>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>
          )}
          {githubParsed && !githubData && (
            <p className="text-xs text-muted-foreground/60 italic">Could not fetch repository data</p>
          )}

          {/* Resources */}
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-lg font-semibold">Resources</h2>
              <div className="flex items-center gap-1">
                <Select value={refSortMode} onValueChange={handleRefSortChange}>
                  <SelectTrigger className="h-8 w-[130px] text-xs">
                    <ArrowUpDown className="h-3 w-3 mr-1" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest</SelectItem>
                    <SelectItem value="oldest">Oldest</SelectItem>
                    <SelectItem value="az">A → Z</SelectItem>
                    <SelectItem value="za">Z → A</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" className={`h-8 w-8 ${refViewMode === "grid" ? "text-primary" : ""}`} onClick={() => toggleRefViewMode("grid")}>
                  <Grid3X3 className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className={`h-8 w-8 ${refViewMode === "list" ? "text-primary" : ""}`} onClick={() => toggleRefViewMode("list")}>
                  <List className="h-3.5 w-3.5" />
                </Button>
                {!isLocked && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1 h-8">
                        <Plus className="h-3 w-3" /> Add
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-44 p-1" align="end">
                      {(["note", "link", "image", "video", "file", "widget"] as RefType[]).map((type) => {
                        const Icon = REF_ICONS[type];
                        const iconColor = REF_ICON_COLORS[type];
                        return (
                          <button key={type} onClick={() => setAddRefType(type)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent capitalize">
                            <Icon className={`h-4 w-4 ${iconColor}`} /> {type}
                          </button>
                        );
                      })}
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>

            {references.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12">
                <StickyNote className="mb-3 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No resources yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {groupedRefs.map((group) => {
                  const GroupIcon = REF_ICONS[group.type] || StickyNote;
                  const groupIconColor = REF_ICON_COLORS[group.type] || "text-muted-foreground";
                  const isGroupCollapsed = collapsedGroups.has(group.type);
                  return (
                    <Collapsible key={group.type} open={!isGroupCollapsed} onOpenChange={() => toggleGroupCollapse(group.type)}>
                      <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-1 hover:text-primary transition-colors">
                        {isGroupCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        <GroupIcon className={`h-3.5 w-3.5 ${groupIconColor}`} />
                        <span className="text-sm font-medium">{group.label}</span>
                        <Badge variant="secondary" className="text-[10px] ml-1">{group.items.length}</Badge>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-2">
                        <div className={refViewMode === "grid" ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : "space-y-2"}>
                          {group.items.map((ref: any) => {
                            const Icon = REF_ICONS[ref.type] || StickyNote;
                            const iconColor = REF_ICON_COLORS[ref.type] || "text-muted-foreground";
                            const thumbnail = getRefThumbnail(ref);
                            const previewText = ref.type === "note" ? stripHtml(ref.description) : ref.type === "widget" ? parseWidgetData(ref.description).summary : ref.description;

                            if (refViewMode === "list") {
                              return (
                                <HoverCard key={ref.id} openDelay={300} closeDelay={100}>
                                  <HoverCardTrigger asChild>
                                    <div className="flex items-center gap-3 p-2 rounded-lg border border-border/50 bg-card/50 cursor-pointer hover:border-primary/30 transition-colors" onClick={() => handleRefClick(ref)}>
                                      <Icon className={`h-4 w-4 ${iconColor} shrink-0`} />
                                      <span className="text-sm font-medium truncate flex-1">{ref.title}</span>
                                      {previewText && (
                                        <span className="text-xs text-muted-foreground truncate max-w-[200px] hidden sm:inline">{previewText}</span>
                                      )}
                                      {!isLocked && (
                                        <div className="flex items-center gap-0.5 shrink-0">
                                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary" onClick={(e) => { e.stopPropagation(); handleEditRef(ref); }}>
                                            <Pencil className="h-3 w-3" />
                                          </Button>
                                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); deleteReference.mutate(ref.id); }}>
                                            <X className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  </HoverCardTrigger>
                                  <HoverCardContent className="w-72 p-3" side="top">
                                    <div className="flex items-start gap-2">
                                      <Icon className={`h-4 w-4 ${iconColor} shrink-0 mt-0.5`} />
                                      <div className="min-w-0">
                                        <p className="text-sm font-medium">{ref.title}</p>
                                        {previewText && <p className="text-xs text-muted-foreground mt-1 line-clamp-4">{previewText}</p>}
                                        {ref.type === "link" && ref.url && <p className="text-xs text-blue-400 truncate mt-1">{ref.url}</p>}
                                      </div>
                                    </div>
                                  </HoverCardContent>
                                </HoverCard>
                              );
                            }

                            return (
                              <HoverCard key={ref.id} openDelay={300} closeDelay={100}>
                                <HoverCardTrigger asChild>
                                  <Card className="border-border/50 bg-card/50 cursor-pointer hover:border-primary/30 transition-colors" onClick={() => handleRefClick(ref)}>
                                    <CardContent className="p-3">
                                      <div className="flex items-start gap-3">
                                        {thumbnail ? (
                                          <div className="h-12 w-16 rounded overflow-hidden shrink-0 bg-muted">
                                            <img src={thumbnail} alt="" className="h-full w-full object-cover" />
                                          </div>
                                        ) : (
                                          <div className="h-12 w-16 rounded bg-muted/50 flex items-center justify-center shrink-0">
                                            <Icon className={`h-5 w-5 ${iconColor}/50`} />
                                          </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-medium truncate">{ref.title}</p>
                                          {previewText && (
                                            <p className="text-xs text-muted-foreground line-clamp-2">{previewText}</p>
                                          )}
                                        </div>
                                        {!isLocked && (
                                          <div className="flex flex-col gap-0.5 shrink-0">
                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary" onClick={(e) => { e.stopPropagation(); handleEditRef(ref); }}>
                                              <Pencil className="h-3 w-3" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); deleteReference.mutate(ref.id); }}>
                                              <X className="h-3 w-3" />
                                            </Button>
                                          </div>
                                        )}
                                      </div>
                                    </CardContent>
                                  </Card>
                                </HoverCardTrigger>
                                <HoverCardContent className="w-72 p-3" side="top">
                                  <div className="flex items-start gap-2">
                                    <Icon className={`h-4 w-4 ${iconColor} shrink-0 mt-0.5`} />
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium">{ref.title}</p>
                                      {previewText && <p className="text-xs text-muted-foreground mt-1 line-clamp-4">{previewText}</p>}
                                      {ref.type === "link" && ref.url && <p className="text-xs text-blue-400 truncate mt-1">{ref.url}</p>}
                                    </div>
                                  </div>
                                </HoverCardContent>
                              </HoverCard>
                            );
                          })}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            )}
          </div>

          {/* Expenses */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" />
                <h2 className="text-lg font-semibold">Expenses</h2>
                <Badge variant="secondary" className="text-[10px]">${totalExpenses.toFixed(2)}</Badge>
              </div>
              {!isLocked && (
                <Button variant="outline" size="sm" className="gap-1 h-8" onClick={() => { setEditingExpense(null); setExpenseForm({ title: "", description: "", amount: "", category: "General", date: format(new Date(), "yyyy-MM-dd"), vendor: "" }); setShowExpenseDialog(true); }}>
                  <Plus className="h-3 w-3" /> Add Expense
                </Button>
              )}
            </div>

            {expenses.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-8">
                <DollarSign className="mb-2 h-6 w-6 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No expenses tracked</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {expenses.map((expense: any) => (
                  <div key={expense.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-border/50 bg-card/50 transition-colors hover:border-primary/20">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{expense.title}</p>
                      {expense.vendor && <p className="text-xs text-muted-foreground">{(expense as any).vendor}</p>}
                      {expense.description && <p className="text-xs text-muted-foreground line-clamp-1">{expense.description}</p>}
                    </div>
                    {expense.receipt_url && (
                      <a href={expense.receipt_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                        <Receipt className="h-4 w-4 text-muted-foreground hover:text-primary shrink-0" />
                      </a>
                    )}
                    <Badge variant="secondary" className="text-[10px]">{expense.category}</Badge>
                    <span className="text-sm font-semibold tabular-nums">${Number(expense.amount).toFixed(2)}</span>
                    {expense.date && (
                      <span className="text-[10px] text-muted-foreground">{format(new Date(expense.date), "MMM d")}</span>
                    )}
                    {!isLocked && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary" onClick={() => {
                          setEditingExpense(expense);
                          setExpenseForm({ title: expense.title, description: expense.description || "", amount: String(expense.amount), category: expense.category || "General", date: expense.date || "", vendor: (expense as any).vendor || "" });
                          setShowExpenseDialog(true);
                        }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => deleteExpense.mutate(expense.id)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reference Viewer */}
      <ReferenceViewer reference={viewingRef} open={!!viewingRef} onOpenChange={(open) => { if (!open) setViewingRef(null); }} />

      {/* Add Resource Dialog */}
      <Dialog open={!!addRefType} onOpenChange={(open) => { if (!open) { setAddRefType(null); setRefForm({ title: "", url: "", description: "", widgetCode: "", widgetSummary: "", widgetInstructions: "" }); setRefFile(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="capitalize">Add {addRefType}</DialogTitle>
            <DialogDescription className="sr-only">Add a new resource</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Title" value={refForm.title} onChange={(e) => setRefForm(p => ({ ...p, title: e.target.value }))} />
            {addRefType === "image" ? (
              <Input type="file" accept="image/*" onChange={(e) => setRefFile(e.target.files?.[0] || null)} />
            ) : addRefType === "file" ? (
              <Input type="file" onChange={(e) => setRefFile(e.target.files?.[0] || null)} />
            ) : addRefType === "widget" ? null : addRefType !== "note" ? (
              <Input placeholder="URL" value={refForm.url} onChange={(e) => setRefForm(p => ({ ...p, url: e.target.value }))} />
            ) : null}
            {addRefType === "note" ? (
              <RichTextNoteEditor
                value={refForm.description}
                onChange={(val) => setRefForm(p => ({ ...p, description: val }))}
                placeholder="Write your note…"
              />
            ) : addRefType === "widget" ? (
              <>
                <Input placeholder="Brief summary shown on tile/list" value={refForm.widgetSummary} onChange={(e) => setRefForm(p => ({ ...p, widgetSummary: e.target.value }))} />
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Description (shown below widget)</label>
                  <RichTextNoteEditor value={refForm.widgetInstructions} onChange={(val) => setRefForm(p => ({ ...p, widgetInstructions: val }))} placeholder="Instructions or description…" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Code</label>
                  <Textarea placeholder="Paste your HTML/JS/CSS code here…" value={refForm.widgetCode} onChange={(e) => setRefForm(p => ({ ...p, widgetCode: e.target.value }))} className="resize-none min-h-[200px] font-mono text-xs" />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => setRefForm(p => ({ ...p, title: p.title || WIDGET_TEMPLATES.unitConverter.title, widgetCode: WIDGET_TEMPLATES.unitConverter.code, widgetSummary: WIDGET_TEMPLATES.unitConverter.summary, widgetInstructions: WIDGET_TEMPLATES.unitConverter.instructions }))}>
                    📐 Unit Converter
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => setRefForm(p => ({ ...p, title: p.title || WIDGET_TEMPLATES.calculator.title, widgetCode: WIDGET_TEMPLATES.calculator.code, widgetSummary: WIDGET_TEMPLATES.calculator.summary, widgetInstructions: WIDGET_TEMPLATES.calculator.instructions }))}>
                    🔢 Calculator
                  </Button>
                </div>
              </>
            ) : (
              <Textarea placeholder="Description (optional)" value={refForm.description} onChange={(e) => setRefForm(p => ({ ...p, description: e.target.value }))} className="resize-none" />
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddRefType(null)}>Cancel</Button>
            <Button onClick={handleAddRef} disabled={!refForm.title.trim() || addReference.isPending}>
              {addReference.isPending ? "Adding…" : "Add Resource"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Resource Dialog */}
      <Dialog open={!!editingRef} onOpenChange={(open) => { if (!open) { setEditingRef(null); setRefForm({ title: "", url: "", description: "", widgetCode: "", widgetSummary: "", widgetInstructions: "" }); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRef ? EDIT_TITLES[editingRef.type] || "Edit Resource" : "Edit Resource"}</DialogTitle>
            <DialogDescription className="sr-only">Edit an existing resource</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Title" value={refForm.title} onChange={(e) => setRefForm(p => ({ ...p, title: e.target.value }))} />
            {editingRef?.type !== "note" && editingRef?.type !== "image" && editingRef?.type !== "file" && editingRef?.type !== "widget" && (
              <Input placeholder="URL" value={refForm.url} onChange={(e) => setRefForm(p => ({ ...p, url: e.target.value }))} />
            )}
            {editingRef?.type === "note" ? (
              <RichTextNoteEditor
                value={refForm.description}
                onChange={(val) => setRefForm(p => ({ ...p, description: val }))}
                placeholder="Write your note…"
              />
            ) : editingRef?.type === "widget" ? (
              <>
                <Input placeholder="Brief summary shown on tile/list" value={refForm.widgetSummary} onChange={(e) => setRefForm(p => ({ ...p, widgetSummary: e.target.value }))} />
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Description (shown below widget)</label>
                  <RichTextNoteEditor value={refForm.widgetInstructions} onChange={(val) => setRefForm(p => ({ ...p, widgetInstructions: val }))} placeholder="Instructions or description…" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Code</label>
                  <Textarea placeholder="HTML/JS/CSS code…" value={refForm.widgetCode} onChange={(e) => setRefForm(p => ({ ...p, widgetCode: e.target.value }))} className="resize-none min-h-[200px] font-mono text-xs" />
                </div>
              </>
            ) : (
              <Textarea placeholder="Description (optional)" value={refForm.description} onChange={(e) => setRefForm(p => ({ ...p, description: e.target.value }))} className="resize-none" />
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingRef(null)}>Cancel</Button>
            <Button onClick={() => {
              const fields: Record<string, any> = { title: refForm.title, url: refForm.url, description: refForm.description };
              if (editingRef.type === "link") fields.url = ensureHttps(refForm.url);
              if (editingRef.type === "widget") fields.description = encodeWidgetData(refForm.widgetCode, refForm.widgetSummary, refForm.widgetInstructions);
              updateReference.mutate({ refId: editingRef.id, fields });
            }} disabled={!refForm.title.trim() || updateReference.isPending}>
              {updateReference.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task Preview Dialog */}
      <Dialog open={!!viewingTask} onOpenChange={(open) => { if (!open) setViewingTask(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewingTask?.title}</DialogTitle>
            <DialogDescription className="sr-only">Task details</DialogDescription>
          </DialogHeader>
          {viewingTask && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={`text-xs border ${PRIORITY_COLORS[viewingTask.priority] || PRIORITY_COLORS.medium}`}>
                  {viewingTask.priority}
                </Badge>
                <Badge variant={viewingTask.completed ? "default" : "secondary"} className="text-xs">
                  {viewingTask.completed ? "Completed" : "Active"}
                </Badge>
                {viewingTask.due_date && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(viewingTask.due_date), "MMM d, yyyy")}
                  </span>
                )}
              </div>
              {viewingTask.description && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Description</p>
                    <p className="text-sm whitespace-pre-wrap">{viewingTask.description}</p>
                  </div>
                </>
              )}
              {/* Show subtasks */}
              {(() => {
                const subs = tasks.filter((t: any) => (t as any).parent_task_id === viewingTask.id);
                if (subs.length === 0) return null;
                return (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Subtasks</p>
                      <div className="space-y-1">
                        {subs.map((s: any) => (
                          <div key={s.id} className="flex items-center gap-2 text-sm">
                            <Checkbox checked={s.completed} onCheckedChange={(checked) => handleToggleTask(s, !!checked)} />
                            <span className={s.completed ? "line-through text-muted-foreground" : ""}>{s.title}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                );
              })()}
              {/* Comments Section */}
              <Separator />
              <TaskCommentsSection taskId={viewingTask.id} taskType="project" />
              <Separator />
              <p className="text-xs text-muted-foreground pt-1">Created {format(new Date(viewingTask.created_at), "MMM d, yyyy 'at' h:mm a")}</p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant={viewingTask?.completed ? "secondary" : "default"}
              onClick={() => {
                handleToggleTask(viewingTask, !viewingTask.completed);
                setViewingTask({ ...viewingTask, completed: !viewingTask.completed });
              }}
            >
              <CheckSquare className="h-3 w-3 mr-1" />
              {viewingTask?.completed ? "Mark Active" : "Mark Complete"}
            </Button>
            <Button variant="ghost" onClick={() => {
              setViewingTask(null);
              if (viewingTask) {
                setEditingTask(viewingTask);
                setTaskForm({ title: viewingTask.title, description: viewingTask.description || "", priority: viewingTask.priority, due_date: viewingTask.due_date || "", parent_task_id: (viewingTask as any).parent_task_id || "" });
                setShowTaskDialog(true);
              }
            }}>
              <Pencil className="h-3 w-3 mr-1" /> Edit
            </Button>
            <Button variant="ghost" className="text-destructive" onClick={() => { deleteTask.mutate(viewingTask.id); setViewingTask(null); }}>
              <Trash2 className="h-3 w-3 mr-1" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task Dialog */}
      <Dialog open={showTaskDialog} onOpenChange={(open) => { if (!open) { setShowTaskDialog(false); setEditingTask(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTask ? "Edit Task" : taskForm.parent_task_id ? "Add Subtask" : "Add Task"}</DialogTitle>
            <DialogDescription className="sr-only">{editingTask ? "Edit task details" : "Create a new task"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {taskForm.parent_task_id && (
              <div className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                Subtask of: <span className="font-medium text-foreground">{tasks.find((t: any) => t.id === taskForm.parent_task_id)?.title || "Unknown"}</span>
              </div>
            )}
            <Input placeholder="Task title" value={taskForm.title} onChange={(e) => setTaskForm(p => ({ ...p, title: e.target.value }))} />
            <Textarea placeholder="Description (optional)" value={taskForm.description} onChange={(e) => setTaskForm(p => ({ ...p, description: e.target.value }))} className="resize-none min-h-[80px]" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Priority</label>
                <Select value={taskForm.priority} onValueChange={(val) => setTaskForm(p => ({ ...p, priority: val }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Due Date</label>
                <Input type="date" value={taskForm.due_date} onChange={(e) => setTaskForm(p => ({ ...p, due_date: e.target.value }))} className="h-8 text-xs" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowTaskDialog(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (editingTask) {
                  updateTask.mutate({ taskId: editingTask.id, fields: { title: taskForm.title, description: taskForm.description, priority: taskForm.priority, due_date: taskForm.due_date || null } });
                } else {
                  addTask.mutate({ title: taskForm.title, description: taskForm.description, priority: taskForm.priority, due_date: taskForm.due_date || null, ...(taskForm.parent_task_id ? { parent_task_id: taskForm.parent_task_id } : {}) });
                }
              }}
              disabled={!taskForm.title.trim()}
            >
              {editingTask ? "Save Changes" : taskForm.parent_task_id ? "Add Subtask" : "Add Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Expense Dialog */}
      <Dialog open={showExpenseDialog} onOpenChange={(open) => { if (!open) { setShowExpenseDialog(false); setEditingExpense(null); setReceiptFile(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingExpense ? "Edit Expense" : "Add Expense"}</DialogTitle>
            <DialogDescription className="sr-only">{editingExpense ? "Edit expense details" : "Track a new expense"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Expense title" value={expenseForm.title} onChange={(e) => setExpenseForm(p => ({ ...p, title: e.target.value }))} />
            <Input placeholder="Vendor (optional)" value={expenseForm.vendor} onChange={(e) => setExpenseForm(p => ({ ...p, vendor: e.target.value }))} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Amount ($)</label>
                <Input type="number" step="0.01" placeholder="0.00" value={expenseForm.amount} onChange={(e) => setExpenseForm(p => ({ ...p, amount: e.target.value }))} className="h-8 text-xs" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Category</label>
                <Select value={expenseForm.category} onValueChange={(val) => setExpenseForm(p => ({ ...p, category: val }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Date</label>
              <Input type="date" value={expenseForm.date} onChange={(e) => setExpenseForm(p => ({ ...p, date: e.target.value }))} className="h-8 text-xs" />
            </div>
            <Textarea placeholder="Description (optional)" value={expenseForm.description} onChange={(e) => setExpenseForm(p => ({ ...p, description: e.target.value }))} className="resize-none min-h-[60px]" />
            {!editingExpense && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Receipt (image/PDF)</label>
                <Input type="file" accept="image/*,.pdf" onChange={(e) => setReceiptFile(e.target.files?.[0] || null)} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowExpenseDialog(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (editingExpense) {
                  updateExpense.mutate({ expenseId: editingExpense.id, fields: { title: expenseForm.title, description: expenseForm.description, amount: parseFloat(expenseForm.amount) || 0, category: expenseForm.category, date: expenseForm.date || null, vendor: expenseForm.vendor } });
                } else {
                  handleAddExpense();
                }
              }}
              disabled={!expenseForm.title.trim() || !expenseForm.amount}
            >
              {editingExpense ? "Save Changes" : "Add Expense"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Linked Idea Overlay Dialog */}
      {linkedIdeaData && (
        <Dialog open={showLinkedIdea} onOpenChange={setShowLinkedIdea}>
          <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{linkedIdeaData.title || "Linked Idea"}</DialogTitle>
              <DialogDescription className="sr-only">View linked idea details</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs text-muted-foreground">
                  Created {format(new Date(linkedIdeaData.created_at), "MMM d, yyyy 'at' h:mm a")}
                </p>
                {linkedIdeaData.category && (
                  <Badge className={`text-xs border ${CATEGORY_COLORS[linkedIdeaData.category] || "bg-secondary text-secondary-foreground"}`}>{linkedIdeaData.category}</Badge>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Raw Dump</p>
                <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground whitespace-pre-wrap">
                  {linkedIdeaData.raw_dump}
                </div>
              </div>
              {linkedIdeaData.processed_summary && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Summary</p>
                  <p className="text-sm leading-relaxed">{linkedIdeaData.processed_summary}</p>
                </div>
              )}
              {linkedIdeaData.key_features && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Key Features</p>
                  <div className="text-sm text-muted-foreground">
                    <div dangerouslySetInnerHTML={{ __html: linkedIdeaData.key_features.replace(/^- /gm, "• ").replace(/\n/g, "<br/>") }} />
                  </div>
                </div>
              )}
              {linkedIdeaData.tags && linkedIdeaData.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {linkedIdeaData.tags.map((tag: string) => (
                    <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowLinkedIdea(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Gotcha Modal */}
      <Dialog open={showGotchaModal} onOpenChange={(open) => { if (!open) { setShowGotchaModal(false); setViewingGotcha(null); } }}>
        <DialogContent className="sm:max-w-lg">
          {gotchaModalState === "view" ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className={`h-5 w-5 ${viewingGotcha?.status === "resolved" ? "text-emerald-400" : "text-amber-400"}`} />
                  Gotcha History
                  <Badge variant="secondary" className="ml-auto text-xs">{viewingGotcha?.status}</Badge>
                </DialogTitle>
                <DialogDescription className="text-xs">Symptom: {gotchaSymptom}</DialogDescription>
              </DialogHeader>
              <div className="max-h-[400px] overflow-y-auto space-y-3 rounded-md bg-muted/50 p-3">
                {gotchaChatHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No conversation history yet.</p>
                ) : (
                  gotchaChatHistory.map((msg: any, i: number) => (
                    <div key={i} className={`flex items-start gap-2 ${msg.role === "user" ? "justify-end" : ""}`}>
                      {msg.role === "assistant" && (
                        <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <Brain className="h-3 w-3 text-primary" />
                        </div>
                      )}
                      <div className={`rounded-lg px-3 py-2 text-sm max-w-[80%] ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                        {msg.role === "assistant" ? (
                          <div className="prose prose-invert prose-sm max-w-none">
                            <ReactMarkdown components={markdownComponents}>{msg.content}</ReactMarkdown>
                          </div>
                        ) : msg.content}
                      </div>
                    </div>
                  ))
                )}
                {viewingGotcha?.root_cause && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 mt-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-1">Root Cause</p>
                    <p className="text-sm">{viewingGotcha.root_cause}</p>
                  </div>
                )}
                {viewingGotcha?.status === "investigating" && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 mt-2">
                    <p className="text-sm text-amber-300">⏳ Investigation in progress. Complete the investigation task to continue.</p>
                  </div>
                )}
              </div>
              <DialogFooter>
                {viewingGotcha?.status === "active" && !isLocked && (
                  <Button onClick={() => {
                    setActiveGotchaId(viewingGotcha.id);
                    setGotchaModalState("autopsy");
                    setGotchaWhyRound(gotchaChatHistory.filter((m: any) => m.role === "user").length);
                    const lastAssistant = [...gotchaChatHistory].reverse().find((m: any) => m.role === "assistant");
                    setGotchaQuestion(lastAssistant?.content || "Why did this happen?");
                  }}>
                    <Brain className="h-4 w-4 mr-2" /> Continue Autopsy
                  </Button>
                )}
                <Button variant="ghost" onClick={() => { setShowGotchaModal(false); setViewingGotcha(null); }}>Close</Button>
              </DialogFooter>
            </>
          ) : gotchaModalState === "define" ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-400" />
                  New Gotcha
                </DialogTitle>
                <DialogDescription>What unexpected failure, hidden trap, or roadblock did you just hit?</DialogDescription>
              </DialogHeader>
              <Textarea
                placeholder="Describe the gotcha…"
                value={gotchaSymptom}
                onChange={(e) => setGotchaSymptom(e.target.value)}
                className="min-h-[120px]"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && gotchaSymptom.trim()) {
                    e.preventDefault();
                    (document.querySelector("[data-gotcha-start]") as HTMLButtonElement)?.click();
                  }
                }}
              />
              <DialogFooter>
                <Button
                  data-gotcha-start
                  disabled={!gotchaSymptom.trim() || isGotchaThinking}
                  onClick={async () => {
                    if (!user || !id) return;
                    setIsGotchaThinking(true);
                    try {
                      const now = new Date().toISOString();
                      const newGotcha = await insertRow("gotchas", {
                        project_id: id,
                        symptom: gotchaSymptom.trim(),
                        status: "open",
                        chat_history: [],
                        root_cause: "",
                        created_at: now,
                      });
                      setActiveGotchaId(newGotcha.id as string);
                      const initHistory = [{ role: "user", content: `The gotcha is: ${gotchaSymptom.trim()}` }];
                      setGotchaChatHistory(initHistory);
                      setGotchaWhyRound(1);
                      setGotchaModalState("autopsy");
                      const data = await gotchaChat({
                        symptom: gotchaSymptom.trim(),
                        chat_history: initHistory,
                      });
                      setGotchaQuestion(data?.next_question || data?.message || "Why did this happen?");
                      queryClient.invalidateQueries({ queryKey: ["project-gotchas"] });
                    } catch (err) {
                      toast.error("Failed to create gotcha");
                    } finally {
                      setIsGotchaThinking(false);
                      setTimeout(() => gotchaAnswerRef.current?.focus(), 100);
                    }
                  }}
                >
                  {isGotchaThinking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Brain className="h-4 w-4 mr-2" />}
                  Start Autopsy
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-primary" />
                  Root Cause Autopsy
                  <Badge variant="outline" className="ml-auto text-xs">Round {gotchaWhyRound}/5</Badge>
                </DialogTitle>
                <DialogDescription className="text-xs">Symptom: {gotchaSymptom}</DialogDescription>
              </DialogHeader>
              <div className="max-h-[200px] overflow-y-auto rounded-md bg-muted p-3 text-sm">
                {isGotchaThinking && !gotchaQuestion ? (
                  <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Thinking…</div>
                ) : (
                  <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown components={markdownComponents}>{gotchaQuestion}</ReactMarkdown>
                  </div>
                )}
              </div>
              <Textarea
                ref={gotchaAnswerRef}
                placeholder="Your answer…"
                value={gotchaAnswer}
                onChange={(e) => setGotchaAnswer(e.target.value)}
                className="min-h-[80px]"
                disabled={isGotchaThinking}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && gotchaAnswer.trim() && !isGotchaThinking) {
                    e.preventDefault();
                    (document.querySelector("[data-gotcha-submit]") as HTMLButtonElement)?.click();
                  }
                }}
              />
              <DialogFooter>
                <Button
                  data-gotcha-submit
                  disabled={!gotchaAnswer.trim() || isGotchaThinking}
                  onClick={async () => {
                    if (!user || !activeGotchaId) return;
                    setIsGotchaThinking(true);
                    const updatedHistory = [
                      ...gotchaChatHistory,
                      { role: "assistant", content: gotchaQuestion },
                      { role: "user", content: gotchaAnswer.trim() },
                    ];
                    setGotchaChatHistory(updatedHistory);
                    setGotchaAnswer("");
                    try {
                      await updateRow("gotchas", activeGotchaId, {
                        chat_history: updatedHistory,
                      });
                      const data = await gotchaChat({
                        symptom: gotchaSymptom,
                        chat_history: updatedHistory,
                      });

                      // Helper to insert a structured task with subtasks
                      const insertTaskWithSubtasks = async (taskData: any, defaultTitlePrefix: string) => {
                        let title: string;
                        let description: string;
                        let subtasks: any[] = [];

                        if (typeof taskData === "string") {
                          // Backward compat: plain string
                          title = `${defaultTitlePrefix}: ${taskData.split(" ").slice(0, 6).join(" ")}`;
                          description = taskData;
                        } else {
                          title = taskData.title || `${defaultTitlePrefix}: ${(taskData.description || "").split(" ").slice(0, 6).join(" ")}`;
                          description = taskData.description || "";
                          subtasks = taskData.subtasks || [];
                        }

                        const tnow = new Date().toISOString();
                        const parentTask = await insertRow("project_tasks", {
                          project_id: id!,
                          user_id: user!.id,
                          title,
                          description,
                          priority: "high",
                          sort_order: tasks.length,
                          completed: false,
                          parent_task_id: null,
                          due_date: null,
                          created_at: tnow,
                          updated_at: tnow,
                        });

                        if (parentTask && subtasks.length > 0) {
                          for (const sub of subtasks) {
                            const st = new Date().toISOString();
                            await insertRow("project_tasks", {
                              project_id: id!,
                              user_id: user!.id,
                              title: sub.title || "Subtask",
                              description: sub.description || "",
                              priority: "high",
                              parent_task_id: parentTask.id,
                              sort_order: tasks.length,
                              completed: false,
                              due_date: null,
                              created_at: st,
                              updated_at: st,
                            });
                          }
                        }
                        return parentTask;
                      };

                      if (data?.investigation_task) {
                        await insertTaskWithSubtasks(data.investigation_task, "Investigate");
                        await updateRow("gotchas", activeGotchaId, { status: "investigating" });
                        queryClient.invalidateQueries({ queryKey: ["project-gotchas", id] });
                        queryClient.invalidateQueries({ queryKey: ["project-tasks", id] });
                        toast.info("Investigation task created. Go find out!");
                        setShowGotchaModal(false);
                      } else if (data?.root_cause) {
                        await updateRow("gotchas", activeGotchaId, {
                          root_cause: data.root_cause,
                          status: "resolved",
                        });
                        if (data.corrective_action_task) {
                          await insertTaskWithSubtasks(data.corrective_action_task, "Fix");
                          queryClient.invalidateQueries({ queryKey: ["project-tasks", id] });
                        }
                        queryClient.invalidateQueries({ queryKey: ["project-gotchas", id] });
                        toast.success("Root cause identified!");
                        setShowGotchaModal(false);
                      } else if (data?.next_question) {
                        setGotchaQuestion(data.next_question);
                        setGotchaWhyRound((r) => r + 1);
                      } else {
                        setGotchaQuestion(data?.message || "Can you elaborate further?");
                      }
                    } catch (err) {
                      toast.error("Failed to process answer");
                    } finally {
                      setIsGotchaThinking(false);
                      setTimeout(() => gotchaAnswerRef.current?.focus(), 100);
                    }
                  }}
                >
                  {isGotchaThinking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                  Submit Answer
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Floating Chat Widget */}
      <FloatingChatWidget
        storageKey="chat-widget-project"
        title="Project Assistant"
        chatHistory={chatHistory}
        chatInput={chatInput}
        onInputChange={setChatInput}
        onSubmit={handleChatSubmit}
        isThinking={isChatThinking}
        placeholder="Ask for help planning, finding resources, adding tasks, or refining your strategy…"
        onKeyDown={handleChatKeyDown}
        renderMessage={(msg, i) => (
          <div key={i} className={`flex items-start gap-2 ${msg.role === "user" ? "justify-end" : ""}`}>
            {msg.role === "assistant" && (
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="h-3 w-3 text-primary" />
              </div>
            )}
            <div className={`rounded-lg px-3 py-2 text-sm max-w-[80%] ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              {msg.role === "assistant" ? (
                <div>
                  <div className="prose prose-invert prose-sm max-w-none [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-0.5 [&_p]:my-1.5">
                    <ReactMarkdown components={markdownComponents}>{msg.content}</ReactMarkdown>
                  </div>
                  {msg.noteId && (
                    <button
                      className="mt-2 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30 transition-colors"
                      onClick={() => {
                        const note = references.find((r: any) => r.id === msg.noteId);
                        if (note) setViewingRef(note);
                      }}
                    >
                      <StickyNote className="h-3 w-3" />
                      View: {msg.noteTitle}
                    </button>
                  )}
                  {msg.widgetId && (
                    <button
                      className="mt-2 ml-1 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30 transition-colors"
                      onClick={() => {
                        const widget = references.find((r: any) => r.id === msg.widgetId);
                        if (widget) setViewingRef(widget);
                      }}
                    >
                      <Code className="h-3 w-3" />
                      View: {msg.widgetTitle}
                    </button>
                  )}
                  {msg.linkId && (
                    <button
                      className="mt-2 ml-1 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition-colors"
                      onClick={() => {
                        const link = references.find((r: any) => r.id === msg.linkId);
                        if (link) setViewingRef(link);
                      }}
                    >
                      <LinkIcon className="h-3 w-3" />
                      View: {msg.linkTitle}
                    </button>
                  )}
                  {msg.links && msg.links.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {msg.links.map((link) => (
                        <button
                          key={link.id}
                          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition-colors"
                          onClick={() => {
                            const ref = references.find((r: any) => r.id === link.id);
                            if (ref) setViewingRef(ref);
                          }}
                        >
                          <LinkIcon className="h-3 w-3" />
                          View: {link.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : msg.content}
            </div>
          </div>
        )}
      />
    </div>
  );
}

import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Trash2, Plus, X, Pencil, Rocket,
  Wrench, Brain, Lightbulb, Bot, Send, Loader2, CheckCircle2, Sparkles,
  Check, Link as LinkIcon, Image, Film, StickyNote, FileText, Code,
  Grid3X3, List, ChevronDown, ChevronRight, ArrowUpDown, DollarSign, Calendar, Receipt, Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/localDb";
import { campaignChat, openGeminiSettings } from "@/services/ai-service";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import EditableMarkdown from "@/components/EditableMarkdown";
import ReferenceViewer, { getVideoThumbnail } from "@/components/ReferenceViewer";
import RichTextNoteEditor from "@/components/RichTextNoteEditor";
import FloatingChatWidget from "@/components/FloatingChatWidget";
import ReactMarkdown from "react-markdown";
import { markdownComponents } from "@/lib/markdownComponents";
import { format } from "date-fns";
import { useActionUndo } from "@/hooks/useActionUndo";
import TaskCommentButton from "@/components/TaskCommentButton";
import TaskCommentsSection from "@/components/TaskCommentsSection";
import { encodeWidgetData, parseWidgetData, WIDGET_TEMPLATES } from "@/lib/widgetUtils";
const EXPENSE_CATEGORIES = ["General", "Materials", "Software", "Hardware", "Services", "Shipping", "Other"];
const STATUS_OPTIONS = ["foundation_ip", "infrastructure_production", "asset_creation_prelaunch", "active_campaign", "operations_fulfillment"];
const STATUS_LABELS: Record<string, string> = {
  foundation_ip: "Foundation & IP",
  infrastructure_production: "Infrastructure & Production",
  asset_creation_prelaunch: "Asset Creation & Pre-Launch",
  active_campaign: "Active Campaign",
  operations_fulfillment: "Operations & Fulfillment",
};

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

const KANBAN_COLUMNS = [
  { key: "foundation_ip", label: "Foundation & IP" },
  { key: "infrastructure_production", label: "Infrastructure & Production" },
  { key: "asset_creation_prelaunch", label: "Asset Creation & Pre-Launch" },
  { key: "active_campaign", label: "Active Campaign" },
  { key: "operations_fulfillment", label: "Operations & Fulfillment" },
];

type ChatMsg = { role: "user" | "assistant"; content: string; noteId?: string; noteTitle?: string; widgetId?: string; widgetTitle?: string; linkId?: string; linkTitle?: string; links?: { id: string; title: string }[] };

const EDIT_TITLES: Record<string, string> = { note: "Edit Note", link: "Edit Link", image: "Edit Image", video: "Edit Video", file: "Edit File", widget: "Edit Widget" };
type RefType = "link" | "image" | "video" | "note" | "file" | "widget";
type SortMode = "az" | "za" | "newest" | "oldest";

const REF_ICONS: Record<string, any> = { link: LinkIcon, image: Image, video: Film, note: StickyNote, file: FileText, widget: Code };
const REF_ICON_COLORS: Record<string, string> = {
  note: "text-yellow-400", link: "text-blue-400", image: "text-emerald-400", video: "text-red-400", file: "text-orange-400", widget: "text-cyan-400",
};
const REF_TYPE_ORDER: RefType[] = ["note", "link", "image", "video", "file", "widget"];
const REF_TYPE_LABELS: Record<string, string> = { note: "Notes", link: "Links", image: "Images", video: "Videos", file: "Files", widget: "Widgets" };

const stripHtml = (html: string) => html?.replace(/<[^>]*>/g, "").trim() || "";

export default function CampaignWorkspace() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [showLinkedIdea, setShowLinkedIdea] = useState(false);

  // GTM Interview state
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [interviewAnswer, setInterviewAnswer] = useState("");
  const [isInterviewThinking, setIsInterviewThinking] = useState(false);
  const [interviewChatHistory, setInterviewChatHistory] = useState<ChatMsg[]>([]);
  const [questionLoaded, setQuestionLoaded] = useState(false);
  const [isForging, setIsForging] = useState(false);
  const [topicsRemaining, setTopicsRemaining] = useState<string[] | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Kanban task state
  const [addingTaskColumn, setAddingTaskColumn] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [viewingTask, setViewingTask] = useState<any>(null);
  const [editingTaskInDialog, setEditingTaskInDialog] = useState(false);
  const [taskEditForm, setTaskEditForm] = useState({ title: "", description: "", status_column: "" });

  // Resources state
  const [addRefType, setAddRefType] = useState<RefType | null>(null);
  const [editingRef, setEditingRef] = useState<any>(null);
  const [refForm, setRefForm] = useState({ title: "", url: "", description: "", widgetCode: "", widgetSummary: "", widgetInstructions: "" });
  const [refFile, setRefFile] = useState<File | null>(null);
  const [viewingRef, setViewingRef] = useState<any>(null);
  const [refViewMode, setRefViewMode] = useState<"grid" | "list">(
    () => (localStorage.getItem("campaign-ref-view-mode") as "grid" | "list") || "grid"
  );
  const [refSortMode, setRefSortMode] = useState<SortMode>(
    () => (localStorage.getItem("campaign-ref-sort-mode") as SortMode) || "newest"
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(`campaign-ref-collapse-${id}`);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  // Expense states
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [editingExpense, setEditingExpense] = useState<any>(null);
  const [expenseForm, setExpenseForm] = useState({ title: "", description: "", amount: "", category: "General", date: format(new Date(), "yyyy-MM-dd"), vendor: "" });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  // Campaign Assistant state
  const [chatHistory, setChatHistory] = useState<ChatMsg[]>([
    { role: "assistant", content: "👋 I'm your Campaign Assistant. I can help you:\n\n- **Analyze and refine** your GTM strategy and playbook sections\n- **Create and manage tasks** across all 5 pipeline phases\n- **Generate research notes** with action plans, summaries, and recommendations\n- **Add reference links** to useful websites, tools, and resources\n- **Create widgets** — mini web apps (calculators, converters, trackers, etc.)\n- **Read and update widgets** by title\n\nWhat would you like to work on?" }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isChatThinking, setIsChatThinking] = useState(false);
  const { pushAction } = useActionUndo();

  // =================== QUERIES ===================
  const { data: campaign, isLoading } = useQuery({
    queryKey: ["campaign", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns" as any).select("*").eq("id", id!).single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
  });

  const { data: linkedProject } = useQuery({
    queryKey: ["campaign-linked-project", campaign?.project_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects")
        .select("id, name, brainstorm_id, compiled_description, execution_strategy, bullet_breakdown, general_notes, github_repo_url, tags, category")
        .eq("id", campaign!.project_id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!campaign?.project_id,
  });

  const { data: linkedBrainstorm } = useQuery({
    queryKey: ["campaign-linked-brainstorm", linkedProject?.brainstorm_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("brainstorms").select("id, title, idea_id")
        .eq("id", linkedProject!.brainstorm_id!).is("deleted_at", null).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!linkedProject?.brainstorm_id,
  });

  const { data: linkedIdea } = useQuery({
    queryKey: ["campaign-linked-idea", linkedBrainstorm?.idea_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("ideas").select("*")
        .eq("id", linkedBrainstorm!.idea_id!).is("deleted_at", null).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!linkedBrainstorm?.idea_id,
  });

  const { data: campaignTasks = [], refetch: refetchTasks } = useQuery({
    queryKey: ["campaign-tasks", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaign_tasks" as any).select("*").eq("campaign_id", id!).order("sort_order");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!id,
  });

  const { data: campaignRefs = [] } = useQuery({
    queryKey: ["campaign-refs", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaign_references" as any).select("*").eq("campaign_id", id!).order("sort_order");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!id,
  });

  // Expenses query
  const { data: campaignExpenses = [] } = useQuery({
    queryKey: ["campaign-expenses", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaign_expenses" as any).select("*").eq("campaign_id", id!).order("date", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!id,
  });

  const totalExpenses = useMemo(() => campaignExpenses.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0), [campaignExpenses]);

  const addExpense = useMutation({
    mutationFn: async (fields: any) => {
      const { error } = await supabase.from("campaign_expenses" as any).insert({ campaign_id: id!, user_id: user!.id, ...fields });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-expenses", id] });
      setShowExpenseDialog(false);
      setExpenseForm({ title: "", description: "", amount: "", category: "General", date: format(new Date(), "yyyy-MM-dd"), vendor: "" });
      setReceiptFile(null);
    },
  });

  const updateExpense = useMutation({
    mutationFn: async ({ expenseId, fields }: { expenseId: string; fields: Record<string, any> }) => {
      const { error } = await supabase.from("campaign_expenses" as any).update(fields).eq("id", expenseId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-expenses", id] });
      setShowExpenseDialog(false);
      setEditingExpense(null);
      setExpenseForm({ title: "", description: "", amount: "", category: "General", date: format(new Date(), "yyyy-MM-dd"), vendor: "" });
    },
  });

  const deleteExpense = useMutation({
    mutationFn: async (expenseId: string) => {
      const { error } = await supabase.from("campaign_expenses" as any).delete().eq("id", expenseId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaign-expenses", id] }),
  });

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
      title: expenseForm.title, description: expenseForm.description,
      amount: parseFloat(expenseForm.amount) || 0, category: expenseForm.category,
      date: expenseForm.date || undefined, receipt_url: receiptUrl, vendor: expenseForm.vendor,
    });
  };

  // =================== EFFECTS ===================
  useEffect(() => {
    if (campaign) {
      setTitleDraft(campaign.title);
      if (campaign.chat_history && Array.isArray(campaign.chat_history) && campaign.chat_history.length > 0) {
        setInterviewChatHistory(campaign.chat_history as ChatMsg[]);
      }
    }
  }, [campaign]);

  const interviewCompleted = campaign?.interview_completed === true;

  useEffect(() => {
    if (campaign && !interviewCompleted && !questionLoaded && !isInterviewThinking && linkedProject) {
      setQuestionLoaded(true);
      const history = (campaign.chat_history as ChatMsg[]) || [];
      if (history.length > 0) {
        const lastAssistant = [...history].reverse().find(m => m.role === "assistant");
        if (lastAssistant) {
          const match = lastAssistant.content.match(/Next question:\s*(.+)/);
          if (match) { setCurrentQuestion(match[1].trim()); return; }
        }
      }
      generateFirstQuestion();
    }
  }, [campaign, interviewCompleted, questionLoaded, linkedProject]);

  // =================== INTERVIEW HANDLERS ===================
  const getInterviewContext = () => ({
    title: campaign?.title || "",
    project_name: linkedProject?.name || "",
    category: campaign?.category || linkedProject?.category || "",
    tags: campaign?.tags || linkedProject?.tags || [],
    compiled_description: linkedProject?.compiled_description || "",
    bullet_breakdown: linkedProject?.bullet_breakdown || "",
    execution_strategy: (linkedProject as any)?.execution_strategy || "",
    has_github: !!(linkedProject as any)?.github_repo_url,
    general_notes: (linkedProject as any)?.general_notes || "",
  });

  const generateFirstQuestion = async () => {
    setIsInterviewThinking(true);
    try {
      const data = await campaignChat({
        mode: "generate_question",
        chat_history: interviewChatHistory,
        context: getInterviewContext(),
      });
      setCurrentQuestion(data.question as string);
      if (data.topics_remaining) setTopicsRemaining(data.topics_remaining as string[]);
    } catch (e: unknown) {
      const err = e as Error & { code?: string };
      if (err.code === "NO_API_KEY") openGeminiSettings();
      toast.error("Failed to generate question: " + err.message);
    } finally {
      setIsInterviewThinking(false);
    }
  };

  const handleInterviewSubmit = async () => {
    if (!interviewAnswer.trim() || isInterviewThinking) return;
    setIsInterviewThinking(true);
    const userMsg: ChatMsg = { role: "user", content: `Q: ${currentQuestion}\nA: ${interviewAnswer.trim()}` };
    const newHistory = [...interviewChatHistory, userMsg];
    try {
      const data = await campaignChat({
        mode: "submit_answer",
        answer: interviewAnswer.trim(),
        question: currentQuestion,
        chat_history: newHistory,
        context: getInterviewContext(),
      });
      const { next_question, clarification, topics_remaining } = data;
      if (topics_remaining && Array.isArray(topics_remaining)) {
        setTopicsRemaining(topics_remaining as string[]);
      }
      const assistantContent = clarification || `Noted. Next question: ${next_question}`;
      const assistantMsg: ChatMsg = { role: "assistant", content: assistantContent };
      const finalHistory = [...newHistory, assistantMsg];
      setInterviewChatHistory(finalHistory);
      setCurrentQuestion(next_question);
      setInterviewAnswer("");
      await supabase.from("campaigns" as any).update({ chat_history: finalHistory }).eq("id", id!);
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
    } catch (e: unknown) {
      const err = e as Error & { code?: string };
      if (err.code === "NO_API_KEY") openGeminiSettings();
      toast.error("Failed: " + err.message);
    } finally {
      setIsInterviewThinking(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const handleForgePlaybook = async () => {
    setIsForging(true);
    try {
      const data = await campaignChat({
        mode: "forge_playbook",
        chat_history: interviewChatHistory,
        context: getInterviewContext(),
      });
      const { playbook, ip_strategy, monetization_plan, marketing_plan, operations_plan, sales_model, primary_channel, tasks } = data;
      await supabase.from("campaigns" as any).update({
        playbook, ip_strategy: ip_strategy || "", monetization_plan: monetization_plan || "",
        marketing_plan: marketing_plan || "", operations_plan: operations_plan || "",
        sales_model: sales_model || "", primary_channel: primary_channel || "",
        interview_completed: true, chat_history: interviewChatHistory,
      }).eq("id", id!);
      if (tasks && Array.isArray(tasks)) {
        for (let i = 0; i < tasks.length; i++) {
          const t = tasks[i];
          await supabase.from("campaign_tasks" as any).insert({
            campaign_id: id!, user_id: user!.id, title: t.title || "",
            description: t.description || "", status_column: t.status_column || "foundation_ip", sort_order: i,
          });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      queryClient.invalidateQueries({ queryKey: ["campaign-tasks", id] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-items"] });
      toast.success("Campaign Playbook forged!");
    } catch (e: unknown) {
      const err = e as Error & { code?: string };
      if (err.code === "NO_API_KEY") openGeminiSettings();
      toast.error("Failed to forge playbook: " + err.message);
    } finally {
      setIsForging(false);
    }
  };

  // =================== CAMPAIGN MUTATIONS ===================
  const updateCampaign = useMutation({
    mutationFn: async (fields: Record<string, any>) => {
      const { error } = await supabase.from("campaigns" as any).update(fields).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-items"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });

  const deleteCampaign = useMutation({
    mutationFn: async () => {
      if (campaign?.project_id) {
        await supabase.from("projects").update({ campaign_id: null } as any).eq("id", campaign.project_id);
      }
      const { error } = await supabase.from("campaigns" as any).update({ deleted_at: new Date().toISOString() }).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campaign moved to trash");
      queryClient.invalidateQueries({ queryKey: ["sidebar-items"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      navigate("/campaigns");
    },
  });

  const handleSaveTitle = () => {
    if (titleDraft.trim() && titleDraft !== campaign?.title) updateCampaign.mutate({ title: titleDraft.trim() });
    setEditingTitle(false);
  };

  // =================== TASK HANDLERS ===================
  const handleToggleTask = async (taskId: string, completed: boolean) => {
    await supabase.from("campaign_tasks" as any).update({ completed: !completed }).eq("id", taskId);
    refetchTasks();
    pushAction(
      completed ? "Mark task active" : "Mark task complete",
      async () => { await supabase.from("campaign_tasks" as any).update({ completed }).eq("id", taskId); refetchTasks(); },
      async () => { await supabase.from("campaign_tasks" as any).update({ completed: !completed }).eq("id", taskId); refetchTasks(); },
    );
  };

  const handleDeleteTask = async (taskId: string) => {
    const task = campaignTasks.find((t: any) => t.id === taskId);
    await supabase.from("campaign_tasks" as any).delete().eq("id", taskId);
    refetchTasks();
    if (task) {
      pushAction(
        `Delete task "${task.title}"`,
        async () => {
          await supabase.from("campaign_tasks" as any).insert({
            id: task.id, campaign_id: task.campaign_id, user_id: task.user_id,
            title: task.title, description: task.description || "",
            status_column: task.status_column, sort_order: task.sort_order, completed: task.completed,
          });
          refetchTasks();
        },
        async () => { await supabase.from("campaign_tasks" as any).delete().eq("id", taskId); refetchTasks(); },
      );
    }
  };

  const handleAddTask = async (column: string) => {
    if (!newTaskTitle.trim()) return;
    await supabase.from("campaign_tasks" as any).insert({
      campaign_id: id!, user_id: user!.id, title: newTaskTitle.trim(),
      status_column: column, sort_order: campaignTasks.filter((t: any) => t.status_column === column).length,
    });
    setNewTaskTitle("");
    setAddingTaskColumn(null);
    refetchTasks();
  };

  const handleUpdateTaskInDialog = async () => {
    if (!viewingTask || !taskEditForm.title.trim()) return;
    await supabase.from("campaign_tasks" as any).update({
      title: taskEditForm.title, description: taskEditForm.description, status_column: taskEditForm.status_column,
    }).eq("id", viewingTask.id);
    setEditingTaskInDialog(false);
    setViewingTask({ ...viewingTask, ...taskEditForm });
    refetchTasks();
  };

  // =================== RESOURCE HANDLERS ===================
  const addReference = useMutation({
    mutationFn: async ({ type, title, url, description, thumbnail_url }: { type: string; title: string; url?: string; description?: string; thumbnail_url?: string }) => {
      const { error } = await supabase.from("campaign_references" as any).insert({
        campaign_id: id!, user_id: user!.id, type, title,
        url: url || "", description: description || "",
        sort_order: campaignRefs.length, thumbnail_url: thumbnail_url || "",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-refs", id] });
      setAddRefType(null);
      setRefForm({ title: "", url: "", description: "", widgetCode: "", widgetSummary: "", widgetInstructions: "" });
      setRefFile(null);
    },
  });

  const updateReference = useMutation({
    mutationFn: async ({ refId, fields }: { refId: string; fields: Record<string, any> }) => {
      const { error } = await supabase.from("campaign_references" as any).update(fields).eq("id", refId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-refs", id] });
      setEditingRef(null);
      setRefForm({ title: "", url: "", description: "", widgetCode: "", widgetSummary: "", widgetInstructions: "" });
    },
  });

  const deleteReference = useMutation({
    mutationFn: async (refId: string) => {
      const { error } = await supabase.from("campaign_references" as any).delete().eq("id", refId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaign-refs", id] }),
  });

  const ensureHttps = (url: string) => (!url ? url : url.match(/^https?:\/\//) ? url : `https://${url}`);

  const handleRefClick = (ref: any) => {
    if (ref.type === "link" && ref.url) { window.open(ensureHttps(ref.url), "_blank", "noopener,noreferrer"); }
    else if (ref.type === "file" && ref.url) { window.open(ref.url, "_blank", "noopener,noreferrer"); }
    else if (ref.type === "note" || ref.type === "image" || ref.type === "video" || ref.type === "widget") { setViewingRef(ref); }
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
      addReference.mutate({ type: addRefType, title: refForm.title || refFile.name, url: urlData.publicUrl, description: refForm.description, thumbnail_url: addRefType === "image" ? urlData.publicUrl : undefined });
    } else if (addRefType === "link" || addRefType === "video") {
      const url = addRefType === "link" ? ensureHttps(refForm.url) : refForm.url;
      let thumbnail_url: string | null = null;
      if (addRefType === "video" && refForm.url) thumbnail_url = getVideoThumbnail(refForm.url);
      addReference.mutate({ type: addRefType, title: refForm.title, url, description: refForm.description, thumbnail_url: thumbnail_url || undefined });
    } else {
      addReference.mutate({ type: addRefType!, title: refForm.title, url: refForm.url, description: refForm.description });
    }
  };

  const toggleRefViewMode = (mode: "grid" | "list") => { setRefViewMode(mode); localStorage.setItem("campaign-ref-view-mode", mode); };
  const handleRefSortChange = (val: string) => { setRefSortMode(val as SortMode); localStorage.setItem("campaign-ref-sort-mode", val); };
  const toggleGroupCollapse = (type: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      localStorage.setItem(`campaign-ref-collapse-${id}`, JSON.stringify([...next]));
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
    type, label: REF_TYPE_LABELS[type],
    items: sortRefs(campaignRefs.filter((r: any) => r.type === type)),
  })).filter(g => g.items.length > 0);

  // =================== CAMPAIGN ASSISTANT ===================
  const handleChatSubmit = async () => {
    if (!chatInput.trim() || isChatThinking) return;
    const userMsg: ChatMsg = { role: "user", content: chatInput.trim() };
    const newHistory = [...chatHistory, userMsg];
    setChatHistory(newHistory);
    setChatInput("");
    setIsChatThinking(true);
    try {
      const tasksList = campaignTasks.map((t: any) => `[${t.completed ? "✓" : " "}] ${t.title} (${STATUS_LABELS[t.status_column] || t.status_column})`).join("\n");
      const notesList = campaignRefs.filter((r: any) => r.type === "note").map((r: any) => `${r.title}: ${stripHtml(r.description || "")}`).join("\n");
      const widgetsList = campaignRefs
        .filter((r: any) => r.type === "widget")
        .map((r: any) => {
          const wd = parseWidgetData(r.description);
          return `${r.title}: ${wd.summary || "(no summary)"} [code length: ${wd.code.length} chars]`;
        }).join("\n");
      const data = await campaignChat({
        mode: "assistant",
        chat_history: newHistory,
        context: {
          ...getInterviewContext(),
          ip_strategy: campaign?.ip_strategy || "",
          monetization_plan: campaign?.monetization_plan || "",
          marketing_plan: campaign?.marketing_plan || "",
          operations_plan: campaign?.operations_plan || "",
          playbook: campaign?.playbook || "",
          tasks: tasksList,
          notes: notesList,
          widgets: widgetsList,
          status: campaign?.status || "",
        },
      });

      // Process actions from tool calls
      let createdNoteId: string | null = null;
      let createdNoteTitle: string | null = null;
      let createdWidgetId: string | null = null;
      let createdWidgetTitle: string | null = null;
      const createdLinks: { id: string; title: string }[] = [];
      if (data.actions && data.actions.length > 0) {
        for (const action of data.actions) {
          if (action.action === "create_note" && action.title) {
            const { data: noteData } = await supabase.from("campaign_references" as any).insert({
              campaign_id: id!, user_id: user!.id, type: "note",
              title: action.title, description: action.content || "",
              sort_order: campaignRefs.length,
            }).select("id").single();
            createdNoteId = (noteData as any)?.id || null;
            createdNoteTitle = action.title;
            queryClient.invalidateQueries({ queryKey: ["campaign-refs", id] });
            toast.success(`Note created: ${action.title}`);
          } else if (action.action === "add_task" && action.title) {
            await supabase.from("campaign_tasks" as any).insert({
              campaign_id: id!, user_id: user!.id, title: action.title,
              description: action.description || "", status_column: action.status_column || "foundation_ip",
              sort_order: campaignTasks.filter((t: any) => t.status_column === (action.status_column || "foundation_ip")).length,
            });
            queryClient.invalidateQueries({ queryKey: ["campaign-tasks", id] });
            toast.success(`Task added: ${action.title}`);
          } else if (action.action === "create_widget" && action.title) {
            const widgetDesc = encodeWidgetData(action.code || "", action.summary || "", action.instructions || "");
            const { data: widgetData } = await supabase.from("campaign_references" as any).insert({
              campaign_id: id!, user_id: user!.id, type: "widget",
              title: action.title, description: widgetDesc,
              sort_order: campaignRefs.length,
            }).select("id").single();
            createdWidgetId = (widgetData as any)?.id || null;
            createdWidgetTitle = action.title;
            queryClient.invalidateQueries({ queryKey: ["campaign-refs", id] });
            toast.success(`Widget created: ${action.title}`);
          } else if (action.action === "update_widget" && action.title) {
            const existingWidget = campaignRefs.find((r: any) => r.type === "widget" && r.title.toLowerCase() === action.title.toLowerCase());
            if (existingWidget) {
              const existingData = parseWidgetData(existingWidget.description);
              const updatedDesc = encodeWidgetData(action.code || existingData.code, action.summary || existingData.summary, action.instructions || existingData.instructions);
              const updateFields: Record<string, any> = { description: updatedDesc };
              if (action.new_title) updateFields.title = action.new_title;
              await supabase.from("campaign_references" as any).update(updateFields).eq("id", existingWidget.id);
              queryClient.invalidateQueries({ queryKey: ["campaign-refs", id] });
              toast.success(`Widget updated: ${action.new_title || action.title}`);
            }
          } else if (action.action === "create_link" && action.title && action.url) {
            const { data: linkData } = await supabase.from("campaign_references" as any).insert({
              campaign_id: id!, user_id: user!.id, type: "link",
              title: action.title, url: action.url.match(/^https?:\/\//) ? action.url : `https://${action.url}`,
              description: action.description || "", sort_order: campaignRefs.length,
            }).select("id").single();
            if ((linkData as any)?.id) createdLinks.push({ id: (linkData as any).id, title: action.title });
            queryClient.invalidateQueries({ queryKey: ["campaign-refs", id] });
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
      setChatHistory([...newHistory, assistantMsg]);
    } catch (e: unknown) {
      const err = e as Error & { code?: string };
      if (err.code === "NO_API_KEY") openGeminiSettings();
      toast.error("Chat failed: " + err.message);
    } finally {
      setIsChatThinking(false);
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleChatSubmit(); }
  };

  const handleInterviewKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleInterviewSubmit(); }
  };

  const exchangeCount = interviewChatHistory.filter(m => m.role === "user").length;

  // =================== LOADING STATES ===================
  if (isLoading) return <div className="flex items-center justify-center py-20"><Skeleton className="h-8 w-8" /></div>;
  if (!campaign) return (
    <div className="flex flex-col items-center justify-center py-20">
      <p className="text-muted-foreground">Campaign not found</p>
      <Button variant="link" onClick={() => navigate("/campaigns")}>Back to campaigns</Button>
    </div>
  );

  // =================== STATE 1: GTM INTERVIEW ===================
  if (!interviewCompleted) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/campaigns")}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h1 className="text-2xl font-bold">{campaign.title}</h1>
            <p className="text-xs text-muted-foreground">Go-To-Market Strategy Interview</p>
          </div>
        </div>

        {linkedProject && (
          <Card className="border-border/50 bg-card/50">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Project Context</p>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs text-muted-foreground">Created {format(new Date(campaign.created_at), "MMM d, yyyy 'at' h:mm a")}</p>
                {campaign.category && <Badge className={`text-xs border ${CATEGORY_COLORS[campaign.category] || "bg-secondary text-secondary-foreground"}`}>{campaign.category}</Badge>}
                {linkedIdea && <Badge variant="outline" className="text-xs gap-1 cursor-pointer hover:bg-accent transition-colors" onClick={() => setShowLinkedIdea(true)}><Lightbulb className="h-3 w-3 text-yellow-400" /> Linked Idea</Badge>}
                {linkedBrainstorm && <Badge variant="outline" className="text-xs gap-1 cursor-pointer hover:bg-accent transition-colors" onClick={() => navigate(`/brainstorms/${linkedBrainstorm.id}`)}><Brain className="h-3 w-3 text-pink-400" /> Linked Brainstorm</Badge>}
                <Badge variant="outline" className="text-xs gap-1 cursor-pointer hover:bg-accent transition-colors" onClick={() => navigate(`/projects/${linkedProject.id}`)}><Wrench className="h-3 w-3 text-blue-400" /> Linked Project</Badge>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-border bg-muted/30">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Rocket className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">GTM Strategy Interview</h2>
            </div>

            {topicsRemaining !== null && topicsRemaining.length > 0 && (
              <p className="text-xs text-muted-foreground italic">To forge your playbook, we still need to discuss: {topicsRemaining.join(", ")}</p>
            )}
            {topicsRemaining !== null && topicsRemaining.length === 0 && exchangeCount >= 1 && (
              <p className="text-xs text-muted-foreground italic">You can now forge your playbook, or continue answering to refine it.</p>
            )}

            {isInterviewThinking && !currentQuestion ? (
              <div className="space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></div>
            ) : currentQuestion ? (
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-3 w-3 text-primary" />
                  </div>
                  <div className="max-h-[300px] overflow-y-auto flex-1">
                    <div className="prose prose-invert prose-sm max-w-none [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-0.5 [&_p]:my-1.5 [&_strong]:text-foreground">
                      <ReactMarkdown components={markdownComponents}>{currentQuestion}</ReactMarkdown>
                    </div>
                  </div>
                </div>
                <Textarea
                  ref={textareaRef}
                  value={interviewAnswer}
                  onChange={(e) => setInterviewAnswer(e.target.value)}
                  onKeyDown={handleInterviewKeyDown}
                  placeholder="Type your answer… (Enter to send, Shift+Enter for newline)"
                  className="min-h-[80px] resize-none text-sm"
                  disabled={isInterviewThinking}
                />
                <Button onClick={handleInterviewSubmit} disabled={!interviewAnswer.trim() || isInterviewThinking} className="w-full gap-2">
                  {isInterviewThinking ? <><Loader2 className="h-4 w-4 animate-spin" /> Thinking…</> : <><Send className="h-4 w-4" /> Submit Answer</>}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <Bot className="h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-xs text-muted-foreground">Loading interview questions…</p>
              </div>
            )}
          </CardContent>
        </Card>

        {topicsRemaining !== null && topicsRemaining.length === 0 && exchangeCount >= 1 && (
          <Button onClick={handleForgePlaybook} disabled={isForging} size="lg" className="w-full gap-2 h-14 text-base">
            {isForging ? <><Loader2 className="h-5 w-5 animate-spin" /> Forging Campaign Playbook…</> : <><Sparkles className="h-5 w-5" /> Forge Campaign Playbook</>}
          </Button>
        )}

        {/* Linked Idea Overlay */}
        {linkedIdea && (
          <Dialog open={showLinkedIdea} onOpenChange={setShowLinkedIdea}>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader><DialogTitle>{linkedIdea.title || "Linked Idea"}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs text-muted-foreground">Created {format(new Date(linkedIdea.created_at), "MMM d, yyyy 'at' h:mm a")}</p>
                  {linkedIdea.category && <Badge className={`text-xs border ${CATEGORY_COLORS[linkedIdea.category] || "bg-secondary text-secondary-foreground"}`}>{linkedIdea.category}</Badge>}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Raw Dump</p>
                  <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground whitespace-pre-wrap">{linkedIdea.raw_dump}</div>
                </div>
                {linkedIdea.processed_summary && <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Summary</p><p className="text-sm leading-relaxed">{linkedIdea.processed_summary}</p></div>}
                {linkedIdea.key_features && <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Key Features</p><div className="text-sm text-muted-foreground"><div dangerouslySetInnerHTML={{ __html: linkedIdea.key_features.replace(/^- /gm, "• ").replace(/\n/g, "<br/>") }} /></div></div>}
                {linkedIdea.tags && linkedIdea.tags.length > 0 && <div className="flex flex-wrap gap-1">{linkedIdea.tags.map((tag: string) => <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>)}</div>}
              </div>
              <DialogFooter><Button variant="ghost" onClick={() => setShowLinkedIdea(false)}>Close</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    );
  }

  // =================== STATE 2: DASHBOARD ===================
  return (
    <div className="space-y-6">
      {/* Title Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate("/campaigns")}><ArrowLeft className="h-4 w-4" /></Button>
        {editingTitle ? (
          <Input value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} onBlur={handleSaveTitle} onKeyDown={(e) => e.key === "Enter" && handleSaveTitle()} className="max-w-sm text-xl font-bold" autoFocus />
        ) : (
          <h1 className="text-2xl font-bold cursor-pointer hover:text-primary transition-colors" onClick={() => setEditingTitle(true)}>{campaign.title}</h1>
        )}
        <Select value={campaign.status} onValueChange={(val) => updateCampaign.mutate({ status: val })}>
          <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}</SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="destructive" className="gap-2"><Trash2 className="h-4 w-4" /> Delete</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Move to trash?</AlertDialogTitle><AlertDialogDescription>This will move the campaign to trash and unlock the linked project.</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteCampaign.mutate()}>Delete</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Created date + badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">Created {format(new Date(campaign.created_at), "MMM d, yyyy 'at' h:mm a")}</p>
        {campaign.category && <Badge className={`text-xs border ${CATEGORY_COLORS[campaign.category] || "bg-secondary text-secondary-foreground"}`}>{campaign.category}</Badge>}
        {linkedIdea && <Badge variant="outline" className="text-xs gap-1 cursor-pointer hover:bg-accent transition-colors" onClick={() => setShowLinkedIdea(true)}><Lightbulb className="h-3 w-3 text-yellow-400" /> Linked Idea</Badge>}
        {linkedBrainstorm && <Badge variant="outline" className="text-xs gap-1 cursor-pointer hover:bg-accent transition-colors" onClick={() => navigate(`/brainstorms/${linkedBrainstorm.id}`)}><Brain className="h-3 w-3 text-pink-400" /> Linked Brainstorm</Badge>}
        {linkedProject && <Badge variant="outline" className="text-xs gap-1 cursor-pointer hover:bg-accent transition-colors" onClick={() => navigate(`/projects/${linkedProject.id}`)}><Wrench className="h-3 w-3 text-blue-400" /> Linked Project</Badge>}
      </div>

      <Separator />

      {/* Kanban Pipeline — at top */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Go-To-Market Pipeline</p>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {KANBAN_COLUMNS.map(col => {
            const colTasks = campaignTasks.filter((t: any) => t.status_column === col.key);
            return (
              <div key={col.key} className="rounded-lg border border-border/50 bg-card/30 p-3 min-h-[150px]">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{col.label}</p>
                  <Badge variant="secondary" className="text-[10px]">{colTasks.length}</Badge>
                </div>
                <div className="space-y-2">
                  {colTasks.map((task: any) => (
                    <div
                      key={task.id}
                      className={`flex items-start gap-2 p-2 rounded-md border border-border/30 bg-background/50 cursor-pointer hover:border-primary/30 transition-colors ${task.completed ? "opacity-60" : ""}`}
                      onClick={() => { setViewingTask(task); setEditingTaskInDialog(false); setTaskEditForm({ title: task.title, description: task.description || "", status_column: task.status_column }); }}
                    >
                      <Checkbox
                        checked={task.completed}
                        onCheckedChange={(e) => { e; handleToggleTask(task.id, task.completed); }}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium ${task.completed ? "line-through text-muted-foreground" : ""}`}>{task.title}</p>
                        {task.description && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>}
                      </div>
                      <TaskCommentButton taskId={task.id} taskType="campaign" />
                    </div>
                  ))}
                </div>
                {addingTaskColumn === col.key ? (
                  <div className="mt-2 space-y-1">
                    <Input value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} placeholder="Task title…" className="h-7 text-xs" autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter") handleAddTask(col.key); if (e.key === "Escape") { setAddingTaskColumn(null); setNewTaskTitle(""); } }}
                    />
                    <div className="flex gap-1">
                      <Button size="sm" className="h-6 text-[10px]" onClick={() => handleAddTask(col.key)} disabled={!newTaskTitle.trim()}>Add</Button>
                      <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => { setAddingTaskColumn(null); setNewTaskTitle(""); }}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" className="w-full mt-2 h-7 text-xs gap-1 text-muted-foreground" onClick={() => setAddingTaskColumn(col.key)}>
                    <Plus className="h-3 w-3" /> Add Task
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left column — Playbook sections */}
        <div className="lg:col-span-3 space-y-6">
          {(campaign.ip_strategy || campaign.monetization_plan || campaign.marketing_plan || campaign.operations_plan) ? (
            <>
              <PlaybookSection label="Discovery & IP Strategy" field="ip_strategy" value={campaign.ip_strategy || ""} updateCampaign={updateCampaign} />
              <PlaybookSection label="Monetization Strategy" field="monetization_plan" value={campaign.monetization_plan || ""} updateCampaign={updateCampaign} />
              <PlaybookSection label="Distribution & Marketing" field="marketing_plan" value={campaign.marketing_plan || ""} updateCampaign={updateCampaign} />
              <PlaybookSection label="Logistics & Operations" field="operations_plan" value={campaign.operations_plan || ""} updateCampaign={updateCampaign} />
            </>
          ) : (
            <EditablePlaybook initialValue={campaign.playbook || ""} updateCampaign={updateCampaign} />
          )}
        </div>

        {/* Right column — Tags + Resources */}
        <div className="lg:col-span-2 space-y-6">
          {/* Tags */}
          {campaign.tags && campaign.tags.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {campaign.tags.map((tag: string) => <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>)}
              </div>
            </div>
          )}

          {/* Resources */}
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-lg font-semibold">Resources</h2>
              <div className="flex items-center gap-1">
                <Select value={refSortMode} onValueChange={handleRefSortChange}>
                  <SelectTrigger className="h-8 w-[130px] text-xs">
                    <ArrowUpDown className="h-3 w-3 mr-1" /><SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest</SelectItem>
                    <SelectItem value="oldest">Oldest</SelectItem>
                    <SelectItem value="az">A → Z</SelectItem>
                    <SelectItem value="za">Z → A</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" className={`h-8 w-8 ${refViewMode === "grid" ? "text-primary" : ""}`} onClick={() => toggleRefViewMode("grid")}><Grid3X3 className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className={`h-8 w-8 ${refViewMode === "list" ? "text-primary" : ""}`} onClick={() => toggleRefViewMode("list")}><List className="h-3.5 w-3.5" /></Button>
                <Popover>
                  <PopoverTrigger asChild><Button variant="outline" size="sm" className="gap-1 h-8"><Plus className="h-3 w-3" /> Add</Button></PopoverTrigger>
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
              </div>
            </div>

            {campaignRefs.length === 0 ? (
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
                        <div className={refViewMode === "grid" ? "grid grid-cols-1 gap-3" : "space-y-2"}>
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
                                      <div className="flex items-center gap-0.5 shrink-0">
                                        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary" onClick={(e) => { e.stopPropagation(); handleEditRef(ref); }}><Pencil className="h-3 w-3" /></Button>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); deleteReference.mutate(ref.id); }}><X className="h-3 w-3" /></Button>
                                      </div>
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
                                          <div className="h-12 w-16 rounded overflow-hidden shrink-0 bg-muted"><img src={thumbnail} alt="" className="h-full w-full object-cover" /></div>
                                        ) : (
                                          <div className="h-12 w-16 rounded bg-muted/50 flex items-center justify-center shrink-0"><Icon className={`h-5 w-5 ${iconColor}/50`} /></div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-medium truncate">{ref.title}</p>
                                          {previewText && <p className="text-xs text-muted-foreground line-clamp-2">{previewText}</p>}
                                        </div>
                                        <div className="flex flex-col gap-0.5 shrink-0">
                                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary" onClick={(e) => { e.stopPropagation(); handleEditRef(ref); }}><Pencil className="h-3 w-3" /></Button>
                                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); deleteReference.mutate(ref.id); }}><X className="h-3 w-3" /></Button>
                                        </div>
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
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" />
                <h2 className="text-lg font-semibold">Expenses</h2>
                <Badge variant="secondary" className="text-[10px]">${totalExpenses.toFixed(2)}</Badge>
              </div>
              <Button variant="outline" size="sm" className="gap-1 h-8" onClick={() => { setEditingExpense(null); setExpenseForm({ title: "", description: "", amount: "", category: "General", date: format(new Date(), "yyyy-MM-dd"), vendor: "" }); setShowExpenseDialog(true); }}>
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>

            {campaignExpenses.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12">
                <DollarSign className="mb-3 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No expenses tracked</p>
              </div>
            ) : (
              <div className="space-y-2">
                {campaignExpenses.map((expense: any) => (
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
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Task Detail Dialog */}
      <Dialog open={!!viewingTask} onOpenChange={(open) => { if (!open) { setViewingTask(null); setEditingTaskInDialog(false); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTaskInDialog ? "Edit Task" : viewingTask?.title}</DialogTitle>
            <DialogDescription className="sr-only">Task details</DialogDescription>
          </DialogHeader>
          {viewingTask && !editingTaskInDialog && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-xs">{STATUS_LABELS[viewingTask.status_column] || viewingTask.status_column}</Badge>
                <Badge variant={viewingTask.completed ? "default" : "secondary"} className="text-xs">{viewingTask.completed ? "Completed" : "Active"}</Badge>
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
              {/* Comments Section */}
              <Separator />
              <TaskCommentsSection taskId={viewingTask.id} taskType="campaign" />
              <Separator />
              <p className="text-xs text-muted-foreground pt-1">Created {format(new Date(viewingTask.created_at), "MMM d, yyyy 'at' h:mm a")}</p>
            </div>
          )}
          {viewingTask && editingTaskInDialog && (
            <div className="space-y-3">
              <Input value={taskEditForm.title} onChange={(e) => setTaskEditForm(f => ({ ...f, title: e.target.value }))} placeholder="Task title" />
              <Textarea value={taskEditForm.description} onChange={(e) => setTaskEditForm(f => ({ ...f, description: e.target.value }))} placeholder="Description (optional)" className="resize-none min-h-[80px]" />
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Pipeline Column</label>
                <Select value={taskEditForm.status_column} onValueChange={(val) => setTaskEditForm(f => ({ ...f, status_column: val }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{KANBAN_COLUMNS.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            {editingTaskInDialog ? (
              <>
                <Button variant="ghost" onClick={() => setEditingTaskInDialog(false)}>Cancel</Button>
                <Button onClick={handleUpdateTaskInDialog} disabled={!taskEditForm.title.trim()}>Save Changes</Button>
              </>
            ) : (
              <>
                <Button variant={viewingTask?.completed ? "secondary" : "default"} onClick={() => { handleToggleTask(viewingTask.id, viewingTask.completed); setViewingTask({ ...viewingTask, completed: !viewingTask.completed }); }}>
                  <Check className="h-3 w-3 mr-1" /> {viewingTask?.completed ? "Mark Active" : "Mark Complete"}
                </Button>
                <Button variant="ghost" onClick={() => setEditingTaskInDialog(true)}><Pencil className="h-3 w-3 mr-1" /> Edit</Button>
                <Button variant="ghost" className="text-destructive" onClick={() => { handleDeleteTask(viewingTask.id); setViewingTask(null); }}><Trash2 className="h-3 w-3 mr-1" /> Delete</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <RichTextNoteEditor value={refForm.description} onChange={(val) => setRefForm(p => ({ ...p, description: val }))} placeholder="Write your note…" />
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
            <Button onClick={handleAddRef} disabled={!refForm.title.trim() || addReference.isPending}>{addReference.isPending ? "Adding…" : "Add Resource"}</Button>
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
              <RichTextNoteEditor value={refForm.description} onChange={(val) => setRefForm(p => ({ ...p, description: val }))} placeholder="Write your note…" />
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

      {/* Reference Viewer */}
      <ReferenceViewer reference={viewingRef} open={!!viewingRef} onOpenChange={(open) => { if (!open) setViewingRef(null); }} />

      {/* Linked Idea Overlay */}
      {linkedIdea && (
        <Dialog open={showLinkedIdea} onOpenChange={setShowLinkedIdea}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader><DialogTitle>{linkedIdea.title || "Linked Idea"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs text-muted-foreground">Created {format(new Date(linkedIdea.created_at), "MMM d, yyyy 'at' h:mm a")}</p>
                {linkedIdea.category && <Badge className={`text-xs border ${CATEGORY_COLORS[linkedIdea.category] || "bg-secondary text-secondary-foreground"}`}>{linkedIdea.category}</Badge>}
              </div>
              <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Raw Dump</p><div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground whitespace-pre-wrap">{linkedIdea.raw_dump}</div></div>
              {linkedIdea.processed_summary && <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Summary</p><p className="text-sm leading-relaxed">{linkedIdea.processed_summary}</p></div>}
              {linkedIdea.key_features && <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Key Features</p><div className="text-sm text-muted-foreground"><div dangerouslySetInnerHTML={{ __html: linkedIdea.key_features.replace(/^- /gm, "• ").replace(/\n/g, "<br/>") }} /></div></div>}
              {linkedIdea.tags && linkedIdea.tags.length > 0 && <div className="flex flex-wrap gap-1">{linkedIdea.tags.map((tag: string) => <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>)}</div>}
            </div>
            <DialogFooter><Button variant="ghost" onClick={() => setShowLinkedIdea(false)}>Close</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Campaign Assistant */}
      <FloatingChatWidget
        title="Campaign Assistant"
        chatHistory={chatHistory}
        chatInput={chatInput}
        onInputChange={setChatInput}
        onSubmit={handleChatSubmit}
        isThinking={isChatThinking}
        placeholder="Ask me about your GTM strategy…"
        onKeyDown={handleChatKeyDown}
        storageKey={`campaign-chat-widget-${id}`}
        renderMessage={(msg, i) => (
          <div key={i} className={`flex items-start gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
            {msg.role === "assistant" && (
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Bot className="h-3 w-3 text-primary" />
              </div>
            )}
            <div className={`rounded-lg px-3 py-2 text-sm max-w-[85%] ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted/50"}`}>
              {msg.role === "assistant" ? (
                <div>
                  <div className="prose prose-invert prose-sm max-w-none [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-0.5 [&_p]:my-1.5">
                    <ReactMarkdown components={markdownComponents}>{msg.content}</ReactMarkdown>
                  </div>
                  {msg.noteId && (
                    <button
                      className="mt-2 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30 transition-colors"
                      onClick={() => {
                        const note = campaignRefs.find((r: any) => r.id === msg.noteId);
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
                        const widget = campaignRefs.find((r: any) => r.id === msg.widgetId);
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
                        const link = campaignRefs.find((r: any) => r.id === msg.linkId);
                        if (link) {
                          const url = link.url?.match(/^https?:\/\//) ? link.url : `https://${link.url}`;
                          window.open(url, "_blank", "noopener,noreferrer");
                        }
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
                            const ref = campaignRefs.find((r: any) => r.id === link.id);
                            if (ref) {
                              const url = ref.url?.match(/^https?:\/\//) ? ref.url : `https://${ref.url}`;
                              window.open(url, "_blank", "noopener,noreferrer");
                            }
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

// Separate component for editable playbook fallback
function EditablePlaybook({ initialValue, updateCampaign }: { initialValue: string; updateCampaign: any }) {
  const [playbook, setPlaybook] = useState(initialValue);
  useEffect(() => { setPlaybook(initialValue); }, [initialValue]);
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Campaign Playbook</p>
      <EditableMarkdown value={playbook} onChange={setPlaybook} onSave={() => { if (playbook !== initialValue) updateCampaign.mutate({ playbook }); }} placeholder="No playbook generated yet…" minHeight="120px" />
    </div>
  );
}

// Separate component for each playbook section
function PlaybookSection({ label, field, value, updateCampaign }: { label: string; field: string; value: string; updateCampaign: any }) {
  const [content, setContent] = useState(value);
  useEffect(() => { setContent(value); }, [value]);
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <EditableMarkdown value={content} onChange={setContent} onSave={() => { if (content !== value) updateCampaign.mutate({ [field]: content }); }} placeholder={`No ${label.toLowerCase()} yet…`} minHeight="80px" />
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from "react";
import FloatingChatWidget from "@/components/FloatingChatWidget";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Plus, Link as LinkIcon, Image, Film, StickyNote, X, Pencil,
  Loader2, Rocket, Lightbulb, Bot, Send, CheckCircle2, AlertTriangle,
  Grid3X3, List, ChevronDown, ChevronRight, ArrowUpDown, Wrench, Megaphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/localDb";
import { brainstormChat, generateExecutionStrategy, openGeminiSettings } from "@/services/ai-service";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import EditableMarkdown from "@/components/EditableMarkdown";
import ReferenceViewer, { getVideoThumbnail } from "@/components/ReferenceViewer";
import RichTextNoteEditor from "@/components/RichTextNoteEditor";
import ReactMarkdown from "react-markdown";
import { markdownComponents } from "@/lib/markdownComponents";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { format } from "date-fns";

type RefType = "link" | "image" | "video" | "note";
type ChatMsg = { role: "user" | "assistant"; content: string; noteId?: string; noteTitle?: string; linkId?: string; linkTitle?: string; links?: { id: string; title: string }[] };
type SortMode = "az" | "za" | "newest" | "oldest";

const REF_ICONS: Record<string, any> = {
  link: LinkIcon,
  image: Image,
  video: Film,
  note: StickyNote,
};

const REF_ICON_COLORS: Record<string, string> = {
  note: "text-yellow-400",
  link: "text-blue-400",
  image: "text-emerald-400",
  video: "text-red-400",
};

const REF_TYPE_ORDER: RefType[] = ["note", "link", "image", "video"];
const REF_TYPE_LABELS: Record<string, string> = {
  note: "Notes",
  link: "Links",
  image: "Images",
  video: "Videos",
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

const BRAINSTORM_STATUS_OPTIONS = [
  { value: "active", label: "Active", className: "bg-sky-500/20 text-sky-400 border-sky-500/30" },
  { value: "backburner", label: "Backburner", className: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  { value: "scrapped", label: "Scrapped", className: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30" },
];

export default function BrainstormWorkspace() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // --- State ---
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [addRefType, setAddRefType] = useState<RefType | null>(null);
  const [editingRef, setEditingRef] = useState<any>(null);
  const [refForm, setRefForm] = useState({ title: "", url: "", description: "" });
  const [refFile, setRefFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [bullets, setBullets] = useState("");
  const [showLinkedIdea, setShowLinkedIdea] = useState(false);

  // Reference view/sort/collapse state
  const [refViewMode, setRefViewMode] = useState<"grid" | "list">(
    () => (localStorage.getItem("ref-view-mode") as "grid" | "list") || "grid"
  );
  const [refSortMode, setRefSortMode] = useState<SortMode>(
    () => (localStorage.getItem("ref-sort-mode") as SortMode) || "newest"
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(`ref-collapse-${id}`);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  // Flashcard Q&A state
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [questionLoaded, setQuestionLoaded] = useState(false);
  // showWelcomeIntro removed -- welcome is now blended into first AI question
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastLoadedIdRef = useRef<string | null>(null);

  // Chatbot state (post-promotion or scrapped)
  const [queryChatHistory, setQueryChatHistory] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatThinking, setIsChatThinking] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Reference viewer state
  const [viewingRef, setViewingRef] = useState<any>(null);

  // --- Reset state when brainstorm ID changes ---
  useEffect(() => {
    if (id && id !== lastLoadedIdRef.current) {
      lastLoadedIdRef.current = id;
      setQuestionLoaded(false);
      setCurrentQuestion("");
      setAnswer("");
      setQueryChatHistory([]);
      setChatInput("");
    }
  }, [id]);

  // --- Queries ---
  const { data: brainstorm, isLoading } = useQuery({
    queryKey: ["brainstorm", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brainstorms")
        .select("*, ideas(raw_dump, processed_summary, title, key_features, tags, category, created_at)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: references = [] } = useQuery({
    queryKey: ["brainstorm-refs", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brainstorm_references")
        .select("*")
        .eq("brainstorm_id", id!)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Query for linked project
  const { data: linkedProject } = useQuery({
    queryKey: ["brainstorm-linked-project", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name")
        .eq("brainstorm_id", id!)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Query for linked campaign (through linked project)
  const { data: linkedCampaign } = useQuery({
    queryKey: ["brainstorm-linked-campaign", linkedProject?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns" as any)
        .select("id, title")
        .eq("project_id", linkedProject!.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!linkedProject?.id,
  });

  useEffect(() => {
    if (brainstorm) {
      setDescription(brainstorm.compiled_description || "");
      setBullets(brainstorm.bullet_breakdown || "");
      setTitleDraft(brainstorm.title);
    }
  }, [brainstorm]);

  const isCompleted = brainstorm?.status === "completed";
  const isScrapped = brainstorm?.status === "scrapped";
  const isLocked = isCompleted || isScrapped;

  // Dynamic welcome message for the assistant based on lock state
  useEffect(() => {
    if (brainstorm && queryChatHistory.length === 0) {
      const welcomeMsg: ChatMsg = isLocked
        ? { role: "assistant", content: "👋 I'm your brainstorm assistant. I can answer questions about this brainstorm's content and help you explore ideas. What would you like to know?" }
        : { role: "assistant", content: "👋 I'm your brainstorm assistant. I can answer questions, help you dig deeper into ideas, **create research notes**, **add reference links**, and **update the description and bullet breakdown**. What would you like to explore?" };
      setQueryChatHistory([welcomeMsg]);
    }
  }, [brainstorm, isLocked]);

  // --- Undo/Redo ---
  const handleRevert = useCallback(async (fieldName: string, value: string | null, metadata: any) => {
    if (fieldName === "compiled_description") {
      setDescription(value || "");
      await supabase.from("brainstorms").update({ compiled_description: value || "" }).eq("id", id!);
      queryClient.invalidateQueries({ queryKey: ["brainstorm", id] });
      toast.info("Undo: description reverted");
    } else if (fieldName === "bullet_breakdown") {
      setBullets(value || "");
      await supabase.from("brainstorms").update({ bullet_breakdown: value || "" }).eq("id", id!);
      queryClient.invalidateQueries({ queryKey: ["brainstorm", id] });
      toast.info("Undo: bullets reverted");
    } else if (fieldName === "deleted_reference" && metadata) {
      const { id: _id, ...rest } = metadata;
      await supabase.from("brainstorm_references").insert({ ...rest, id: metadata.id });
      queryClient.invalidateQueries({ queryKey: ["brainstorm-refs", id] });
      toast.info("Undo: reference restored");
    }
  }, [id, queryClient]);

  const handleReapply = useCallback(async (fieldName: string, value: string | null, metadata: any) => {
    if (fieldName === "compiled_description") {
      setDescription(value || "");
      await supabase.from("brainstorms").update({ compiled_description: value || "" }).eq("id", id!);
      queryClient.invalidateQueries({ queryKey: ["brainstorm", id] });
      toast.info("Redo: description updated");
    } else if (fieldName === "bullet_breakdown") {
      setBullets(value || "");
      await supabase.from("brainstorms").update({ bullet_breakdown: value || "" }).eq("id", id!);
      queryClient.invalidateQueries({ queryKey: ["brainstorm", id] });
      toast.info("Redo: bullets updated");
    } else if (fieldName === "deleted_reference" && metadata) {
      await supabase.from("brainstorm_references").delete().eq("id", metadata.id);
      queryClient.invalidateQueries({ queryKey: ["brainstorm-refs", id] });
      toast.info("Redo: reference deleted");
    }
  }, [id, queryClient]);

  const { pushEntry } = useUndoRedo({
    brainstormId: id,
    userId: user?.id,
    onRevert: handleRevert,
    onReapply: handleReapply,
    enabled: !isLocked,
  });

  useEffect(() => {
    if (brainstorm && !questionLoaded && !isThinking && !isLocked) {
      setQuestionLoaded(true);
      const history: ChatMsg[] = (brainstorm?.chat_history as ChatMsg[]) || [];
      if (history.length > 0) {
        const lastAssistant = [...history].reverse().find(m => m.role === "assistant");
        if (lastAssistant) {
          const match = lastAssistant.content.match(/Next question:\s*(.+)/);
          if (match) {
            setCurrentQuestion(match[1].trim());
            return;
          }
        }
      }
      generateFirstQuestion();
    }
  }, [brainstorm, questionLoaded, isLocked]);

  const chatHistory: ChatMsg[] = (brainstorm?.chat_history as ChatMsg[]) || [];

  const getContext = () => {
    const notes = references.filter((r: any) => r.type === "note");
    const otherRefs = references.filter((r: any) => r.type !== "note");
    return {
      title: brainstorm?.title || "",
      idea_raw: (brainstorm as any)?.ideas?.raw_dump || "",
      idea_summary: (brainstorm as any)?.ideas?.processed_summary || "",
      notes: notes.map((r: any) => `${r.title}: ${r.description || ""}`).join("\n"),
      references: otherRefs.map((r: any) => `[${r.type}] ${r.title}: ${r.description || r.url}`).join("\n"),
      tags: (brainstorm as any)?.tags || [],
      category: (brainstorm as any)?.category || "",
    };
  };

  const generateFirstQuestion = async () => {
    setIsThinking(true);
    try {
      const data = await brainstormChat({
        mode: "generate_question",
        compiled_description: brainstorm?.compiled_description || "",
        bullet_breakdown: brainstorm?.bullet_breakdown || "",
        chat_history: chatHistory,
        context: getContext(),
      });
      setCurrentQuestion(data.question as string);
    } catch (e: unknown) {
      const err = e as Error & { code?: string };
      if (err.code === "NO_API_KEY") openGeminiSettings();
      toast.error("Failed to generate question: " + err.message);
    } finally {
      setIsThinking(false);
    }
  };

  // --- Mutations ---
  const updateBrainstorm = useMutation({
    mutationFn: async (fields: Record<string, any>) => {
      const { error } = await supabase.from("brainstorms").update(fields).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brainstorm", id] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-items"] });
    },
  });

  const deleteBrainstorm = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("brainstorms")
        .update({ deleted_at: new Date().toISOString() } as any)
        .eq("id", id!);
      if (error) throw error;
      // Set linked idea status to "scrapped"
      if (brainstorm?.idea_id) {
        await supabase.from("ideas").update({ status: "scrapped" }).eq("id", brainstorm.idea_id);
      }
    },
    onSuccess: () => {
      toast.success("Brainstorm moved to trash");
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-items"] });
      navigate("/brainstorms");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addReference = useMutation({
    mutationFn: async ({ type, title, url, description, thumbnail_url }: { type: string; title: string; url?: string; description?: string; thumbnail_url?: string }) => {
      const { error } = await supabase.from("brainstorm_references").insert({
        brainstorm_id: id!,
        user_id: user!.id,
        type,
        title,
        url: url || "",
        description: description || "",
        sort_order: references.length,
        thumbnail_url: thumbnail_url || "",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brainstorm-refs", id] });
      setAddRefType(null);
      setEditingRef(null);
      setRefForm({ title: "", url: "", description: "" });
      setRefFile(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateReference = useMutation({
    mutationFn: async ({ refId, fields }: { refId: string; fields: Record<string, any> }) => {
      const { error } = await supabase.from("brainstorm_references").update(fields).eq("id", refId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brainstorm-refs", id] });
      setEditingRef(null);
      setRefForm({ title: "", url: "", description: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteReference = useMutation({
    mutationFn: async (ref: any) => {
      await pushEntry("deleted_reference", null, null, ref);
      const { error } = await supabase.from("brainstorm_references").delete().eq("id", ref.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["brainstorm-refs", id] }),
  });

  const promoteToProject = useMutation({
    mutationFn: async () => {
      const bTags = (brainstorm as any)?.tags || [];
      const bCategory = (brainstorm as any)?.category || null;
      const { data, error } = await supabase
        .from("projects")
        .insert({
          brainstorm_id: id!,
          user_id: user!.id,
          name: brainstorm?.title || "Untitled Project",
          general_notes: description,
          category: bCategory,
          tags: bTags,
          bullet_breakdown: bullets,
          compiled_description: description,
        } as any)
        .select()
        .single();
      if (error) throw error;

      await supabase.from("brainstorms").update({ status: "completed" }).eq("id", id!);

      // Gather notes from brainstorm references
      const { data: bRefs } = await supabase
        .from("brainstorm_references")
        .select("title, description, type")
        .eq("brainstorm_id", id!)
        .eq("type", "note");
      const notesText = (bRefs || []).map((r: any) => `${r.title}: ${r.description || ""}`).join("\n");

      // Generate execution strategy in background
      generateExecutionStrategy({
        title: brainstorm?.title || "",
        description,
        bullets,
        tags: bTags,
        category: bCategory,
        notes: notesText,
      })
        .then(async (res) => {
          if (res?.strategy) {
            await supabase.from("projects").update({ execution_strategy: res.strategy } as any).eq("id", data.id);
          }
        })
        .catch((err) => console.error("Strategy generation failed:", err));

      return data;
    },
    onSuccess: (data) => {
      toast.success("Promoted to project!");
      queryClient.invalidateQueries({ queryKey: ["sidebar-items"] });
      navigate(`/projects/${data.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // --- Handlers ---
  const handleSaveTitle = () => {
    if (titleDraft.trim() && titleDraft !== brainstorm?.title) {
      updateBrainstorm.mutate({ title: titleDraft.trim() });
    }
    setEditingTitle(false);
  };

  const handleSaveDescription = () => {
    const oldVal = brainstorm?.compiled_description || "";
    if (description !== oldVal) {
      pushEntry("compiled_description", oldVal, description);
      updateBrainstorm.mutate({ compiled_description: description });
    }
  };

  const handleSaveBullets = () => {
    const oldVal = brainstorm?.bullet_breakdown || "";
    if (bullets !== oldVal) {
      pushEntry("bullet_breakdown", oldVal, bullets);
      updateBrainstorm.mutate({ bullet_breakdown: bullets });
    }
  };

  const fetchLinkPreview = async (url: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase.functions.invoke("fetch-link-preview", {
        body: { url },
      });
      if (error) return null;
      return data?.thumbnail_url || null;
    } catch {
      return null;
    }
  };

  const ensureHttps = (url: string) => {
    if (!url) return url;
    return url.match(/^https?:\/\//) ? url : `https://${url}`;
  };

  const handleAddRef = async () => {
    if (addRefType === "image" && refFile) {
      const path = `${user!.id}/${id}/${Date.now()}-${refFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("brainstorm-references")
        .upload(path, refFile);
      if (uploadError) {
        toast.error("Upload failed: " + uploadError.message);
        return;
      }
      const { data: urlData } = supabase.storage.from("brainstorm-references").getPublicUrl(path);
      addReference.mutate({
        type: "image",
        title: refForm.title || refFile.name,
        url: urlData.publicUrl,
        description: refForm.description,
        thumbnail_url: urlData.publicUrl,
      });
    } else if (addRefType === "link" || addRefType === "video") {
      const url = addRefType === "link" ? ensureHttps(refForm.url) : refForm.url;
      let thumbnail_url: string | null = null;
      if (addRefType === "video" && refForm.url) {
        thumbnail_url = getVideoThumbnail(refForm.url);
      }
      if (!thumbnail_url && refForm.url) {
        thumbnail_url = await fetchLinkPreview(refForm.url);
      }
      addReference.mutate({
        type: addRefType,
        title: refForm.title,
        url,
        description: refForm.description,
        thumbnail_url: thumbnail_url || undefined,
      });
    } else {
      addReference.mutate({
        type: addRefType!,
        title: refForm.title,
        url: refForm.url,
        description: refForm.description,
      });
    }
  };

  const handleRefClick = (ref: any) => {
    if (ref.type === "link" && ref.url) {
      const url = ref.url.match(/^https?:\/\//) ? ref.url : `https://${ref.url}`;
      window.open(url, "_blank", "noopener,noreferrer");
    } else if (ref.type === "note" || ref.type === "image" || ref.type === "video") {
      setViewingRef(ref);
    }
  };

  const handleEditRef = (ref: any) => {
    setEditingRef(ref);
    setRefForm({ title: ref.title, url: ref.url || "", description: ref.description || "" });
  };

  const handleSaveEditRef = async () => {
    if (!editingRef) return;
    const fields: Record<string, any> = {
      title: refForm.title,
      url: refForm.url,
      description: refForm.description,
    };
    if (editingRef.type === "link") fields.url = ensureHttps(refForm.url);
    updateReference.mutate({ refId: editingRef.id, fields });
  };

  const toggleRefViewMode = (mode: "grid" | "list") => {
    setRefViewMode(mode);
    localStorage.setItem("ref-view-mode", mode);
  };

  const handleRefSortChange = (val: string) => {
    setRefSortMode(val as SortMode);
    localStorage.setItem("ref-sort-mode", val);
  };

  const toggleGroupCollapse = (type: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      localStorage.setItem(`ref-collapse-${id}`, JSON.stringify([...next]));
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

  const groupedRefs = REF_TYPE_ORDER.map(type => ({
    type,
    label: REF_TYPE_LABELS[type],
    items: sortRefs(references.filter((r: any) => r.type === type)),
  })).filter(g => g.items.length > 0);

  const handleSubmitAnswer = async () => {
    if (!answer.trim() || isThinking) return;
    setIsThinking(true);

    const userMsg: ChatMsg = { role: "user", content: `Q: ${currentQuestion}\nA: ${answer.trim()}` };
    const newHistory = [...chatHistory, userMsg];

    try {
      const data = await brainstormChat({
        mode: "submit_answer",
        answer: answer.trim(),
        question: currentQuestion,
        compiled_description: description,
        bullet_breakdown: bullets,
        chat_history: newHistory,
        context: getContext(),
      });

      const { updated_description, updated_bullets, updated_tags, next_question, clarification } = data;

      // If AI returned a clarification (user asked a question / was uncertain)
      if (clarification && !updated_description) {
        const assistantMsg: ChatMsg = {
          role: "assistant",
          content: clarification,
        };
        const finalHistory = [...newHistory, assistantMsg];
        setCurrentQuestion(next_question);
        setAnswer("");

        await supabase.from("brainstorms").update({ chat_history: finalHistory }).eq("id", id!);
        queryClient.invalidateQueries({ queryKey: ["brainstorm", id] });
      } else {
        setDescription(updated_description);
        setBullets(updated_bullets);
        setCurrentQuestion(next_question);
        setAnswer("");

        const assistantMsg: ChatMsg = {
          role: "assistant",
          content: `Updated description and bullets. Next question: ${next_question}`,
        };
        const finalHistory = [...newHistory, assistantMsg];

        const updateFields: Record<string, any> = {
          compiled_description: updated_description,
          bullet_breakdown: updated_bullets,
          chat_history: finalHistory,
        };
        if (updated_tags && Array.isArray(updated_tags)) {
          updateFields.tags = updated_tags;
        }
        if (data.updated_category) {
          updateFields.category = data.updated_category;
        }

        await supabase.from("brainstorms").update(updateFields).eq("id", id!);
        queryClient.invalidateQueries({ queryKey: ["brainstorm", id] });
      }
    } catch (e: unknown) {
      const err = e as Error & { code?: string };
      if (err.code === "NO_API_KEY") openGeminiSettings();
      toast.error("Failed: " + err.message);
    } finally {
      setIsThinking(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const handleAnswerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmitAnswer();
    }
  };

  // Chatbot handler (post-promotion or scrapped)
  const handleChatSubmit = async () => {
    if (!chatInput.trim() || isChatThinking) return;
    const userMsg: ChatMsg = { role: "user", content: chatInput.trim() };
    const newHistory = [...queryChatHistory, userMsg];
    setQueryChatHistory(newHistory);
    setChatInput("");
    setIsChatThinking(true);

    try {
      const data = await brainstormChat({
        mode: "chat_query",
        chat_history: newHistory,
        is_locked: isLocked,
        context: {
          ...getContext(),
          compiled_description: description,
          bullet_breakdown: bullets,
          tags: (brainstorm as any)?.tags || [],
        },
      });

      // Process actions
      let createdNoteId: string | null = null;
      let createdNoteTitle: string | null = null;
      const createdLinks: { id: string; title: string }[] = [];
      if (data.actions && data.actions.length > 0) {
        for (const action of data.actions) {
          if (action.action === "create_note" && action.title) {
            const { data: noteData } = await supabase.from("brainstorm_references").insert({
              brainstorm_id: id!,
              user_id: user!.id,
              type: "note",
              title: action.title,
              description: action.content || "",
              sort_order: references.length,
            }).select("id").single();
            createdNoteId = noteData?.id || null;
            createdNoteTitle = action.title;
            queryClient.invalidateQueries({ queryKey: ["brainstorm-refs", id] });
            toast.success(`Note created: ${action.title}`);
          } else if (action.action === "update_description" && action.description) {
            const oldVal = description;
            setDescription(action.description);
            pushEntry("compiled_description", oldVal, action.description);
            await supabase.from("brainstorms").update({ compiled_description: action.description }).eq("id", id!);
            queryClient.invalidateQueries({ queryKey: ["brainstorm", id] });
            toast.success("Description updated");
          } else if (action.action === "update_bullets" && action.bullets) {
            const oldVal = bullets;
            setBullets(action.bullets);
            pushEntry("bullet_breakdown", oldVal, action.bullets);
            await supabase.from("brainstorms").update({ bullet_breakdown: action.bullets }).eq("id", id!);
            queryClient.invalidateQueries({ queryKey: ["brainstorm", id] });
            toast.success("Bullet breakdown updated");
          } else if (action.action === "create_link" && action.title && action.url) {
            const { data: linkData } = await supabase.from("brainstorm_references").insert({
              brainstorm_id: id!,
              user_id: user!.id,
              type: "link",
              title: action.title,
              url: action.url.match(/^https?:\/\//) ? action.url : `https://${action.url}`,
              description: action.description || "",
              sort_order: references.length,
            }).select("id").single();
            if (linkData?.id) createdLinks.push({ id: linkData.id, title: action.title });
            queryClient.invalidateQueries({ queryKey: ["brainstorm-refs", id] });
          }
        }
        // Consolidated toast for links
        if (createdLinks.length === 1) toast.success(`Link added: ${createdLinks[0].title}`);
        else if (createdLinks.length > 1) toast.success(`${createdLinks.length} links added`);
      }

      const assistantMsg: ChatMsg = {
        role: "assistant",
        content: data.answer || "Done.",
        ...(createdNoteId ? { noteId: createdNoteId, noteTitle: createdNoteTitle! } : {}),
        ...(createdLinks.length > 0 ? { links: createdLinks } : {}),
      };
      setQueryChatHistory([...newHistory, assistantMsg]);
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!brainstorm) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground">Brainstorm not found</p>
        <Button variant="link" onClick={() => navigate("/brainstorms")}>Back to brainstorms</Button>
      </div>
    );
  }

  const linkedIdea = (brainstorm as any)?.ideas;
  const brainstormCategory = (brainstorm as any)?.category || linkedIdea?.category;
  const brainstormTags: string[] = (brainstorm as any)?.tags || linkedIdea?.tags || [];
  const linkedCategoryClass = linkedIdea?.category ? CATEGORY_COLORS[linkedIdea.category] || "bg-secondary text-secondary-foreground" : "";
  const categoryBadgeClass = brainstormCategory ? CATEGORY_COLORS[brainstormCategory] || "bg-secondary text-secondary-foreground" : "";

  const getRefThumbnail = (ref: any): string | null => {
    if (ref.thumbnail_url) return ref.thumbnail_url;
    if (ref.type === "image" && ref.url) return ref.url;
    if (ref.type === "video" && ref.url) return getVideoThumbnail(ref.url);
    return null;
  };

  const currentStatusOption = BRAINSTORM_STATUS_OPTIONS.find(o => o.value === brainstorm.status);

  return (
    <div className="space-y-6">
      {/* 1. Title Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate("/brainstorms")}>
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
            className={`text-2xl font-bold ${!isLocked ? "cursor-pointer hover:text-primary transition-colors" : ""}`}
            onClick={() => !isLocked && setEditingTitle(true)}
          >
            {brainstorm.title}
          </h1>
        )}

        {/* Status selector for non-completed brainstorms */}
        {!isCompleted && (
          <Select value={brainstorm.status} onValueChange={(val) => updateBrainstorm.mutate({ status: val })}>
            <SelectTrigger className="w-[130px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BRAINSTORM_STATUS_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="ml-auto flex items-center gap-2">
          {isCompleted ? (
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 border gap-1">
              <CheckCircle2 className="h-3 w-3" /> Completed
            </Badge>
          ) : !isLocked ? (
            <>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={deleteBrainstorm.isPending}>
                    {deleteBrainstorm.isPending ? "Deleting…" : "Delete"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Move to trash?</AlertDialogTitle>
                    <AlertDialogDescription>This will move the brainstorm to trash. You can restore it later.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteBrainstorm.mutate()}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button
                onClick={() => promoteToProject.mutate()}
                disabled={promoteToProject.isPending}
                className="gap-2"
              >
                <Rocket className="h-4 w-4" />
                {promoteToProject.isPending ? "Promoting…" : "Promote to Project"}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {/* Created date + badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">
          Created {format(new Date(brainstorm.created_at), "MMM d, yyyy 'at' h:mm a")}
        </p>
        {brainstormCategory && (
          <Badge className={`text-xs border ${categoryBadgeClass}`}>{brainstormCategory}</Badge>
        )}
        {brainstorm.idea_id && (
          <Badge
            variant="outline"
            className="text-xs gap-1 cursor-pointer hover:bg-accent transition-colors"
            onClick={() => setShowLinkedIdea(true)}
          >
            <Lightbulb className="h-3 w-3 text-yellow-400" /> Linked Idea
          </Badge>
        )}
        {linkedProject && (
          <Badge
            variant="outline"
            className="text-xs gap-1 cursor-pointer hover:bg-accent transition-colors"
            onClick={() => navigate(`/projects/${linkedProject.id}`)}
          >
            <Wrench className="h-3 w-3 text-blue-400" /> Linked Project
          </Badge>
        )}
        {linkedCampaign && (
          <Badge
            variant="outline"
            className="text-xs gap-1 cursor-pointer hover:bg-accent transition-colors"
            onClick={() => navigate(`/campaigns/${linkedCampaign.id}`)}
          >
            <Megaphone className="h-3 w-3 text-orange-400" /> Linked Campaign
          </Badge>
        )}
      </div>

      {isCompleted && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          This brainstorm is locked because it has an active project. Delete the linked project to unlock editing.
        </div>
      )}

      <Separator />

      {/* 2. Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left column */}
        <div className="lg:col-span-3 space-y-6">
          {/* AI Interview (only shown when not locked) */}
          {!isLocked && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">AI Interview</p>
            <Card className="border-border bg-muted/30">
              <CardContent className="p-4 space-y-3">
                {isThinking && !currentQuestion ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ) : currentQuestion ? (
                  <>
                    <div className="flex items-start gap-2">
                      <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Bot className="h-3 w-3 text-primary" />
                      </div>
                      <p className="text-sm font-medium leading-relaxed">{currentQuestion}</p>
                    </div>
                    <Textarea
                      ref={textareaRef}
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      onKeyDown={handleAnswerKeyDown}
                      placeholder="Type your answer… (Enter to send, Shift+Enter for newline)"
                      className="min-h-[80px] resize-none text-sm"
                      disabled={isThinking}
                    />
                    <Button
                      onClick={handleSubmitAnswer}
                      disabled={!answer.trim() || isThinking}
                      className="w-full gap-2"
                    >
                      {isThinking ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Thinking…</>
                      ) : (
                        <><Send className="h-4 w-4" /> Submit Answer</>
                      )}
                    </Button>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-4 text-center">
                    <Bot className="h-8 w-8 text-muted-foreground/50 mb-2" />
                    <p className="text-xs text-muted-foreground">Loading interview questions…</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          )}

          {/* Compiled Description */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Compiled Description</p>
            <EditableMarkdown
              value={description}
              onChange={setDescription}
              onSave={handleSaveDescription}
              placeholder="Synthesize your idea description here…"
              minHeight="100px"
              readOnly={isLocked}
            />
          </div>

          {/* References */}
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-lg font-semibold">References</h2>
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
                      {(["link", "image", "video", "note"] as RefType[]).map((type) => {
                        const Icon = REF_ICONS[type];
                        const iconColor = REF_ICON_COLORS[type];
                        return (
                          <button
                            key={type}
                            onClick={() => setAddRefType(type)}
                            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent capitalize"
                          >
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
                <p className="text-sm text-muted-foreground">No references yet</p>
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

                            if (refViewMode === "list") {
                              return (
                                <HoverCard key={ref.id} openDelay={300} closeDelay={100}>
                                  <HoverCardTrigger asChild>
                                    <div
                                      className="flex items-center gap-3 p-2 rounded-lg border border-border/50 bg-card/50 cursor-pointer hover:border-primary/30 transition-colors"
                                      onClick={() => handleRefClick(ref)}
                                    >
                                      <Icon className={`h-4 w-4 ${iconColor} shrink-0`} />
                                      <span className="text-sm font-medium truncate flex-1">{ref.title}</span>
                                      {ref.description && (
                                        <span className="text-xs text-muted-foreground truncate max-w-[200px] hidden sm:inline">{ref.type === "note" ? ref.description.replace(/<[^>]*>/g, "").trim() : ref.description}</span>
                                      )}
                                      {!isLocked && (
                                        <div className="flex items-center gap-0.5 shrink-0">
                                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary" onClick={(e) => { e.stopPropagation(); handleEditRef(ref); }}>
                                            <Pencil className="h-3 w-3" />
                                          </Button>
                                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); deleteReference.mutate(ref); }}>
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
                                        {ref.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-4">{ref.type === "note" ? ref.description.replace(/<[^>]*>/g, "").trim() : ref.description}</p>}
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
                                  <Card
                                    className="border-border/50 bg-card/50 cursor-pointer hover:border-primary/30 transition-colors"
                                    onClick={() => handleRefClick(ref)}
                                  >
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
                                          {ref.description && (
                                            <p className="text-xs text-muted-foreground line-clamp-2">{ref.type === "note" ? ref.description.replace(/<[^>]*>/g, "").trim() : ref.description}</p>
                                          )}
                                        </div>
                                        {!isLocked && (
                                          <div className="flex flex-col gap-0.5 shrink-0">
                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary" onClick={(e) => { e.stopPropagation(); handleEditRef(ref); }}>
                                              <Pencil className="h-3 w-3" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); deleteReference.mutate(ref); }}>
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
                                      {ref.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-4">{ref.type === "note" ? ref.description.replace(/<[^>]*>/g, "").trim() : ref.description}</p>}
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
        </div>

        {/* Right column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Tags */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Tags</p>
            {brainstormTags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {brainstormTags.map((tag: string) => (
                  <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/60 italic">No tags yet</p>
            )}
          </div>

          {/* Bullet Breakdown */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Bullet Breakdown</p>
            <EditableMarkdown
              value={bullets}
              onChange={setBullets}
              onSave={handleSaveBullets}
              placeholder="- Key point 1&#10;- Key point 2&#10;- Key point 3"
              minHeight="80px"
              readOnly={isLocked}
            />
          </div>
        </div>
      </div>

      {/* Reference Viewer */}
      <ReferenceViewer
        reference={viewingRef}
        open={!!viewingRef}
        onOpenChange={(open) => { if (!open) setViewingRef(null); }}
      />

      {/* Linked Idea Dialog */}
      {linkedIdea && (
        <Dialog open={showLinkedIdea} onOpenChange={setShowLinkedIdea}>
          <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{linkedIdea.title || "Linked Idea"}</DialogTitle>
              <DialogDescription className="sr-only">View linked idea details</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs text-muted-foreground">
                  Created {linkedIdea.created_at ? format(new Date(linkedIdea.created_at), "MMM d, yyyy 'at' h:mm a") : "—"}
                </p>
                {linkedIdea.category && (
                  <Badge className={`text-xs border ${linkedCategoryClass}`}>{linkedIdea.category}</Badge>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Raw Dump</p>
                <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground whitespace-pre-wrap">
                  {linkedIdea.raw_dump}
                </div>
              </div>

              {linkedIdea.processed_summary && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Summary</p>
                  <p className="text-sm leading-relaxed">{linkedIdea.processed_summary}</p>
                </div>
              )}

              {linkedIdea.key_features && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Key Features</p>
                  <div className="text-sm text-muted-foreground">
                    <div dangerouslySetInnerHTML={{ __html: linkedIdea.key_features.replace(/^- /gm, "• ").replace(/\n/g, "<br/>") }} />
                  </div>
                </div>
              )}

              {linkedIdea.tags && linkedIdea.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {linkedIdea.tags.map((tag: string) => (
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

      {/* Add Reference Dialog */}
      <Dialog open={!!addRefType} onOpenChange={(open) => { if (!open) { setAddRefType(null); setRefForm({ title: "", url: "", description: "" }); setRefFile(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="capitalize">Add {addRefType}</DialogTitle>
            <DialogDescription className="sr-only">Add a new reference</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Title"
              value={refForm.title}
              onChange={(e) => setRefForm(p => ({ ...p, title: e.target.value }))}
            />
            {addRefType === "image" ? (
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => setRefFile(e.target.files?.[0] || null)}
              />
            ) : addRefType !== "note" ? (
              <Input
                placeholder="URL"
                value={refForm.url}
                onChange={(e) => setRefForm(p => ({ ...p, url: e.target.value }))}
              />
            ) : null}
            {addRefType === "note" ? (
              <RichTextNoteEditor
                value={refForm.description}
                onChange={(val) => setRefForm(p => ({ ...p, description: val }))}
                placeholder="Write your note…"
              />
            ) : (
              <Textarea
                placeholder="Description (optional)"
                value={refForm.description}
                onChange={(e) => setRefForm(p => ({ ...p, description: e.target.value }))}
                className="resize-none"
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddRefType(null)}>Cancel</Button>
            <Button
              onClick={handleAddRef}
              disabled={!refForm.title.trim() || addReference.isPending}
            >
              {addReference.isPending ? "Adding…" : "Add Reference"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Reference Dialog */}
      <Dialog open={!!editingRef} onOpenChange={(open) => { if (!open) { setEditingRef(null); setRefForm({ title: "", url: "", description: "" }); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Reference</DialogTitle>
            <DialogDescription className="sr-only">Edit an existing reference</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Title"
              value={refForm.title}
              onChange={(e) => setRefForm(p => ({ ...p, title: e.target.value }))}
            />
            {editingRef?.type !== "note" && editingRef?.type !== "image" && (
              <Input
                placeholder="URL"
                value={refForm.url}
                onChange={(e) => setRefForm(p => ({ ...p, url: e.target.value }))}
              />
            )}
            {editingRef?.type === "note" ? (
              <RichTextNoteEditor
                value={refForm.description}
                onChange={(val) => setRefForm(p => ({ ...p, description: val }))}
                placeholder="Write your note…"
              />
            ) : (
              <Textarea
                placeholder="Description (optional)"
                value={refForm.description}
                onChange={(e) => setRefForm(p => ({ ...p, description: e.target.value }))}
                className="resize-none"
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingRef(null)}>Cancel</Button>
            <Button
              onClick={handleSaveEditRef}
              disabled={!refForm.title.trim() || updateReference.isPending}
            >
              {updateReference.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floating Chat Widget -- always visible */}
      <FloatingChatWidget
        storageKey="chat-widget-brainstorm"
        title="Brainstorm Assistant"
        chatHistory={queryChatHistory}
        chatInput={chatInput}
        onInputChange={setChatInput}
        onSubmit={handleChatSubmit}
        isThinking={isChatThinking}
        placeholder="Ask questions about this brainstorm…"
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
                  {msg.linkId && (
                    <button
                      className="mt-2 ml-1 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition-colors"
                      onClick={() => {
                        const link = references.find((r: any) => r.id === msg.linkId);
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
                            const ref = references.find((r: any) => r.id === link.id);
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

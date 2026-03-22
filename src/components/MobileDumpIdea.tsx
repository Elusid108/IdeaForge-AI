import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Lightbulb, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { insertRow } from "@/lib/google-sheets-db";
import { openGeminiSettings, processIdeaClient } from "@/services/ai-service";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export default function MobileDumpIdea() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rawDump, setRawDump] = useState("");
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);

  useEffect(() => {
    return () => {
      isListeningRef.current = false;
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  const createIdea = useMutation({
    mutationFn: async (raw: string) => {
      const now = new Date().toISOString();
      return insertRow("ideas", {
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
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-items"] });
      setOpen(false);
      setRawDump("");
      toast.success("Idea captured! AI is processing…");
      void processIdeaClient({
        idea_id: data.id as string,
        raw_dump: String(data.raw_dump ?? ""),
      })
        .catch((err: unknown) => {
          const e = err as Error & { code?: string };
          if (e.code === "NO_API_KEY") openGeminiSettings();
          toast.error("AI processing failed — add a valid API key in Settings or try again.");
        })
        .finally(() => {
          queryClient.invalidateQueries({ queryKey: ["ideas"] });
        });
      navigate("/ideas");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleVoice = () => {
    if (!isListening) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        toast.error("Speech recognition not supported");
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
      recognition.onerror = () => {
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

  if (!user) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors md:hidden"
        aria-label="Dump Idea"
      >
        <Plus className="h-6 w-6" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
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
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => rawDump.trim() && createIdea.mutate(rawDump.trim())} disabled={!rawDump.trim() || createIdea.isPending}>
              {createIdea.isPending ? "Saving…" : "Save Idea"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

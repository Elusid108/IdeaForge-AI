import { useState, useRef, useEffect, ReactNode } from "react";
import { Bot, Send, X, Loader2, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

type ChatMsg = { role: "user" | "assistant"; content: string; noteId?: string; noteTitle?: string; widgetId?: string; widgetTitle?: string; linkId?: string; linkTitle?: string; links?: { id: string; title: string }[] };

type WidgetState = "collapsed" | "expanded" | "maximized";

interface FloatingChatWidgetProps {
  title: string;
  chatHistory: ChatMsg[];
  chatInput: string;
  onInputChange: (val: string) => void;
  onSubmit: () => void;
  isThinking: boolean;
  renderMessage: (msg: ChatMsg, i: number) => ReactNode;
  placeholder: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  storageKey?: string;
}

export default function FloatingChatWidget({
  title,
  chatHistory,
  chatInput,
  onInputChange,
  onSubmit,
  isThinking,
  renderMessage,
  placeholder,
  onKeyDown,
  storageKey,
}: FloatingChatWidgetProps) {
  const effectiveKey = storageKey || "chat-widget-state";
  const [state, setState] = useState<WidgetState>(() => {
    const saved = localStorage.getItem(effectiveKey);
    if (saved === "collapsed" || saved === "maximized") return saved;
    return "expanded";
  });

  useEffect(() => {
    localStorage.setItem(effectiveKey, state);
  }, [state, effectiveKey]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (state !== "collapsed") {
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 100);
    }
  }, [chatHistory, isThinking, state]);

  // Auto-focus textarea when AI finishes thinking
  useEffect(() => {
    if (!isThinking && state !== "collapsed" && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isThinking, state]);

  if (state === "collapsed") {
    return (
      <button
        onClick={() => setState("expanded")}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
      >
        <Bot className="h-4 w-4" />
        <span className="text-sm font-medium">{title}</span>
      </button>
    );
  }

  const isMaximized = state === "maximized";
  const widthClass = isMaximized ? "w-[600px]" : "w-[calc(100vw-2rem)] sm:w-[400px]";
  const maxHeightClass = isMaximized ? "max-h-[80vh]" : "max-h-[500px]";
  const msgMaxHeightClass = isMaximized ? "max-h-[60vh]" : "max-h-[350px]";

  return (
    <div className={`fixed bottom-4 right-4 z-50 ${widthClass} ${maxHeightClass} flex flex-col rounded-lg bg-card border border-border shadow-xl`}>
      {/* Title bar */}
      <div className="flex items-center justify-between px-3 py-2 rounded-t-lg bg-primary/10 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="h-3.5 w-3.5 text-primary" />
          <span className="text-sm font-medium">{title}</span>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setState(isMaximized ? "expanded" : "maximized")}
            title={isMaximized ? "Reduce" : "Expand"}
          >
            {isMaximized ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setState("collapsed")}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className={`flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px] ${msgMaxHeightClass}`}>
        {chatHistory.length === 0 && (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Bot className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-xs text-muted-foreground">{placeholder}</p>
          </div>
        )}
        {chatHistory.map((msg, i) => renderMessage(msg, i))}
        {isThinking && (
          <div className="flex items-start gap-2">
            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="h-3 w-3 text-primary" />
            </div>
            <Skeleton className="h-8 w-40 rounded-lg" />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border shrink-0">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={chatInput}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a message… (Enter to send)"
            className="min-h-[50px] max-h-[80px] resize-none text-sm flex-1"
            disabled={isThinking}
          />
          <Button
            onClick={onSubmit}
            disabled={!chatInput.trim() || isThinking}
            size="icon"
            className="shrink-0 self-end"
          >
            {isThinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

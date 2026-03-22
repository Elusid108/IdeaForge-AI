import { useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Bold, Italic, Underline, Strikethrough, List, ListOrdered, IndentIncrease, IndentDecrease } from "lucide-react";

interface RichTextNoteEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const TOOLBAR_BUTTONS = [
  { icon: Bold, command: "bold", tooltip: "Bold (Ctrl+B)" },
  { icon: Italic, command: "italic", tooltip: "Italic (Ctrl+I)" },
  { icon: Underline, command: "underline", tooltip: "Underline (Ctrl+U)" },
  { icon: Strikethrough, command: "strikeThrough", tooltip: "Strikethrough (Ctrl+Shift+X)" },
  { icon: List, command: "insertUnorderedList", tooltip: "Bullet list" },
  { icon: ListOrdered, command: "insertOrderedList", tooltip: "Numbered list" },
  { icon: IndentIncrease, command: "indent", tooltip: "Indent (Tab)" },
  { icon: IndentDecrease, command: "outdent", tooltip: "Dedent (Shift+Tab)" },
];

export default function RichTextNoteEditor({ value, onChange, placeholder }: RichTextNoteEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);

  // Set initial HTML content
  useEffect(() => {
    if (editorRef.current && !isInternalChange.current) {
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value || "";
      }
    }
    isInternalChange.current = false;
  }, [value]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      isInternalChange.current = true;
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const execCmd = (command: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false);
    requestAnimationFrame(() => handleInput());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const mod = e.metaKey || e.ctrlKey;

    if (mod && !e.shiftKey && e.key === "b") {
      e.preventDefault(); e.stopPropagation();
      execCmd("bold");
    } else if (mod && !e.shiftKey && e.key === "i") {
      e.preventDefault(); e.stopPropagation();
      execCmd("italic");
    } else if (mod && !e.shiftKey && e.key === "u") {
      e.preventDefault(); e.stopPropagation();
      execCmd("underline");
    } else if (mod && e.shiftKey && (e.key === "x" || e.key === "X")) {
      e.preventDefault(); e.stopPropagation();
      execCmd("strikeThrough");
    } else if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault(); e.stopPropagation();
      execCmd("indent");
    } else if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault(); e.stopPropagation();
      execCmd("outdent");
    }
  };

  return (
    <div className="space-y-0">
      <div className="flex items-center gap-0.5 border border-border rounded-t-md bg-muted/30 px-1 py-0.5">
        {TOOLBAR_BUTTONS.map(({ icon: Icon, command, tooltip }) => (
          <Button
            key={command}
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title={tooltip}
            onMouseDown={(e) => { e.preventDefault(); execCmd(command); }}
          >
            <Icon className="h-3.5 w-3.5" />
          </Button>
        ))}
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        data-placeholder={placeholder || "Write your note…"}
        className="min-h-[120px] w-full rounded-b-md border border-t-0 border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-muted-foreground"
      />
    </div>
  );
}

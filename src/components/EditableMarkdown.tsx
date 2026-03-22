import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Pencil } from "lucide-react";
import RichTextNoteEditor from "@/components/RichTextNoteEditor";
import { markdownComponents } from "@/lib/markdownComponents";

interface EditableMarkdownProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  placeholder?: string;
  minHeight?: string;
  readOnly?: boolean;
}

// Improved markdown-to-HTML converter that properly groups lists
function markdownToHtml(md: string): string {
  if (!md) return "";
  const lines = md.split("\n");
  const result: string[] = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) { result.push("</ul>"); inUl = false; }
    if (inOl) { result.push("</ol>"); inOl = false; }
  };

  for (const line of lines) {
    // Unordered list item
    const ulMatch = line.match(/^[-*]\s+(.+)$/);
    // Ordered list item
    const olMatch = line.match(/^\d+\.\s+(.+)$/);
    // Headings
    const h3Match = line.match(/^###\s+(.+)$/);
    const h2Match = line.match(/^##\s+(.+)$/);
    const h1Match = line.match(/^#\s+(.+)$/);

    if (ulMatch) {
      if (inOl) { result.push("</ol>"); inOl = false; }
      if (!inUl) { result.push("<ul>"); inUl = true; }
      let content = ulMatch[1];
      content = content.replace(/\*\*\*(.+?)\*\*\*/g, "<b><i>$1</i></b>");
      content = content.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
      content = content.replace(/\*(.+?)\*/g, "<i>$1</i>");
      result.push(`<li>${content}</li>`);
    } else if (olMatch) {
      if (inUl) { result.push("</ul>"); inUl = false; }
      if (!inOl) { result.push("<ol>"); inOl = true; }
      let content = olMatch[1];
      content = content.replace(/\*\*\*(.+?)\*\*\*/g, "<b><i>$1</i></b>");
      content = content.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
      content = content.replace(/\*(.+?)\*/g, "<i>$1</i>");
      result.push(`<li>${content}</li>`);
    } else {
      closeLists();
      if (h3Match) {
        result.push(`<h3>${h3Match[1]}</h3>`);
      } else if (h2Match) {
        result.push(`<h2>${h2Match[1]}</h2>`);
      } else if (h1Match) {
        result.push(`<h1>${h1Match[1]}</h1>`);
      } else if (line.trim() === "") {
        result.push("<br>");
      } else {
        let content = line;
        content = content.replace(/\*\*\*(.+?)\*\*\*/g, "<b><i>$1</i></b>");
        content = content.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
        content = content.replace(/\*(.+?)\*/g, "<i>$1</i>");
        result.push(`<p>${content}</p>`);
      }
    }
  }
  closeLists();
  return result.join("\n");
}

// Improved HTML-to-markdown converter that preserves list types
function htmlToMarkdown(html: string): string {
  if (!html) return "";
  let md = html;

  // Process ordered lists - convert <li> inside <ol> to numbered items
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner) => {
    let counter = 1;
    const items = inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_: string, content: string) => {
      return `${counter++}. ${content.trim()}\n`;
    });
    return items;
  });

  // Process unordered lists - convert <li> inside <ul> to bullet items
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner) => {
    const items = inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_: string, content: string) => {
      return `- ${content.trim()}\n`;
    });
    return items;
  });

  // Any remaining standalone <li> tags
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n");

  // Headings
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n");
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n");
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n");

  // Inline formatting
  md = md.replace(/<b>(.*?)<\/b>/gi, "**$1**");
  md = md.replace(/<strong>(.*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<i>(.*?)<\/i>/gi, "*$1*");
  md = md.replace(/<em>(.*?)<\/em>/gi, "*$1*");
  md = md.replace(/<u>(.*?)<\/u>/gi, "$1");
  md = md.replace(/<strike>(.*?)<\/strike>/gi, "~~$1~~");
  md = md.replace(/<s>(.*?)<\/s>/gi, "~~$1~~");

  // Block elements
  md = md.replace(/<br\s*\/?>/gi, "\n");
  md = md.replace(/<div>(.*?)<\/div>/gi, "$1\n");
  md = md.replace(/<p>(.*?)<\/p>/gi, "$1\n");

  // Strip remaining tags
  md = md.replace(/<[^>]*>/g, "");

  // Entities
  md = md.replace(/&nbsp;/g, " ");
  md = md.replace(/&amp;/g, "&");
  md = md.replace(/&lt;/g, "<");
  md = md.replace(/&gt;/g, ">");

  // Clean up extra newlines
  md = md.replace(/\n{3,}/g, "\n\n");
  return md.trim();
}

export default function EditableMarkdown({ value, onChange, onSave, placeholder, minHeight = "80px", readOnly }: EditableMarkdownProps) {
  const [editing, setEditing] = useState(false);
  const [htmlValue, setHtmlValue] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const htmlValueRef = useRef(htmlValue);

  useEffect(() => {
    htmlValueRef.current = htmlValue;
  }, [htmlValue]);

  useEffect(() => {
    if (editing) {
      setHtmlValue(markdownToHtml(value));
    }
  }, [editing]);

  // Click-outside auto-save
  useEffect(() => {
    if (!editing) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        const md = htmlToMarkdown(htmlValueRef.current);
        onChange(md);
        setEditing(false);
        setTimeout(() => onSave(), 0);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [editing, onChange, onSave]);

  if (editing && !readOnly) {
    return (
      <div ref={containerRef} className="rounded-lg bg-zinc-900/50 border border-white/5 p-4">
        <RichTextNoteEditor
          value={htmlValue}
          onChange={setHtmlValue}
          placeholder={placeholder}
        />
      </div>
    );
  }

  return (
    <div
      onClick={() => !readOnly && setEditing(true)}
      className={`group relative rounded-lg bg-zinc-900/50 border border-white/5 p-4 transition-colors ${!readOnly ? "cursor-pointer hover:border-white/10" : ""}`}
      style={{ minHeight }}
    >
      {!readOnly && (
        <Pencil className="absolute right-3 top-3 h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      )}
      {value ? (
        <div className="prose prose-invert prose-sm max-w-none leading-relaxed text-gray-300 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-0.5 [&_p]:my-1.5 [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_h1]:font-bold [&_h2]:font-semibold [&_h3]:font-medium">
          <ReactMarkdown components={markdownComponents}>{value}</ReactMarkdown>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">{placeholder || "Click to edit…"}</p>
      )}
    </div>
  );
}

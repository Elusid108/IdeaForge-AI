import React from "react";

// Shared markdown components config to ensure all links open in new tabs
export const markdownComponents = {
  a: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  ),
};

// Utility to add target="_blank" to all <a> tags in HTML strings (for dangerouslySetInnerHTML content)
export function addTargetBlankToHtml(html: string): string {
  return html.replace(/<a\s/g, '<a target="_blank" rel="noopener noreferrer" ');
}

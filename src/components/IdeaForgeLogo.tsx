export default function IdeaForgeLogo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Brain */}
      <path
        d="M32 8c-6 0-11 3-13 8-3 1-5 4-5 8 0 3 1.5 5.5 4 7l-1 3h30l-1-3c2.5-1.5 4-4 4-7 0-4-2-7-5-8-2-5-7-8-13-8z"
        fill="currentColor"
        opacity="0.85"
      />
      {/* Brain fold line */}
      <path
        d="M32 10v22"
        stroke="var(--background, #1a1a2e)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M26 16c-2 2-2 5 0 7M38 16c2 2 2 5 0 7"
        stroke="var(--background, #1a1a2e)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      {/* Lightning bolt cutting diagonally across */}
      <path
        d="M36 6 L28 28 L34 28 L26 52 L44 24 L36 24 Z"
        fill="currentColor"
        opacity="0.95"
        stroke="var(--background, #1a1a2e)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

import { useEffect, useState } from "react";
import { Image, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export interface DriveImageProps {
  fileId: string;
  alt: string;
  className?: string;
}

export default function DriveImage({ fileId, alt, className }: DriveImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const urlRef: { current: string | null } = { current: null };

    setStatus("loading");
    setObjectUrl(null);

    const run = async () => {
      const accessToken =
        typeof gapi !== "undefined" ? gapi.client.getToken()?.access_token : undefined;

      if (!accessToken) {
        if (!cancelled) setStatus("error");
        return;
      }

      try {
        const response = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          if (!cancelled) setStatus("error");
          return;
        }

        const blob = await response.blob();
        if (cancelled) return;

        const url = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }

        urlRef.current = url;
        setObjectUrl(url);
        setStatus("ready");
      } catch {
        if (!cancelled && !controller.signal.aborted) {
          setStatus("error");
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      controller.abort();
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [fileId]);

  if (status === "loading") {
    return (
      <div
        className={cn("relative min-h-[120px] w-full", className)}
        aria-busy
        role="img"
        aria-label={alt}
      >
        <Skeleton className="absolute inset-0 h-full min-h-[120px] w-full rounded-md" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
        </div>
      </div>
    );
  }

  if (status === "error" || !objectUrl) {
    return (
      <div
        className={cn(
          "flex min-h-[120px] w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/30 text-muted-foreground",
          className,
        )}
        role="img"
        aria-label={alt}
      >
        <Image className="h-8 w-8 opacity-60" aria-hidden />
        <span className="text-xs">Couldn&apos;t load image</span>
      </div>
    );
  }

  return <img src={objectUrl} alt={alt} className={cn(className)} loading="lazy" />;
}

import React, { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { saveRemoteFile } from "@/features/chat/lib/mediaUtils";

// Cross-origin safe file download anchor
export function DownloadLink({
  href,
  fileName,
  className,
  title = "Save as…",
  stopPropagation = false,
  children,
}) {
  const [busy, setBusy] = useState(false);

  const isLocal = href?.startsWith("blob:") || href?.startsWith("data:");

  const handleClick = async (e) => {
    if (stopPropagation) e.stopPropagation();
    if (isLocal) return;
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    try {
      toast.info(`Downloading ${fileName}…`, { duration: 2000 });
      await saveRemoteFile(href, fileName);
    } catch {
      toast.info(`Opening ${fileName} in new tab…`, { duration: 2500 });
      window.open(href, "_blank", "noopener,noreferrer");
    } finally {
      setBusy(false);
    }
  };

  return (
    <a
      href={href}
      download={fileName}
      {...(isLocal ? {} : { target: "_blank", rel: "noopener noreferrer" })}
      onClick={handleClick}
      title={title}
      aria-busy={busy}
      className={cn(className, busy && "pointer-events-none opacity-60")}
    >
      {children}
    </a>
  );
}

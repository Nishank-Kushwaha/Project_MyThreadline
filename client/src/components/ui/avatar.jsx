import React, { useEffect, useState } from "react";
import { cn, resolveAvatarUrl } from "@/lib/utils";

// One avatar for the whole app. Two protections that plain <img> tags lack:
//
// 1) referrerPolicy="no-referrer": Google's image host (lh3.googleusercontent.com)
//    often answers 403 when the request carries a Referer from your site,
//    especially from localhost. Sending no Referer avoids that.
// 2) onError fallback: if an image still fails (deleted, blocked, offline),
//    show the person's initial instead of a broken-image icon with alt text.
//
// Pass the size/text via className, e.g. className="h-10 w-10 text-sm".
export function Avatar({ src, name, alt = "", className }) {
  const [failed, setFailed] = useState(false);

  // A new src (e.g. after uploading a new photo) deserves a fresh attempt.
  useEffect(() => setFailed(false), [src]);

  const url = resolveAvatarUrl(src);

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary font-bold text-primary-foreground",
        className,
      )}
    >
      {url && !failed ? (
        <img
          src={url}
          alt={alt}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        name?.[0]?.toUpperCase() || "?"
      )}
    </div>
  );
}

import React, { useEffect, useState } from "react";
import { ExternalLink, Globe, Play } from "lucide-react";
import { cn } from "@/lib/utils";

// Regex to detect URLs (http, https, or www)
export const URL_REGEX =
  /(https?:\/\/[^\s<]+[^<.,:;"')\]\s]|www\.[^\s<]+[^<.,:;"')\]\s])/gi;

/**
 * Extracts first valid URL found in text, or null.
 */
export function extractFirstUrl(text) {
  if (!text) return null;
  const match = text.match(URL_REGEX);
  if (!match || match.length === 0) return null;
  let url = match[0];
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url;
}

/**
 * Parses URLs out of text and returns formatted elements with clean clickable links.
 */
export function FormattedMessageText({ text, isOwn }) {
  if (!text) return null;

  const parts = text.split(URL_REGEX);

  return (
    <p className="whitespace-pre-wrap wrap-break-word text-sm">
      {parts.map((part, index) => {
        if (part.match(URL_REGEX)) {
          const href = /^https?:\/\//i.test(part) ? part : `https://${part}`;
          return (
            <a
              key={index}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "underline font-medium break-all hover:opacity-80 transition-opacity",
                isOwn
                  ? "text-primary-foreground font-semibold decoration-primary-foreground/70"
                  : "text-primary decoration-primary/70",
              )}
            >
              {part}
            </a>
          );
        }
        return part;
      })}
    </p>
  );
}

// Memory cache for fetched previews so we don't refetch on every re-render
const previewCache = new Map();

/**
 * Rich Preview Card matching WhatsApp UI:
 * Placed ABOVE the link text with thumbnail image, bold title, description snippet, and host.
 */
export function LinkPreviewCard({ url, isOwn }) {
  const [data, setData] = useState(() => previewCache.get(url) || null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (!url) return;
    if (previewCache.has(url)) {
      setData(previewCache.get(url));
      return;
    }

    let isMounted = true;

    async function fetchMetadata() {
      try {
        const parsed = new URL(url);
        const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

        // 1. YouTube (official free oEmbed endpoint - no key required)
        if (
          host === "youtube.com" ||
          host === "m.youtube.com" ||
          host === "youtu.be"
        ) {
          const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
          const res = await fetch(oembedUrl);
          if (res.ok) {
            const yt = await res.json();
            const meta = {
              title: yt.title || "YouTube Video",
              description: yt.author_name
                ? `${yt.author_name} • YouTube`
                : "Watch on YouTube",
              image: yt.thumbnail_url,
              hostname: "youtube.com",
              isVideo: true,
            };
            previewCache.set(url, meta);
            if (isMounted) setData(meta);
            return;
          }
        }

        // 2. GitHub (official free public API)
        if (host === "github.com") {
          const pathParts = parsed.pathname.split("/").filter(Boolean);
          if (pathParts.length >= 2) {
            const [owner, repo] = pathParts;
            const res = await fetch(
              `https://api.github.com/repos/${owner}/${repo}`,
            );
            if (res.ok) {
              const gh = await res.json();
              const meta = {
                title: gh.full_name || `${owner}/${repo}`,
                description: gh.description || "GitHub repository",
                image: `https://opengraph.githubassets.com/1/${owner}/${repo}`,
                hostname: "github.com",
              };
              previewCache.set(url, meta);
              if (isMounted) setData(meta);
              return;
            }
          }
        }

        // 3. Instagram path formatting (e.g. /milliebobbybrown)
        if (host === "instagram.com") {
          const pathParts = parsed.pathname.split("/").filter(Boolean);
          const handle = pathParts[0];
          const isPost = handle === "p" || handle === "reel";
          const title = handle
            ? isPost
              ? "Instagram Post"
              : `${handle} • Instagram photos and videos`
            : "Instagram";

          const meta = {
            title,
            description: "See Instagram photos and videos",
            image: null,
            hostname: "www.instagram.com",
          };
          previewCache.set(url, meta);
          if (isMounted) setData(meta);
          return;
        }

        // 4. Fallback for generic websites
        const pathname = parsed.pathname !== "/" ? parsed.pathname : "";
        const meta = {
          title: host.charAt(0).toUpperCase() + host.slice(1),
          description: pathname ? `${host}${pathname}` : `Visit ${host}`,
          image: null,
          hostname: host,
        };
        previewCache.set(url, meta);
        if (isMounted) setData(meta);
      } catch (err) {
        console.warn("Could not load link preview:", err);
      }
    }

    fetchMetadata();
    return () => {
      isMounted = false;
    };
  }, [url]);

  if (!url) return null;

  let hostname = data?.hostname;
  if (!hostname) {
    try {
      hostname = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  }

  const title = data?.title || hostname;
  const description = data?.description || hostname;
  const image = !imgError && data?.image ? data.image : null;
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "group/preview mb-2 block overflow-hidden rounded-xl transition-all duration-200 select-none text-left",
        isOwn
          ? "bg-black/20 text-primary-foreground hover:bg-black/30"
          : "bg-black/5 dark:bg-white/5 text-foreground hover:bg-black/10 dark:hover:bg-white/10",
      )}
    >
      <div className="flex items-stretch min-w-0">
        {/* Left Thumbnail (WhatsApp style square image with optional play badge) */}
        {image ? (
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 shrink-0 bg-black/10 overflow-hidden">
            <img
              src={image}
              alt=""
              onError={() => setImgError(true)}
              className="h-full w-full object-cover transition-transform duration-200 group-hover/preview:scale-105"
            />
            {data?.isVideo && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white shadow-md">
                  <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex w-16 sm:w-20 shrink-0 items-center justify-center bg-black/10 dark:bg-white/5">
            <img
              src={faviconUrl}
              alt=""
              onError={(e) => {
                e.target.style.display = "none";
              }}
              className="h-7 w-7 object-contain rounded-xs"
            />
          </div>
        )}

        {/* Content Details: Title, Description, and Source Host */}
        <div className="flex min-w-0 flex-1 flex-col justify-center p-2.5 pl-3">
          <p
            className={cn(
              "line-clamp-2 text-xs font-bold leading-snug",
              isOwn ? "text-primary-foreground" : "text-foreground",
            )}
          >
            {title}
          </p>
          <p
            className={cn(
              "mt-0.5 line-clamp-1 text-[11px] opacity-80",
              isOwn ? "text-primary-foreground" : "text-muted-foreground",
            )}
          >
            {description}
          </p>
          <div className="mt-1 flex items-center gap-1.5 text-[10px] opacity-70">
            <span className="truncate">{hostname}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </div>
        </div>
      </div>
    </a>
  );
}

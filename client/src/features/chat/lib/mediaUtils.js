import {
  FileText,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  FileAudio,
  FileVideo,
  File,
  Image as ImageIcon,
} from "lucide-react";

// Extension to kind mappings
const EXTENSION_KINDS = {};
function register(kind, extensions) {
  for (const ext of extensions.split(" ")) EXTENSION_KINDS[ext] = kind;
}
register("image", "jpg jpeg png webp gif bmp svg");
register("pdf", "pdf");
register("text", "txt csv json md markdown log xml yaml yml");
register("code", "js jsx mjs cjs ts tsx html htm css py c h cpp cc cxx hpp java sql");
register("archive", "zip rar 7z tar gz tgz");
register("office", "doc docx xls xlsx ppt pptx");
register("audio", "mp3 wav ogg oga m4a aac flac opus weba");
register("video", "mp4 m4v webm mov mkv avi ogv");

// Kinds whose extension takes precedence over generic/claimed MIME
const EXTENSION_WINS = new Set(["pdf", "text", "code", "archive", "office"]);

// MIME hints for browser playback check when MIME is omitted
export const EXTENSION_MEDIA_MIME = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  opus: "audio/ogg; codecs=opus",
  weba: "audio/webm",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  ogv: "video/ogg",
};

const ARCHIVE_MIMES = new Set([
  "application/zip",
  "application/x-zip",
  "application/x-zip-compressed",
  "application/vnd.rar",
  "application/x-rar",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
  "application/x-tar",
  "application/x-gtar",
  "application/gzip",
  "application/x-gzip",
  "application/x-tgz",
  "application/x-compressed",
]);

const CODE_MIME_RE =
  /^(?:text\/(?:html|css|javascript|typescript|x-(?:c|csrc|chdr|c\+\+|c\+\+src|java|java-source|python|sql))|application\/(?:x-)?(?:javascript|typescript|sql))$/;

const OFFICE_MIME_RE =
  /(msword|ms-excel|ms-powerpoint|wordprocessingml|spreadsheetml|presentationml)/;

const NOUN_BY_KIND = {
  image: "image",
  pdf: "document",
  text: "text file",
  code: "source file",
  archive: "archive",
  office: "document",
  audio: "audio",
  video: "video",
  unknown: "file",
};

export function normalizeMime(fileType) {
  return String(fileType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

export function getExtension(fileName) {
  const base = String(fileName || "")
    .split(/[\\/]/)
    .pop()
    .trim();
  const dot = base.lastIndexOf(".");
  return dot > 0 && dot < base.length - 1
    ? base.slice(dot + 1).toLowerCase()
    : "";
}

export function kindFromMime(mime) {
  if (!mime) return null;
  if (mime === "application/pdf" || mime === "application/x-pdf") return "pdf";
  if (OFFICE_MIME_RE.test(mime)) return "office";
  if (ARCHIVE_MIMES.has(mime)) return "archive";
  if (CODE_MIME_RE.test(mime)) return "code";
  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/yaml" ||
    mime === "application/x-yaml" ||
    mime === "application/xml" ||
    mime.endsWith("+json") ||
    mime.endsWith("+xml")
  )
    return "text";
  return null;
}

export function classifyAttachment(fileType, fileName) {
  const mime = normalizeMime(fileType);
  const ext = getExtension(fileName);
  const extKind = EXTENSION_KINDS[ext];

  let kind;
  if (extKind && EXTENSION_WINS.has(extKind)) kind = extKind;
  else if (mime.startsWith("image/")) kind = "image";
  else if (mime.startsWith("audio/")) kind = "audio";
  else if (mime.startsWith("video/")) kind = "video";
  else if (extKind) kind = extKind;
  else kind = kindFromMime(mime) || "unknown";

  const noun = NOUN_BY_KIND[kind];
  const label =
    ext && ext.length <= 5 && kind !== "unknown"
      ? `${ext.toUpperCase()} ${noun}`
      : ext && ext.length <= 5
        ? `${ext.toUpperCase()} file`
        : noun.charAt(0).toUpperCase() + noun.slice(1);

  return { kind, ext, mime, label };
}

export function getFileIcon(fileType = "", fileName = "") {
  const { kind, ext } = classifyAttachment(fileType, fileName);
  switch (kind) {
    case "image":
      return ImageIcon;
    case "pdf":
      return FileText;
    case "archive":
      return FileArchive;
    case "code":
      return FileCode;
    case "text":
      if (ext === "csv") return FileSpreadsheet;
      if (["json", "xml", "yaml", "yml"].includes(ext)) return FileCode;
      return FileText;
    case "office":
      return ext === "xls" || ext === "xlsx" ? FileSpreadsheet : FileText;
    case "audio":
      return FileAudio;
    case "video":
      return FileVideo;
    default:
      return File;
  }
}

export function canBrowserPlay(kind, mime) {
  if (typeof document === "undefined" || !mime) return false;
  try {
    const el = document.createElement(kind);
    return typeof el.canPlayType === "function" && el.canPlayType(mime) !== "";
  } catch {
    return false;
  }
}

export const TEXT_PREVIEW_MAX_BYTES = 512 * 1024;

export async function readTextPreview(url, signal) {
  const res = await fetch(url, {
    signal,
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const chunks = [];
  let received = 0;
  let truncated = false;

  if (res.body?.getReader) {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const room = TEXT_PREVIEW_MAX_BYTES - received;
      if (value.length > room) {
        chunks.push(value.subarray(0, room));
        received += room;
        truncated = true;
        await reader.cancel().catch(() => {});
        break;
      }
      chunks.push(value);
      received += value.length;
    }
  } else {
    const all = new Uint8Array(await res.arrayBuffer());
    truncated = all.length > TEXT_PREVIEW_MAX_BYTES;
    chunks.push(all.subarray(0, TEXT_PREVIEW_MAX_BYTES));
    received = chunks[0].length;
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  let encoding = "utf-8";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = "utf-16le";
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = "utf-16be";

  if (encoding === "utf-8" && bytes.subarray(0, 8192).includes(0)) {
    const err = new Error("Binary content");
    err.code = "binary";
    throw err;
  }

  return { text: new TextDecoder(encoding).decode(bytes), truncated };
}

export async function saveRemoteFile(href, fileName) {
  const res = await fetch(href, {
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const objectUrl = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
}

export function formatMediaTime(seconds) {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "0:00";
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m < 60) {
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h}:${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

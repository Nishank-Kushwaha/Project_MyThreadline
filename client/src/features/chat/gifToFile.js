// Downloads a picked GIF and wraps it as a File, so it goes through the same
// attachment flow (validation, preview, encryption, upload) as any other file.
export async function gifToFile(gif) {
  const url = gif?.imageUrl;
  if (!url) throw new Error("GIF has no imageUrl");

  const res = await fetch(url, {
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();

  const base =
    String(gif.description || "gif")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "gif";

  // Forced type: this routes it to GifImagePlayer on the receiving side.
  return new File([blob], `${base}.gif`, { type: "image/gif" });
}

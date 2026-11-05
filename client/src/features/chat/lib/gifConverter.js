import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let ffmpegInstance = null;
let loadPromise = null;

/**
 * Lazily loads and returns the singleton single-threaded FFmpeg instance.
 */
async function getFFmpeg() {
  if (ffmpegInstance && ffmpegInstance.loaded) return ffmpegInstance;

  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const ffmpeg = new FFmpeg();

    try {
      // First try local unpkg / CDN ESM build of single-threaded @ffmpeg/core 0.12.x
      // (single-threaded build avoids SharedArrayBuffer / COOP / COEP requirements)
      const cdnBase = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
      const coreURL = await toBlobURL(`${cdnBase}/ffmpeg-core.js`, "text/javascript");
      const wasmURL = await toBlobURL(`${cdnBase}/ffmpeg-core.wasm`, "application/wasm");

      await ffmpeg.load({ coreURL, wasmURL });
      ffmpegInstance = ffmpeg;
      return ffmpeg;
    } catch (err) {
      console.warn("Primary FFmpeg CDN load failed, attempting fallback cdnjs/jsdelivr...", err);
      try {
        const fallbackBase = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm";
        const coreURL = await toBlobURL(`${fallbackBase}/ffmpeg-core.js`, "text/javascript");
        const wasmURL = await toBlobURL(`${fallbackBase}/ffmpeg-core.wasm`, "application/wasm");

        await ffmpeg.load({ coreURL, wasmURL });
        ffmpegInstance = ffmpeg;
        return ffmpeg;
      } catch (fallbackErr) {
        loadPromise = null;
        throw new Error(`Failed to load GIF video converter: ${fallbackErr.message || fallbackErr}`);
      }
    }
  })();

  return loadPromise;
}

/**
 * Converts any GIF File/Blob into a silent, web-optimized H.264 MP4 File (WhatsApp-style).
 *
 * WhatsApp/Telegram GIF standards applied:
 * - Silent video: no audio track (-an)
 * - Container: ISO BMFF MP4
 * - Codec / Pixel Format: H.264 / YUV420p for universal mobile and web support (-pix_fmt yuv420p)
 * - Streamable: moov atom placed at front for instant progressive play (-movflags faststart)
 * - Even dimensions: scaled to 2x boundary required by H.264 (-vf scale=trunc(iw/2)*2:trunc(ih/2)*2)
 *
 * @param {File|Blob} file - The source GIF file or blob
 * @param {Function} [onProgress] - Optional progress callback (ratio 0..1)
 * @returns {Promise<File>} An MP4 File object with `isGif = true`
 */
export async function convertGifToMp4(file, onProgress) {
  if (!file) throw new Error("No file provided for GIF conversion");

  // If already an MP4, just normalize metadata and return
  const mime = String(file.type || "").toLowerCase();
  const name = String(file.name || "gif").replace(/\.[^/.]+$/, "");
  if (mime === "video/mp4" || file.name?.toLowerCase().endsWith(".mp4")) {
    const mp4File = file instanceof File ? file : new File([file], `${name}.mp4`, { type: "video/mp4" });
    mp4File.isGif = true;
    mp4File.gifPlayback = true;
    return mp4File;
  }

  const ffmpeg = await getFFmpeg();

  // Progress monitoring
  const progressHandler = ({ progress }) => {
    if (typeof onProgress === "function" && typeof progress === "number") {
      onProgress(Math.min(1, Math.max(0, progress)));
    }
  };
  ffmpeg.on("progress", progressHandler);

  const inputName = `input_${Date.now()}.gif`;
  const outputName = `output_${Date.now()}.mp4`;

  try {
    const fileData = await fetchFile(file);
    await ffmpeg.writeFile(inputName, fileData);

    // Convert GIF to silent H.264 MP4 with WhatsApp-compatible flags
    await ffmpeg.exec([
      "-i",
      inputName,
      "-movflags",
      "faststart",
      "-pix_fmt",
      "yuv420p",
      "-vf",
      "scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-an",
      outputName,
    ]);

    const data = await ffmpeg.readFile(outputName);
    const mp4Blob = new Blob([data.buffer], { type: "video/mp4" });

    const mp4File = new File([mp4Blob], `${name}.mp4`, {
      type: "video/mp4",
      lastModified: Date.now(),
    });

    mp4File.isGif = true;
    mp4File.gifPlayback = true;
    return mp4File;
  } finally {
    ffmpeg.off("progress", progressHandler);
    // Cleanup virtual filesystem files to prevent memory leaks
    try {
      await ffmpeg.deleteFile(inputName);
    } catch {}
    try {
      await ffmpeg.deleteFile(outputName);
    } catch {}
  }
}

// ponytail: the shell used to be a fully dark palette, but we
// now support light mode + accent themes. The deterministic nick
// colour needs to be readable against either background.

const NICK_PALETTE_DARK = [
  "#f472b6",
  "#fbbf24",
  "#34d399",
  "#22d3ee",
  "#a78bfa",
  "#fb7185",
  "#c084fc",
  "#60a5fa",
  "#facc15",
  "#4ade80",
  "#f97316",
  "#e879f9",
];

const NICK_PALETTE_LIGHT = [
  "#db2777",
  "#d97706",
  "#059669",
  "#0891b2",
  "#7c3aed",
  "#e11d48",
  "#a21caf",
  "#2563eb",
  "#ca8a04",
  "#16a34a",
  "#ea580c",
  "#c026d3",
];

function hashNick(nick: string): number {
  let h = 0;
  for (let i = 0; i < nick.length; i++) {
    h = (h * 31 + nick.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getNickColor(nick: string, mode: "light" | "dark" = "dark"): string {
  const palette = mode === "light" ? NICK_PALETTE_LIGHT : NICK_PALETTE_DARK;
  return palette[hashNick(nick) % palette.length];
}

export const AVATAR_PX = 256;

/**
 * Downscale an avatar to a square AVATAR_PX WebP before upload.
 *
 * The server stores avatars inline (base64 in the users row), and
 * `avatar_url` rides along on /me, /users/{id} and /users/batch — which
 * the chat's user_cache hits in bulk. A 2 MB upload becomes ~2.7 MB of
 * base64 on all of those; at 256px WebP it lands around 15-25 KB.
 *
 * `imageOrientation: "from-image"` applies EXIF rotation, so portrait
 * phone photos don't come out sideways. Animated GIFs collapse to their
 * first frame — deliberate, an animated avatar can't be stored inline
 * at a sane size.
 */
export async function downscaleAvatar(file: File | Blob): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  // Cover-crop: scale so the short edge fills the square, centre the rest.
  const scale = Math.max(AVATAR_PX / bmp.width, AVATAR_PX / bmp.height);
  const w = bmp.width * scale;
  const h = bmp.height * scale;
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_PX;
  canvas.height = AVATAR_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.drawImage(bmp, (AVATAR_PX - w) / 2, (AVATAR_PX - h) / 2, w, h);
  bmp.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("no se pudo procesar la imagen"))),
      "image/webp",
      0.85,
    );
  });
}

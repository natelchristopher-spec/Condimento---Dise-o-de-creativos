'use client';

/**
 * Reads a File and returns a compressed JPEG data URL.
 * Uses blob URL (avoids loading the full file into memory before canvas).
 * Falls back through 3 quality levels to handle very large images.
 * Returns '' if all attempts fail — never returns the original uncompressed file.
 */
export const readAsImage = (file: File): Promise<string> =>
  new Promise(resolve => {
    const blobUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(blobUrl);
      const tryAt = (maxDim: number, quality: number): string | null => {
        try {
          let { naturalWidth: w, naturalHeight: h } = img;
          if (!w || !h) return null;
          if (w > maxDim || h > maxDim) {
            if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
            else { w = Math.round(w * maxDim / h); h = maxDim; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          const out = canvas.toDataURL('image/jpeg', quality);
          return out.length > 100 ? out : null;
        } catch { return null; }
      };
      resolve(tryAt(1024, 0.82) || tryAt(768, 0.75) || tryAt(512, 0.65) || '');
    };
    img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(''); };
    img.src = blobUrl;
  });

/**
 * Reads a logo file and returns a PNG data URL preserving transparency.
 * Unlike readAsImage, does NOT fill with white — alpha channel is kept intact.
 * Accepts any browser-renderable format: PNG, JPG, WebP, SVG, GIF.
 * Max 512px on the longest side (logos don't need large dimensions).
 */
export const readAsLogo = (file: File): Promise<string> =>
  new Promise(resolve => {
    const blobUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(blobUrl);
      try {
        let { naturalWidth: w, naturalHeight: h } = img;
        if (!w || !h) { resolve(''); return; }
        const maxDim = 512;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
          else { w = Math.round(w * maxDim / h); h = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, w, h);
        const out = canvas.toDataURL('image/png');
        resolve(out.length > 100 ? out : '');
      } catch { resolve(''); }
    };
    img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(''); };
    img.src = blobUrl;
  });

// Target pixel dimensions for Meta/Google ad formats
const FORMAT_TARGET_PX: Record<string, { w: number; h: number }> = {
  square: { w: 1080, h: 1080 },
  instant_exp: { w: 1080, h: 1920 },
  story: { w: 1080, h: 1920 },
  landscape: { w: 1920, h: 1080 },
};

/**
 * Downloads a base64 image at exact target pixel dimensions for the given format.
 * Uses Canvas cover mode: scales proportionally to fill target, crops minimal excess from center.
 * If the format has no pixel target, falls back to direct download.
 */
export function downloadExact(base64: string, name: string, format?: string): void {
  const target = format ? FORMAT_TARGET_PX[format] : undefined;
  if (!target) {
    const a = document.createElement('a');
    a.href = `data:image/png;base64,${base64}`;
    a.download = name;
    a.click();
    return;
  }
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = target.w;
    canvas.height = target.h;
    const ctx = canvas.getContext('2d')!;
    const srcRatio = img.naturalWidth / img.naturalHeight;
    const dstRatio = target.w / target.h;
    let dw: number, dh: number;
    if (srcRatio > dstRatio) { dh = target.h; dw = dh * srcRatio; }
    else { dw = target.w; dh = dw / srcRatio; }
    ctx.drawImage(img, (target.w - dw) / 2, (target.h - dh) / 2, dw, dh);
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }, 'image/png');
  };
  img.onerror = () => {
    const a = document.createElement('a');
    a.href = `data:image/png;base64,${base64}`;
    a.download = name; a.click();
  };
  img.src = `data:image/png;base64,${base64}`;
}

/**
 * Compresses an existing base64 string to a smaller JPEG.
 * Used before sending images to the API to keep payloads small.
 * Falls back through 3 quality levels.
 * Returns '' if all attempts fail — never returns the original uncompressed base64.
 */
export const compressImage = (base64: string, maxDim = 1024): Promise<string> =>
  new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const tryAt = (dim: number, quality: number): string | null => {
        try {
          let { naturalWidth: w, naturalHeight: h } = img;
          if (!w || !h) return null;
          if (w > dim || h > dim) {
            if (w > h) { h = Math.round(h * dim / w); w = dim; }
            else { w = Math.round(w * dim / h); h = dim; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          const out = canvas.toDataURL('image/jpeg', quality);
          return out.length > 100 ? out.split(',')[1] : null;
        } catch { return null; }
      };
      resolve(
        tryAt(maxDim, 0.82) ||
        tryAt(Math.round(maxDim * 0.75), 0.75) ||
        tryAt(512, 0.65) ||
        ''
      );
    };
    img.onerror = () => resolve('');
    img.src = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
  });

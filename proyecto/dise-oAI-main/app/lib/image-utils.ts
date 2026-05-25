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

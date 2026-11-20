import { ChangeEvent } from 'react';
import { EvidencePhoto } from '../types/alle';

export async function readCompressedEvidencePhotos(
  e: ChangeEvent<HTMLInputElement>,
  existingCount: number,
  maxPhotos = 3
): Promise<EvidencePhoto[]> {
  const remaining = Math.max(0, maxPhotos - existingCount);
  const files = Array.from(e.target.files ?? []).slice(0, remaining);
  e.target.value = '';
  if (files.length === 0) return [];

  const compressOne = (file: File): Promise<EvidencePhoto | null> =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const rawUrl = typeof reader.result === 'string' ? reader.result : '';
        if (!rawUrl) {
          resolve(null);
          return;
        }
        const img = new Image();
        img.onload = () => {
          const maxDim = 720;
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve({ name: file.name, dataUrl: rawUrl });
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve({
            name: file.name,
            dataUrl: canvas.toDataURL('image/jpeg', 0.72),
          });
        };
        img.onerror = () => resolve({ name: file.name, dataUrl: rawUrl });
        img.src = rawUrl;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });

  const loaded = await Promise.all(files.map(compressOne));
  return loaded.filter((item): item is EvidencePhoto => Boolean(item));
}

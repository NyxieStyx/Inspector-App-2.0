/**
 * Compresses an image File or Blob using HTML5 Canvas to ensure rapid field uploads
 * and optimized storage on Google Drive.
 * Target: Max dimension 1280px, JPEG quality 0.82 (typically 100KB-280KB, down from 5MB+).
 */
export async function compressImage(
  file: File | Blob,
  maxDimension = 1280,
  quality = 0.82
): Promise<{ blob: Blob; dataUrl: string; fileSizeKb: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image into DOM'));
      img.onload = () => {
        let { width, height } = img;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Failed to get 2D canvas context'));
          return;
        }

        // Draw image with high quality smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to compressed JPEG Blob for IndexedDB storage
        canvas.toBlob(
          (blob) => {
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            if (!blob) {
              // Fallback conversion from dataUrl if canvas.toBlob returns null
              const parts = dataUrl.split(',');
              const byteStr = atob(parts[1] || '');
              const bytes = new Uint8Array(byteStr.length);
              for (let i = 0; i < byteStr.length; i++) {
                bytes[i] = byteStr.charCodeAt(i);
              }
              const fallbackBlob = new Blob([bytes], { type: 'image/jpeg' });
              resolve({
                blob: fallbackBlob,
                dataUrl,
                fileSizeKb: Math.max(1, Math.round(fallbackBlob.size / 1024)),
                width,
                height,
              });
              return;
            }

            resolve({
              blob,
              dataUrl,
              fileSizeKb: Math.max(1, Math.round(blob.size / 1024)),
              width,
              height,
            });
          },
          'image/jpeg',
          quality
        );
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

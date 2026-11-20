/**
 * Compresses an image File or Blob using HTML5 Canvas to ensure rapid field uploads
 * and optimized storage on Google Drive.
 * Target: Max dimension 1280px, JPEG quality 0.82 (typically 100KB-280KB, down from 5MB+).
 */
export async function compressImage(
  file: File | Blob,
  maxDimension = 1280,
  quality = 0.82
): Promise<{ dataUrl: string; fileSizeKb: number; width: number; height: number }> {
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

        // Convert to compressed JPEG data URL
        const dataUrl = canvas.toDataURL('image/jpeg', quality);

        // Calculate approximate file size in KB from base64 string
        const base64Length = dataUrl.length - (dataUrl.indexOf(',') + 1);
        const fileSizeKb = Math.round((base64Length * 3) / 4 / 1024);

        resolve({
          dataUrl,
          fileSizeKb,
          width,
          height,
        });
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

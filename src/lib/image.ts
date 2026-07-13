// Downscale a picked image to ≤maxPx on its longest side and return a small
// JPEG data-URL. Keeps upload payloads modest before they hit the backend.
export function fileToResizedDataUrl(file: File, maxPx = 1280, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error("Could not read the image."));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxPx) {
          height = Math.round((height * maxPx) / width);
          width = maxPx;
        } else if (height > maxPx) {
          width = Math.round((width * maxPx) / height);
          height = maxPx;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas is not supported."));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

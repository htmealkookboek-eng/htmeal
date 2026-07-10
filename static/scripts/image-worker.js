// Image compression worker using OffscreenCanvas and createImageBitmap
self.requestId = 0;
self.onmessage = async function(e) {
  const data = e.data || {};
  const id = data.id;
  try {
    const arrayBuffer = data.fileBuffer;
    const mimeGuess = data.fileType || 'image/*';
    const maxWidth = data.maxWidth || 1400;
    const maxHeight = data.maxHeight || 1400;

    const blob = new Blob([arrayBuffer], { type: mimeGuess });
    const bitmap = await createImageBitmap(blob);
    let width = bitmap.width;
    let height = bitmap.height;
    const ratio = Math.min(1, maxWidth / width, maxHeight / height);
    if (ratio < 1) {
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    let canvas;
    if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(width, height);
    } else {
      // should not happen in worker, but fallback: return original as blob URL
      const reader = new FileReader();
      reader.onload = () => self.postMessage({ id, dataUrl: reader.result });
      reader.readAsDataURL(blob);
      return;
    }

    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);

    let outBlob;
    if (canvas.convertToBlob) {
      outBlob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.78 });
    } else if (canvas.toBlob) {
      outBlob = await new Promise((res) => canvas.toBlob(res, 'image/webp', 0.78));
    }

    if (!outBlob) {
      // fallback to sending original
      const reader = new FileReader();
      reader.onload = () => self.postMessage({ id, dataUrl: reader.result });
      reader.readAsDataURL(blob);
      return;
    }

    const fr = new FileReader();
    fr.onload = function() {
      self.postMessage({ id, dataUrl: fr.result });
    };
    fr.readAsDataURL(outBlob);
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};

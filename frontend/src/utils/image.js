// Comprime una imagen en el navegador y la convierte a base64 — se guarda
// directo en la base de datos, sin depender del filesystem del servidor.
export const compressImage = (file, max = 800) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onerror = reject;
  reader.onload = ev => {
    const img = new Image();
    img.src = ev.target.result;
    img.onerror = reject;
    img.onload = () => {
      let { width, height } = img;
      if (width > height) {
        if (width > max) { height = Math.round(height * max / width); width = max; }
      } else {
        if (height > max) { width = Math.round(width * max / height); height = max; }
      }
      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      // Fondo blanco para evitar transparencias negras en JPEG
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.80));
    };
  };
});

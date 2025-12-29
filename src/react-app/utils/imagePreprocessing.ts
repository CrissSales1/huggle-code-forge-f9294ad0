/**
 * Utilitário de pré-processamento de imagem para OCR de placas
 * Melhora a qualidade da imagem antes do reconhecimento
 */

/**
 * Converte imagem para escala de cinza
 */
export function toGrayscale(imageData: ImageData): ImageData {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }
  return imageData;
}

/**
 * Aumenta o contraste da imagem
 */
export function increaseContrast(imageData: ImageData, factor: number = 1.5): ImageData {
  const data = imageData.data;
  const intercept = 128 * (1 - factor);
  
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.max(0, Math.min(255, data[i] * factor + intercept));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] * factor + intercept));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] * factor + intercept));
  }
  return imageData;
}

/**
 * Aplica threshold adaptativo (binarização Otsu simplificada)
 */
export function applyThreshold(imageData: ImageData): ImageData {
  const data = imageData.data;
  
  // Calcular histograma
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    histogram[data[i]]++;
  }
  
  // Encontrar threshold ideal (Otsu)
  const total = data.length / 4;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];
  
  let sumB = 0;
  let wB = 0;
  let maxVariance = 0;
  let threshold = 128;
  
  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    
    const wF = total - wB;
    if (wF === 0) break;
    
    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const variance = wB * wF * (mB - mF) * (mB - mF);
    
    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }
  
  // Aplicar threshold
  for (let i = 0; i < data.length; i += 4) {
    const value = data[i] > threshold ? 255 : 0;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }
  
  return imageData;
}

/**
 * Remove ruído com filtro mediano simplificado
 */
export function removeNoise(imageData: ImageData): ImageData {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  const copy = new Uint8ClampedArray(data);
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const neighbors: number[] = [];
      
      // Coletar vizinhos 3x3
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nIdx = ((y + dy) * width + (x + dx)) * 4;
          neighbors.push(copy[nIdx]);
        }
      }
      
      // Usar mediana
      neighbors.sort((a, b) => a - b);
      const median = neighbors[4];
      
      data[idx] = median;
      data[idx + 1] = median;
      data[idx + 2] = median;
    }
  }
  
  return imageData;
}

/**
 * Aplica nitidez (sharpening)
 */
export function sharpen(imageData: ImageData): ImageData {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  const copy = new Uint8ClampedArray(data);
  
  // Kernel de nitidez
  const kernel = [
    0, -1, 0,
    -1, 5, -1,
    0, -1, 0
  ];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0;
      let k = 0;
      
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nIdx = ((y + dy) * width + (x + dx)) * 4;
          sum += copy[nIdx] * kernel[k++];
        }
      }
      
      const idx = (y * width + x) * 4;
      const value = Math.max(0, Math.min(255, sum));
      data[idx] = value;
      data[idx + 1] = value;
      data[idx + 2] = value;
    }
  }
  
  return imageData;
}

/**
 * Pipeline completo de pré-processamento para OCR
 * OTIMIZADO: Removidos sharpen e removeNoise (pesados, pouco ganho para placas)
 */
export function preprocessForOCR(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Erro ao obter contexto do canvas');
  
  let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  
  // Pipeline otimizado (3 passos ao invés de 5)
  imageData = toGrayscale(imageData);
  imageData = increaseContrast(imageData, 1.5);
  imageData = applyThreshold(imageData);
  // sharpen e removeNoise removidos - pouco ganho, muito tempo
  
  ctx.putImageData(imageData, 0, 0);
  
  return canvas.toDataURL('image/png');
}

/**
 * Versão leve do pré-processamento (mais rápido)
 */
export function preprocessLight(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Erro ao obter contexto do canvas');
  
  let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  
  imageData = toGrayscale(imageData);
  imageData = increaseContrast(imageData, 1.3);
  
  ctx.putImageData(imageData, 0, 0);
  
  return canvas.toDataURL('image/png');
}

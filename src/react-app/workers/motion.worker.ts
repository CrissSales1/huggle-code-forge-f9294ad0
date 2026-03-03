/**
 * Worker dedicado ao cálculo de movimento via Masked EMA (Exponential Moving Average)
 * Responsabilidade única: comparação per-pixel com modelo de fundo adaptativo
 * 
 * Arquitetura:
 * - backgroundModel (Float32Array): modelo de fundo que se adapta à iluminação
 * - Masked EMA: α_bg=0.05 para fundo (adapta rápido), α_fg=0.0005 para foreground (slow leak)
 * - Buffer Ping-Pong: devolve o ArrayBuffer à Main Thread para reuso (zero GC pressure)
 * 
 * v1.1.89 (Masked EMA)
 */

// Constantes de aprendizado
const ALPHA_BG = 0.05;    // Fundo: adapta rápido a mudanças de iluminação
const ALPHA_FG = 0.0005;  // Foreground (veículo): slow leak para auto-recuperação

// Estado interno do worker
let backgroundModel: Float32Array | null = null;
let minPixelDifference = 35; // Padrão: sensibilidade média
let initialized = false;

// Tipos de mensagem
type WorkerMessage =
  | { type: 'INIT'; payload: { minPixelDifference: number } }
  | { type: 'INIT_BACKGROUND'; payload: { imageData: ImageData } }
  | { type: 'PROCESS_FRAME'; payload: { imageData: ImageData } }
  | { type: 'UPDATE_CONFIG'; payload: { minPixelDifference: number } }
  | { type: 'TERMINATE' };

/**
 * Inicializa o backgroundModel a partir do primeiro frame.
 * Copia os valores RGB do ImageData para o Float32Array.
 * Devolve o ArrayBuffer para reuso na Main Thread.
 */
function initBackground(data: Uint8ClampedArray, buffer: ArrayBuffer): void {
  const len = data.length;
  backgroundModel = new Float32Array(len);
  
  // Copiar valores RGB, ignorar Alpha no cálculo mas copiar para manter alinhamento
  for (let i = 0; i < len; i += 4) {
    backgroundModel[i]     = data[i];     // R
    backgroundModel[i + 1] = data[i + 1]; // G
    backgroundModel[i + 2] = data[i + 2]; // B
    backgroundModel[i + 3] = 255;         // A (ignorado no cálculo)
  }
  
  initialized = true;
  
  // Devolver buffer para reuso (Buffer Ping-Pong)
  self.postMessage(
    { type: 'BACKGROUND_READY', payload: { success: true } },
    [buffer] as any
  );
}

/**
 * Processa um frame usando Masked EMA per-pixel.
 * 
 * Para cada pixel:
 * 1. Calcula diff = média |R-Rbg| + |G-Gbg| + |B-Bbg| / 3
 * 2. Se diff > minPixelDifference → foreground (α = 0.0005, slow leak)
 * 3. Se diff <= minPixelDifference → background (α = 0.05, adapta rápido)
 * 4. Atualiza modelo: bg[c] = α * frame[c] + (1-α) * bg[c]
 * 
 * Retorna motionPercent e devolve o ArrayBuffer via Transferable.
 */
function processFrame(data: Uint8ClampedArray, buffer: ArrayBuffer): void {
  if (!backgroundModel || !initialized) {
    // Se não inicializado, inicializar com este frame
    initBackground(data, buffer);
    return;
  }
  
  const bg = backgroundModel;
  const len = data.length;
  const totalPixels = len >> 2; // len / 4
  let fgCount = 0;
  
  const threshold = minPixelDifference;
  const invBg = 1 - ALPHA_BG;
  const invFg = 1 - ALPHA_FG;
  
  for (let i = 0; i < len; i += 4) {
    // Diferença média RGB (skip Alpha)
    const dr = data[i]     - bg[i];
    const dg = data[i + 1] - bg[i + 1];
    const db = data[i + 2] - bg[i + 2];
    const diff = ((dr < 0 ? -dr : dr) + (dg < 0 ? -dg : dg) + (db < 0 ? -db : db)) / 3;
    
    if (diff > threshold) {
      // Foreground: slow leak (α = 0.0005)
      bg[i]     = ALPHA_FG * data[i]     + invFg * bg[i];
      bg[i + 1] = ALPHA_FG * data[i + 1] + invFg * bg[i + 1];
      bg[i + 2] = ALPHA_FG * data[i + 2] + invFg * bg[i + 2];
      fgCount++;
    } else {
      // Background: adapta rápido (α = 0.05)
      bg[i]     = ALPHA_BG * data[i]     + invBg * bg[i];
      bg[i + 1] = ALPHA_BG * data[i + 1] + invBg * bg[i + 1];
      bg[i + 2] = ALPHA_BG * data[i + 2] + invBg * bg[i + 2];
    }
  }
  
  const motionPercent = fgCount / totalPixels;
  
  // Devolver buffer para reuso na Main Thread (Buffer Ping-Pong)
  self.postMessage(
    { type: 'MOTION_RESULT', payload: { motionPercent } },
    [buffer] as any
  );
}

// Handler de mensagens
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type } = event.data;
  
  switch (type) {
    case 'INIT':
      minPixelDifference = event.data.payload.minPixelDifference;
      console.log(`🔧 Motion Worker inicializado (minPixelDiff=${minPixelDifference})`);
      self.postMessage({ type: 'READY' });
      break;
      
    case 'INIT_BACKGROUND': {
      const { imageData } = event.data.payload;
      initBackground(imageData.data, imageData.data.buffer);
      break;
    }
      
    case 'PROCESS_FRAME': {
      const { imageData } = event.data.payload;
      processFrame(imageData.data, imageData.data.buffer);
      break;
    }
      
    case 'UPDATE_CONFIG':
      minPixelDifference = event.data.payload.minPixelDifference;
      console.log(`🎚️ Motion Worker: minPixelDiff atualizado para ${minPixelDifference}`);
      break;
      
    case 'TERMINATE':
      backgroundModel = null;
      initialized = false;
      console.log('🛑 Motion Worker terminado');
      break;
  }
};

console.log('🔧 Motion Worker carregado (Masked EMA v1.1.89)');

/**
 * Worker dedicado ao cálculo de movimento via Masked EMA (Exponential Moving Average)
 * + Grid Thresholding para filtragem de ruído espacial (chuva, reflexos, sensor noise)
 * 
 * Arquitetura:
 * - backgroundModel (Float32Array): modelo de fundo que se adapta à iluminação
 * - Masked EMA: α_bg=0.05 para fundo (adapta rápido), α_fg=0.0005 para foreground (slow leak)
 * - Grid Thresholding: divide imagem em células 8x8, exige clusters densos adjacentes
 * - Buffer Ping-Pong: devolve o ArrayBuffer à Main Thread para reuso (zero GC pressure)
 * 
 * v1.2.0 (Grid Thresholding + Masked EMA)
 */

// Constantes de aprendizado
const ALPHA_BG = 0.05;    // Fundo: adapta rápido a mudanças de iluminação
const ALPHA_FG = 0.0005;  // Foreground (veículo): slow leak para auto-recuperação

// Grid Thresholding
const CELL_SIZE = 8;           // Tamanho da célula em pixels
const CELL_DENSITY_THRESHOLD = 0.60; // 60% dos pixels da célula devem ser foreground
const MIN_CLUSTER_CELLS = 2;   // Mínimo de células ativas adjacentes para validar

// Estado interno do worker
let backgroundModel: Float32Array | null = null;
let minPixelDifference = 35;
let initialized = false;
let frameWidth = 0;
let frameHeight = 0;

// Buffers reutilizáveis para grid (evitar alocação por frame)
let fgMap: Uint8Array | null = null;      // 1 = foreground, 0 = background (per-pixel)
let cellActive: Uint8Array | null = null; // 1 = célula ativa
let cellCols = 0;
let cellRows = 0;

// Tipos de mensagem
type WorkerMessage =
  | { type: 'INIT'; payload: { minPixelDifference: number } }
  | { type: 'INIT_BACKGROUND'; payload: { imageData: ImageData; width: number; height: number } }
  | { type: 'PROCESS_FRAME'; payload: { imageData: ImageData; width: number; height: number } }
  | { type: 'UPDATE_CONFIG'; payload: { minPixelDifference: number } }
  | { type: 'TERMINATE' };

/**
 * Aloca/realoca buffers de grid quando as dimensões mudam
 */
function ensureGridBuffers(w: number, h: number): void {
  const cols = Math.ceil(w / CELL_SIZE);
  const rows = Math.ceil(h / CELL_SIZE);
  
  if (cols !== cellCols || rows !== cellRows) {
    cellCols = cols;
    cellRows = rows;
    cellActive = new Uint8Array(cols * rows);
    console.log(`📐 Grid: ${cols}x${rows} células (${CELL_SIZE}px cada)`);
  }
  
  const totalPixels = w * h;
  if (!fgMap || fgMap.length !== totalPixels) {
    fgMap = new Uint8Array(totalPixels);
  }
}

/**
 * Inicializa o backgroundModel a partir do primeiro frame.
 */
function initBackground(data: Uint8ClampedArray, buffer: ArrayBuffer, w: number, h: number): void {
  const len = data.length;
  backgroundModel = new Float32Array(len);
  frameWidth = w;
  frameHeight = h;
  
  for (let i = 0; i < len; i += 4) {
    backgroundModel[i]     = data[i];
    backgroundModel[i + 1] = data[i + 1];
    backgroundModel[i + 2] = data[i + 2];
    backgroundModel[i + 3] = 255;
  }
  
  ensureGridBuffers(w, h);
  initialized = true;
  
  self.postMessage(
    { type: 'BACKGROUND_READY', payload: { success: true } },
    [buffer] as any
  );
}

/**
 * Processa um frame usando Masked EMA per-pixel + Grid Thresholding.
 * 
 * Fase 1: EMA per-pixel (atualiza background model, marca foreground)
 * Fase 2: Grid density (conta foreground por célula 8x8)
 * Fase 3: Cluster adjacency (valida apenas clusters de células densas)
 * 
 * Retorna motionPercent baseado em clusters válidos, não soma global.
 */
function processFrame(data: Uint8ClampedArray, buffer: ArrayBuffer, w: number, h: number): void {
  if (!backgroundModel || !initialized) {
    initBackground(data, buffer, w, h);
    return;
  }
  
  // Atualizar dimensões se mudaram
  if (w !== frameWidth || h !== frameHeight) {
    frameWidth = w;
    frameHeight = h;
    ensureGridBuffers(w, h);
  }
  
  const bg = backgroundModel;
  const len = data.length;
  const threshold = minPixelDifference;
  const invBg = 1 - ALPHA_BG;
  const invFg = 1 - ALPHA_FG;
  
  // Garantir buffers
  if (!fgMap || fgMap.length !== w * h) {
    ensureGridBuffers(w, h);
  }
  const fg = fgMap!;
  
  // === FASE 1: EMA per-pixel + marcar foreground ===
  let pixelIdx = 0;
  for (let i = 0; i < len; i += 4) {
    const dr = data[i]     - bg[i];
    const dg = data[i + 1] - bg[i + 1];
    const db = data[i + 2] - bg[i + 2];
    const diff = ((dr < 0 ? -dr : dr) + (dg < 0 ? -dg : dg) + (db < 0 ? -db : db)) / 3;
    
    if (diff > threshold) {
      // Foreground: slow leak
      bg[i]     = ALPHA_FG * data[i]     + invFg * bg[i];
      bg[i + 1] = ALPHA_FG * data[i + 1] + invFg * bg[i + 1];
      bg[i + 2] = ALPHA_FG * data[i + 2] + invFg * bg[i + 2];
      fg[pixelIdx] = 1;
    } else {
      // Background: adapta rápido
      bg[i]     = ALPHA_BG * data[i]     + invBg * bg[i];
      bg[i + 1] = ALPHA_BG * data[i + 1] + invBg * bg[i + 1];
      bg[i + 2] = ALPHA_BG * data[i + 2] + invBg * bg[i + 2];
      fg[pixelIdx] = 0;
    }
    pixelIdx++;
  }
  
  // === FASE 2: Avaliar densidade por célula 8x8 ===
  const ca = cellActive!;
  const cols = cellCols;
  const rows = cellRows;
  const cellPixelMax = CELL_SIZE * CELL_SIZE;
  const densityThreshold = Math.floor(cellPixelMax * CELL_DENSITY_THRESHOLD);
  
  let activeCellCount = 0;
  
  for (let cr = 0; cr < rows; cr++) {
    const py0 = cr * CELL_SIZE;
    const py1 = Math.min(py0 + CELL_SIZE, h);
    
    for (let cc = 0; cc < cols; cc++) {
      const px0 = cc * CELL_SIZE;
      const px1 = Math.min(px0 + CELL_SIZE, w);
      
      let fgCount = 0;
      for (let y = py0; y < py1; y++) {
        const rowOffset = y * w;
        for (let x = px0; x < px1; x++) {
          fgCount += fg[rowOffset + x];
        }
      }
      
      const cellIdx = cr * cols + cc;
      if (fgCount >= densityThreshold) {
        ca[cellIdx] = 1;
        activeCellCount++;
      } else {
        ca[cellIdx] = 0;
      }
    }
  }
  
  // === FASE 3: Cluster adjacency (4-connected flood fill) ===
  // Contar células que pertencem a clusters de tamanho >= MIN_CLUSTER_CELLS
  let clusteredCells = 0;
  
  if (activeCellCount >= MIN_CLUSTER_CELLS) {
    // Visited buffer (reuso via stack, evita alocação de Set)
    const visited = new Uint8Array(cols * rows);
    const stack: number[] = [];
    
    for (let i = 0; i < cols * rows; i++) {
      if (ca[i] === 1 && visited[i] === 0) {
        // BFS/DFS para medir cluster
        stack.length = 0;
        stack.push(i);
        visited[i] = 1;
        let clusterSize = 0;
        const clusterStart = clusteredCells; // snapshot
        
        // Temporário: guardar membros do cluster para marcar depois
        const members: number[] = [];
        
        while (stack.length > 0) {
          const idx = stack.pop()!;
          clusterSize++;
          members.push(idx);
          
          const r = (idx / cols) | 0;
          const c = idx % cols;
          
          // 4-connected neighbors
          if (r > 0 && ca[idx - cols] === 1 && visited[idx - cols] === 0) {
            visited[idx - cols] = 1;
            stack.push(idx - cols);
          }
          if (r < rows - 1 && ca[idx + cols] === 1 && visited[idx + cols] === 0) {
            visited[idx + cols] = 1;
            stack.push(idx + cols);
          }
          if (c > 0 && ca[idx - 1] === 1 && visited[idx - 1] === 0) {
            visited[idx - 1] = 1;
            stack.push(idx - 1);
          }
          if (c < cols - 1 && ca[idx + 1] === 1 && visited[idx + 1] === 0) {
            visited[idx + 1] = 1;
            stack.push(idx + 1);
          }
        }
        
        // Só conta se cluster é grande o suficiente
        if (clusterSize >= MIN_CLUSTER_CELLS) {
          clusteredCells += clusterSize;
        }
      }
    }
  }
  
  // motionPercent = proporção de células em clusters válidos
  const totalCells = cols * rows;
  const motionPercent = totalCells > 0 ? clusteredCells / totalCells : 0;
  
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
      const { imageData, width, height } = event.data.payload;
      initBackground(imageData.data, imageData.data.buffer, width, height);
      break;
    }
      
    case 'PROCESS_FRAME': {
      const { imageData, width, height } = event.data.payload;
      processFrame(imageData.data, imageData.data.buffer, width, height);
      break;
    }
      
    case 'UPDATE_CONFIG':
      minPixelDifference = event.data.payload.minPixelDifference;
      console.log(`🎚️ Motion Worker: minPixelDiff atualizado para ${minPixelDifference}`);
      break;
      
    case 'TERMINATE':
      backgroundModel = null;
      fgMap = null;
      cellActive = null;
      initialized = false;
      console.log('🛑 Motion Worker terminado');
      break;
  }
};

console.log('🔧 Motion Worker carregado (Grid Thresholding v1.2.0)');

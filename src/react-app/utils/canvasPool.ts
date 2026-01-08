/**
 * Pool de canvas reutilizáveis para reduzir GC (Garbage Collection)
 * Evita criar novos canvas a cada frame processado
 */

interface PooledCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  inUse: boolean;
  lastUsed: number;
}

class CanvasPool {
  private pool: PooledCanvas[] = [];
  private maxSize: number;
  private cleanupInterval: number | null = null;
  
  constructor(maxSize: number = 10) {
    this.maxSize = maxSize;
    
    // Limpar canvas não usados a cada 30 segundos
    if (typeof window !== 'undefined') {
      this.cleanupInterval = window.setInterval(() => this.cleanup(), 30000);
    }
  }
  
  /**
   * Obtém um canvas do pool ou cria um novo
   */
  acquire(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    // Procurar canvas disponível com tamanho compatível
    const available = this.pool.find(p => 
      !p.inUse && 
      p.canvas.width >= width && 
      p.canvas.height >= height
    );
    
    if (available) {
      available.inUse = true;
      available.lastUsed = Date.now();
      
      // Redimensionar se necessário
      if (available.canvas.width !== width || available.canvas.height !== height) {
        available.canvas.width = width;
        available.canvas.height = height;
      }
      
      // Limpar canvas
      available.ctx.clearRect(0, 0, width, height);
      
      return { canvas: available.canvas, ctx: available.ctx };
    }
    
    // Criar novo canvas se pool não cheio
    if (this.pool.length < this.maxSize) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        throw new Error('Falha ao criar contexto 2D');
      }
      
      const pooled: PooledCanvas = {
        canvas,
        ctx,
        inUse: true,
        lastUsed: Date.now(),
      };
      
      this.pool.push(pooled);
      
      return { canvas, ctx };
    }
    
    // Pool cheio - reutilizar o menos usado
    const oldest = this.pool
      .filter(p => !p.inUse)
      .sort((a, b) => a.lastUsed - b.lastUsed)[0];
    
    if (oldest) {
      oldest.inUse = true;
      oldest.lastUsed = Date.now();
      oldest.canvas.width = width;
      oldest.canvas.height = height;
      oldest.ctx.clearRect(0, 0, width, height);
      
      return { canvas: oldest.canvas, ctx: oldest.ctx };
    }
    
    // Todos em uso - criar temporário (será coletado pelo GC)
    console.warn('CanvasPool: todos os canvas em uso, criando temporário');
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true })!;
    
    return { canvas: tempCanvas, ctx: tempCtx };
  }
  
  /**
   * Libera um canvas de volta para o pool
   */
  release(canvas: HTMLCanvasElement): void {
    const pooled = this.pool.find(p => p.canvas === canvas);
    if (pooled) {
      pooled.inUse = false;
    }
  }
  
  /**
   * Remove canvas não usados há mais de 60 segundos
   */
  private cleanup(): void {
    const now = Date.now();
    const timeout = 60000; // 60 segundos
    
    this.pool = this.pool.filter(p => {
      if (!p.inUse && (now - p.lastUsed) > timeout) {
        return false; // Remove do pool
      }
      return true;
    });
  }
  
  /**
   * Libera todos os recursos
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.pool = [];
  }
  
  /**
   * Retorna estatísticas do pool
   */
  getStats(): { total: number; inUse: number; available: number } {
    const inUse = this.pool.filter(p => p.inUse).length;
    return {
      total: this.pool.length,
      inUse,
      available: this.pool.length - inUse,
    };
  }
}

// Singleton para uso global
let poolInstance: CanvasPool | null = null;

export function getCanvasPool(): CanvasPool {
  if (!poolInstance) {
    poolInstance = new CanvasPool(10);
  }
  return poolInstance;
}

/**
 * Helper para obter canvas do pool
 */
export function acquireCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  return getCanvasPool().acquire(width, height);
}

/**
 * Helper para liberar canvas de volta ao pool
 */
export function releaseCanvas(canvas: HTMLCanvasElement): void {
  getCanvasPool().release(canvas);
}

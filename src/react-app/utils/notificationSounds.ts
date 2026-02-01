/**
 * Sistema de sons de notificação usando Web Audio API
 * Sons gerados dinamicamente sem necessidade de arquivos externos
 */

export type SoundType = 'morador' | 'visitante' | 'desconhecido';

interface SoundConfig {
  frequencies: number[];
  durations: number[];
  waveform: OscillatorType;
  gainMultiplier?: number;
}

// Configuração dos sons para cada tipo de detecção
const SOUND_CONFIG: Record<SoundType, SoundConfig> = {
  morador: {
    // Som alegre: duas notas ascendentes (C5 → E5)
    frequencies: [523, 659],
    durations: [150, 200],
    waveform: 'sine',
    gainMultiplier: 1,
  },
  visitante: {
    // Som neutro: uma nota simples (A4)
    frequencies: [440],
    durations: [200],
    waveform: 'sine',
    gainMultiplier: 0.9,
  },
  desconhecido: {
    // Som de alerta: duas notas descendentes (A4 → E4)
    frequencies: [440, 330],
    durations: [150, 250],
    waveform: 'square',
    gainMultiplier: 0.5, // Square wave é mais alto, reduzir volume
  },
};

// Chaves para localStorage
const STORAGE_KEYS = {
  enabled: 'portacerta_sound_enabled',
  volume: 'portacerta_sound_volume',
};

// Singleton do AudioContext (criado sob demanda)
let audioContext: AudioContext | null = null;

/**
 * Obtém ou cria o AudioContext
 * Lazy initialization para evitar problemas com autoplay policies
 */
function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  
  // Resumir se estiver suspenso (política de autoplay dos browsers)
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  
  return audioContext;
}

/**
 * Toca uma sequência de notas
 */
async function playNotes(
  frequencies: number[],
  durations: number[],
  waveform: OscillatorType,
  volume: number,
  gainMultiplier: number = 1
): Promise<void> {
  const ctx = getAudioContext();
  let startTime = ctx.currentTime;
  
  for (let i = 0; i < frequencies.length; i++) {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(frequencies[i], startTime);
    
    // Aplicar volume com envelope suave
    const adjustedVolume = volume * gainMultiplier;
    const duration = durations[i] / 1000; // Converter ms para segundos
    
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(adjustedVolume, startTime + 0.01); // Attack rápido
    gainNode.gain.linearRampToValueAtTime(adjustedVolume * 0.8, startTime + duration * 0.7); // Sustain
    gainNode.gain.linearRampToValueAtTime(0, startTime + duration); // Release
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
    
    startTime += duration;
  }
}

/**
 * Toca o som de notificação para um tipo de detecção
 */
export function playNotificationSound(type: SoundType): void {
  if (!loadSoundEnabled()) return;
  
  const config = SOUND_CONFIG[type];
  const volume = loadSoundVolume();
  
  playNotes(
    config.frequencies,
    config.durations,
    config.waveform,
    volume,
    config.gainMultiplier
  ).catch((err) => {
    console.warn('Erro ao tocar som de notificação:', err);
  });
}

/**
 * Carrega se os sons estão habilitados
 */
export function loadSoundEnabled(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.enabled);
    // Por padrão, som está habilitado
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

/**
 * Salva configuração de sons habilitados
 */
export function saveSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.enabled, String(enabled));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Carrega o volume (0-1)
 */
export function loadSoundVolume(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.volume);
    if (stored === null) return 0.5; // Volume padrão: 50%
    
    const value = parseFloat(stored);
    return isNaN(value) ? 0.5 : Math.max(0, Math.min(1, value));
  } catch {
    return 0.5;
  }
}

/**
 * Salva o volume (0-1)
 */
export function saveSoundVolume(volume: number): void {
  try {
    const clamped = Math.max(0, Math.min(1, volume));
    localStorage.setItem(STORAGE_KEYS.volume, String(clamped));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Testa um som específico (para a tela de configurações)
 */
export function testSound(type: SoundType): void {
  const config = SOUND_CONFIG[type];
  const volume = loadSoundVolume();
  
  playNotes(
    config.frequencies,
    config.durations,
    config.waveform,
    volume,
    config.gainMultiplier
  ).catch((err) => {
    console.warn('Erro ao testar som:', err);
  });
}

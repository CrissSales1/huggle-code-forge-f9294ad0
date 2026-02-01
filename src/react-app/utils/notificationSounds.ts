/**
 * Sistema de sons de notificação usando Web Audio API
 * Sons gerados dinamicamente sem necessidade de arquivos externos
 * Suporta múltiplos presets personalizáveis por tipo de detecção
 */

export type SoundType = 'morador' | 'visitante' | 'desconhecido';
export type SoundPresetId = string;

interface SoundConfig {
  frequencies: number[];
  durations: number[];
  waveform: OscillatorType;
  gainMultiplier?: number;
}

export interface SoundPreset {
  id: SoundPresetId;
  name: string;
  description: string;
  config: SoundConfig;
}

// Presets disponíveis para cada tipo de detecção
export const SOUND_PRESETS: Record<SoundType, SoundPreset[]> = {
  morador: [
    {
      id: 'padrao',
      name: 'Padrão',
      description: 'Duas notas ascendentes',
      config: {
        frequencies: [523, 659], // C5 → E5
        durations: [150, 200],
        waveform: 'sine',
        gainMultiplier: 1,
      },
    },
    {
      id: 'alegre',
      name: 'Alegre',
      description: 'Acorde maior completo',
      config: {
        frequencies: [523, 659, 784], // C5 → E5 → G5
        durations: [120, 120, 180],
        waveform: 'sine',
        gainMultiplier: 0.9,
      },
    },
    {
      id: 'suave',
      name: 'Suave',
      description: 'Nota única prolongada',
      config: {
        frequencies: [440],
        durations: [350],
        waveform: 'sine',
        gainMultiplier: 0.7,
      },
    },
    {
      id: 'confirmacao',
      name: 'Confirmação',
      description: 'Bip duplo rápido',
      config: {
        frequencies: [880, 880],
        durations: [80, 80],
        waveform: 'sine',
        gainMultiplier: 0.8,
      },
    },
  ],
  visitante: [
    {
      id: 'padrao',
      name: 'Padrão',
      description: 'Nota simples',
      config: {
        frequencies: [440], // A4
        durations: [200],
        waveform: 'sine',
        gainMultiplier: 0.9,
      },
    },
    {
      id: 'campainha',
      name: 'Campainha',
      description: 'Ding-dong clássico',
      config: {
        frequencies: [659, 523], // E5 → C5
        durations: [200, 300],
        waveform: 'sine',
        gainMultiplier: 0.85,
      },
    },
    {
      id: 'atencao',
      name: 'Atenção',
      description: 'Três notas de aviso',
      config: {
        frequencies: [587, 659, 587], // D5 → E5 → D5
        durations: [100, 100, 150],
        waveform: 'sine',
        gainMultiplier: 0.8,
      },
    },
    {
      id: 'melodico',
      name: 'Melódico',
      description: 'Sequência harmônica',
      config: {
        frequencies: [392, 440, 494], // G4 → A4 → B4
        durations: [120, 120, 200],
        waveform: 'triangle',
        gainMultiplier: 0.9,
      },
    },
  ],
  desconhecido: [
    {
      id: 'padrao',
      name: 'Padrão',
      description: 'Notas descendentes',
      config: {
        frequencies: [440, 330], // A4 → E4
        durations: [150, 250],
        waveform: 'square',
        gainMultiplier: 0.5,
      },
    },
    {
      id: 'alerta',
      name: 'Alerta',
      description: 'Sirene curta',
      config: {
        frequencies: [880, 660, 880, 660],
        durations: [100, 100, 100, 150],
        waveform: 'sawtooth',
        gainMultiplier: 0.35,
      },
    },
    {
      id: 'grave',
      name: 'Grave',
      description: 'Tom grave de aviso',
      config: {
        frequencies: [220, 165], // A3 → E3
        durations: [200, 300],
        waveform: 'square',
        gainMultiplier: 0.6,
      },
    },
    {
      id: 'urgente',
      name: 'Urgente',
      description: 'Bips rápidos de alerta',
      config: {
        frequencies: [800, 600, 800],
        durations: [80, 80, 120],
        waveform: 'square',
        gainMultiplier: 0.45,
      },
    },
  ],
};

// Chaves para localStorage
const STORAGE_KEYS = {
  enabled: 'portacerta_sound_enabled',
  volume: 'portacerta_sound_volume',
  presets: 'portacerta_sound_presets', // Novo: armazena presets selecionados
};

// Singleton do AudioContext (criado sob demanda)
let audioContext: AudioContext | null = null;
let isUnlocked = false;

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
 * Desbloqueia o AudioContext após interação do usuário
 * Deve ser chamado em resposta a um evento de usuário (click, touch, etc.)
 */
export function unlockAudioContext(): void {
  if (isUnlocked) return;
  
  try {
    const ctx = getAudioContext();
    
    // Tocar um som silencioso para desbloquear
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    gainNode.gain.setValueAtTime(0, ctx.currentTime); // Volume zero
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.001);
    
    isUnlocked = true;
    console.log('[NotificationSounds] AudioContext desbloqueado com sucesso');
  } catch (err) {
    console.warn('[NotificationSounds] Erro ao desbloquear AudioContext:', err);
  }
}

/**
 * Verifica se o AudioContext está desbloqueado
 */
export function isAudioUnlocked(): boolean {
  return isUnlocked;
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
 * Obtém o preset selecionado para um tipo de detecção
 */
function getSelectedPreset(type: SoundType): SoundPreset {
  const presets = loadSoundPresets();
  const presetId = presets[type];
  const availablePresets = SOUND_PRESETS[type];
  
  const found = availablePresets.find(p => p.id === presetId);
  return found || availablePresets[0]; // Fallback para padrão
}

/**
 * Toca o som de notificação para um tipo de detecção
 */
export function playNotificationSound(type: SoundType): void {
  if (!loadSoundEnabled()) return;
  
  const preset = getSelectedPreset(type);
  const volume = loadSoundVolume();
  
  playNotes(
    preset.config.frequencies,
    preset.config.durations,
    preset.config.waveform,
    volume,
    preset.config.gainMultiplier
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
 * Carrega os presets selecionados para cada tipo
 */
export function loadSoundPresets(): Record<SoundType, SoundPresetId> {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.presets);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  
  // Presets padrão
  return {
    morador: 'padrao',
    visitante: 'padrao',
    desconhecido: 'padrao',
  };
}

/**
 * Salva os presets selecionados
 */
export function saveSoundPresets(presets: Record<SoundType, SoundPresetId>): void {
  try {
    localStorage.setItem(STORAGE_KEYS.presets, JSON.stringify(presets));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Salva um preset individual para um tipo
 */
export function saveSoundPreset(type: SoundType, presetId: SoundPresetId): void {
  const current = loadSoundPresets();
  current[type] = presetId;
  saveSoundPresets(current);
}

/**
 * Testa um som específico (para a tela de configurações)
 * Usa o preset selecionado atualmente
 */
export function testSound(type: SoundType): void {
  const preset = getSelectedPreset(type);
  const volume = loadSoundVolume();
  
  playNotes(
    preset.config.frequencies,
    preset.config.durations,
    preset.config.waveform,
    volume,
    preset.config.gainMultiplier
  ).catch((err) => {
    console.warn('Erro ao testar som:', err);
  });
}

/**
 * Testa um preset específico (para preview antes de selecionar)
 */
export function testPreset(type: SoundType, presetId: SoundPresetId): void {
  const preset = SOUND_PRESETS[type].find(p => p.id === presetId);
  if (!preset) return;
  
  const volume = loadSoundVolume();
  
  playNotes(
    preset.config.frequencies,
    preset.config.durations,
    preset.config.waveform,
    volume,
    preset.config.gainMultiplier
  ).catch((err) => {
    console.warn('Erro ao testar preset:', err);
  });
}

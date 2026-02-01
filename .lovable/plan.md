

# Plano: Sons de Notificação Diferenciados v1.1.72

## Objetivo

Adicionar feedback sonoro diferenciado para cada tipo de detecção:
- **Morador**: Som agradável de confirmação (tom verde)
- **Visitante**: Som neutro de atenção (tom âmbar)
- **Desconhecido**: Som de alerta (tom vermelho)

## Abordagem Técnica

Usar **Web Audio API** para gerar sons diretamente no navegador:
- Sem necessidade de arquivos de áudio externos
- Carregamento instantâneo
- Controle total sobre frequência, duração e volume
- Funciona mesmo offline (PWA)

---

## Arquivos a Criar/Modificar

### 1. Criar `src/react-app/utils/notificationSounds.ts` (NOVO)

Utilitário para geração de sons via Web Audio API:

```typescript
// Tipos de som disponíveis
type SoundType = 'morador' | 'visitante' | 'desconhecido';

// Configuração de cada som
const SOUND_CONFIG = {
  morador: {
    // Som alegre: duas notas ascendentes
    frequencies: [523, 659], // C5, E5
    durations: [150, 200],
    type: 'sine',
  },
  visitante: {
    // Som neutro: uma nota simples
    frequencies: [440], // A4
    durations: [200],
    type: 'sine',
  },
  desconhecido: {
    // Som de alerta: duas notas descendentes
    frequencies: [440, 330], // A4, E4
    durations: [150, 250],
    type: 'square',
  },
};

// Função principal para tocar som
export function playNotificationSound(type: SoundType): void;

// Helpers para persistência
export function loadSoundEnabled(): boolean;
export function saveSoundEnabled(enabled: boolean): void;
export function loadSoundVolume(): number;
export function saveSoundVolume(volume: number): void;
```

### 2. Modificar `src/react-app/components/DetectionToast.tsx`

Adicionar reprodução de som ao mostrar toast:

```typescript
import { playNotificationSound, loadSoundEnabled } from '@/react-app/utils/notificationSounds';

useEffect(() => {
  if (lastDetection && isActive && !isOnMonitoringPage) {
    // ... código existente ...
    
    // Tocar som baseado no tipo
    if (loadSoundEnabled()) {
      if (lastDetection.isMorador) {
        playNotificationSound('morador');
      } else if (lastDetection.isVisitante) {
        playNotificationSound('visitante');
      } else {
        playNotificationSound('desconhecido');
      }
    }
  }
}, [lastDetection?.timestamp, isActive, isOnMonitoringPage]);
```

### 3. Modificar `src/react-app/pages/Configuracoes.tsx`

Adicionar seção de configuração de som:

Nova seção "Notificações Sonoras":
- Toggle para habilitar/desabilitar sons
- Slider de volume (0-100%)
- Botões de teste para cada tipo de som
- Versão atualizada para 1.1.72

---

## Características dos Sons

| Tipo | Frequências | Duração | Waveform | Sensação |
|------|-------------|---------|----------|----------|
| Morador | C5→E5 (523→659Hz) | 350ms total | Sine | Alegre, confirmação |
| Visitante | A4 (440Hz) | 200ms | Sine | Neutro, atenção |
| Desconhecido | A4→E4 (440→330Hz) | 400ms total | Square | Alerta, preocupação |

---

## Resumo das Mudanças

| Arquivo | Ação |
|---------|------|
| `src/react-app/utils/notificationSounds.ts` | CRIAR - geração de sons via Web Audio API |
| `src/react-app/components/DetectionToast.tsx` | MODIFICAR - tocar som ao exibir toast |
| `src/react-app/pages/Configuracoes.tsx` | MODIFICAR - adicionar seção de configuração de sons + versão 1.1.72 |

---

## Resultado Esperado

1. Ao detectar um **morador**: som alegre de duas notas ascendentes
2. Ao detectar um **visitante**: som neutro de uma nota
3. Ao detectar **desconhecido**: som de alerta com duas notas descendentes
4. Usuário pode habilitar/desabilitar nas Configurações
5. Usuário pode ajustar volume
6. Botões de teste para ouvir cada som


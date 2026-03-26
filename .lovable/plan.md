

# Plano Revisado: Vigilância Background + Persistência + Agendamento de Alertas

Inclui tudo do plano anterior aprovado, mais a nova funcionalidade de **agendamento de horário dos alertas** para uso do porteiro noturno.

---

## Arquivos e Mudanças

### 1. Novo: `src/react-app/contexts/VigilanciaContext.tsx`

Contexto global que mantém a vigilância ativa ao sair da página:
- Estado: `status`, `cameraSource`, `ipUrl`, `areaPoints`, `cooldown`, `showDetectionArea`, **`alertScheduleEnabled`**, **`alertStartTime`**, **`alertEndTime`**
- Integra `usePersonDetection` internamente
- Persiste tudo em localStorage (`portacerta_vig_*`)
- **Lógica de horário**: antes de disparar alerta sonoro, verifica se o horário atual está dentro da faixa configurada. Se `alertScheduleEnabled` for false, alerta sempre. Se true, só alerta entre `alertStartTime` e `alertEndTime` (suporta faixas que cruzam meia-noite, ex: 22:00→06:00)
- Funções: `startVigilancia()`, `stopVigilancia()`, `updateConfig()`

### 2. Novo: `src/react-app/components/BackgroundVigilancia.tsx`

Componente global (como `BackgroundVideo.tsx`):
- Quando fora de `/vigilancia` e vigilância ativa: renderiza `<img>` ou `<video>` oculto para manter detecção
- Quando em `/vigilancia`: retorna null (página renderiza diretamente)

### 3. Novo: `src/react-app/components/VigilanciaToast.tsx`

Toast de alerta quando pessoa detectada fora da página de vigilância:
- Estilo similar ao `DetectionToast.tsx` mas com ícone de pessoa e mensagem "Pessoa detectada na área monitorada!"
- Auto-dismiss em 6s

### 4. Refatorar: `src/react-app/pages/Vigilancia.tsx`

- Consumir `VigilanciaContext` em vez de gerenciar estado interno
- Remover toda lógica de câmera/detecção (agora no contexto)
- Manter UI: vídeo, canvas overlay, botões, settings panel
- Adicionar no painel de settings:
  - **Toggle "Agendar alertas"** com inputs de hora início e hora fim (type="time")
  - Texto explicativo: "Alertas sonoros apenas no horário definido. Útil para porteiros noturnos."
- Respeitar `showDetectionArea` do contexto para esconder/mostrar polígono no canvas

### 5. Modificar: `src/react-app/pages/Configuracoes.tsx`

Adicionar seção "Vigilância" com:
- Toggle "Mostrar área de detecção" → salva `portacerta_vig_show_area`
- Toggle "Agendar alertas" + seletores de horário início/fim
- Versão: `1.6.0 (Background Vigilância)`

### 6. Modificar: `src/react-app/components/Header.tsx`

- Importar `VigilanciaContext`
- Mostrar bolinha verde pulsante no link "Vigilância" quando ativa em background (mesmo padrão do Monitoramento)

### 7. Modificar: `src/react-app/App.tsx`

- Adicionar `VigilanciaProvider` wrapper
- Adicionar `<BackgroundVigilancia />` e `<VigilanciaToast />` globais

### 8. Modificar: `src/react-app/hooks/usePersonDetection.ts`

- Aceitar opção `shouldAlert` callback que o contexto usa para verificar horário antes de tocar som
- Alternativa: mover a lógica de som para o contexto e desabilitar som no hook

---

## Lógica de Agendamento de Horário

```text
Configuração:  alertScheduleEnabled = true
               alertStartTime = "22:00"
               alertEndTime = "06:00"

Verificação antes de cada alerta:
  now = hora atual (HH:MM)
  
  Se start < end:    // ex: 08:00 → 18:00
    alertar = (now >= start && now < end)
  
  Se start > end:    // ex: 22:00 → 06:00 (cruza meia-noite)
    alertar = (now >= start || now < end)
```

Quando fora do horário: detecção continua normalmente (bounding boxes, contagem), apenas o som e o toast são suprimidos.

---

## Chaves localStorage

| Chave | Tipo | Default |
|-------|------|---------|
| `portacerta_vig_camera_source` | 'webcam' \| 'ip' | 'webcam' |
| `portacerta_vig_ip_url` | string | '' |
| `portacerta_vig_cooldown` | number | 10000 |
| `portacerta_vig_area_points` | JSON Point[] | DEFAULT_AREA |
| `portacerta_vig_show_area` | boolean | true |
| `portacerta_vig_device_id` | string | '' |
| `portacerta_vig_alert_schedule` | boolean | false |
| `portacerta_vig_alert_start` | string (HH:MM) | '22:00' |
| `portacerta_vig_alert_end` | string (HH:MM) | '06:00' |


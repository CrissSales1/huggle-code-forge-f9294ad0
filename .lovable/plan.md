# Vídeo Promocional — Sistema de Controle de Acesso Águas da Fonte

Gerar um vídeo MP4 de ~20 segundos (600 frames @ 30fps, 1920x1080) com identidade Premium/Tecnológico, usando Remotion no sandbox, salvo em `/mnt/documents/video-promocional-aguasdafonte.mp4`.

## Direção criativa

- **Paleta**: Navy profundo `#0A1628` / `#0F1F3D` + Dourado `#D4AF37` / `#F0D78C` + Off-white `#F5F3EE`
- **Tipografia**: Display *Syne* (700) + Body *Inter* (400/600) — via `@remotion/google-fonts`
- **Aesthetic**: Tech Product + Luxury — cortes precisos, springs suaves, grade sutil, brilhos dourados, parallax leve
- **Motifs**: linhas/grade tech animadas, scanner de placa (LPR), badge dourado, números crescendo
- **Trilha**: sem áudio (`muted: true` — limitação do ffmpeg do sandbox)

## Roteiro (7 cenas, ~20s)

1. **Abertura (0–2.5s)** — Logo/título "Sistema de Controle de Acesso" surgindo em blur→sharp sobre grade animada; subtítulo "Águas da Fonte"
2. **Problema (2.5–5s)** — Texto editorial: "Portarias manuais. Filas. Erros." com palavras riscadas em dourado
3. **Solução / LPR (5–9s)** — Mock de câmera escaneando placa "ABC-1D23" com bounding box dourado e "Reconhecimento por IA"
4. **4 Pilares (9–13s)** — Grid 2x2 entrando em stagger: IA de Placas · 100% Local/Offline · Vigilância 360° · Relatórios & BI
5. **Dashboard (13–16s)** — Mock de KPIs (visitantes, veículos, alertas) com números animados via interpolate
6. **Premium / Local (16–18s)** — Selo dourado "100% LOCAL · SEM NUVEM · LGPD-READY"
7. **Contato (18–20s)** — "Cristian Sales" + ícone WhatsApp + "11 94175-8759" + nome do sistema

## Estrutura técnica

```
remotion/
  tsconfig.json
  package.json
  src/
    index.ts                 # registerRoot
    Root.tsx                 # Composition main 1920x1080 600f 30fps
    MainVideo.tsx            # TransitionSeries + camadas persistentes
    components/
      GridBackground.tsx     # grade tech animada persistente
      GoldGlow.tsx           # halos dourados em parallax
    scenes/
      SceneIntro.tsx
      SceneProblema.tsx
      SceneLPR.tsx
      ScenePilares.tsx
      SceneDashboard.tsx
      ScenePremium.tsx
      SceneContato.tsx
  scripts/
    render-remotion.mjs      # bundle + renderMedia (chrome-for-testing, muted)
```

- Transições: `fade` curtas (15f) entre cenas, com `wipe` dourado entre Pilares→Dashboard
- Todas as animações via `useCurrentFrame` + `interpolate`/`spring` (sem CSS transitions)
- Fontes via `@remotion/google-fonts/Syne` e `/Inter` em escopo de módulo
- Sem `backdropFilter` (proibido no sandbox); usar `filter: blur` com moderação

## Execução

1. Criar `remotion/` com `bun init` + instalar deps Remotion (musl + gnu compositor fix + symlinks ffmpeg/ffprobe)
2. Escrever todos os arquivos TSX das 7 cenas + camadas persistentes
3. Render via `node scripts/render-remotion.mjs` → `/mnt/documents/video-promocional-aguasdafonte.mp4`
4. QA: `bunx remotion still` em frames-chave (60, 200, 400, 560) para validar layout e legibilidade; ajustar e re-renderizar se necessário
5. Entregar via `<lov-artifact>` com mime `video/mp4`

## Observações

- Duração total ~20s (600 frames) — bem dentro do limite de 600s de render do sandbox
- Sem narração/áudio (limitação técnica do ffmpeg Nix); todo storytelling é visual
- Reaproveita identidade Premium/Tecnológico já estabelecida nos materiais anteriores (PDF/PPTX/PNG)

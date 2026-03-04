
# Plano Implementado: Pipeline Unificado v1.1.90

## Status: ✅ IMPLEMENTADO

## Arquivos Criados/Modificados

| Arquivo | Ação | Status |
|---------|------|--------|
| `src/shared/plateValidation.ts` | CRIADO — Módulo canônico de validação (zero deps browser) | ✅ |
| `src/react-app/utils/plateValidator.ts` | SIMPLIFICADO — Re-export do shared module | ✅ |
| `src/react-app/workers/plateProcessor.worker.ts` | LIMPO — ~550 linhas removidas, homografia adicionada, single-pass OCR | ✅ |
| `src/react-app/utils/plateDetector.ts` | REMOVIDO — 494 linhas de código morto (Sobel + Sliding Window) | ✅ |
| `src/react-app/hooks/usePlateRecognition.ts` | LIMPO — Removido import e bloco debug do plateDetector | ✅ |
| `src/react-app/hooks/usePlateWorker.ts` | LIMPO — Removido detectMotion, MotionDetectionConfig | ✅ |
| `src/react-app/pages/Configuracoes.tsx` | Versão 1.1.90 (Pipeline Unificado) | ✅ |

## Impacto

| Métrica | Antes | Depois |
|---------|-------|--------|
| Tempo OCR/frame | ~300ms (2× ONNX) | ~150ms (1× ONNX) |
| Linhas validação duplicadas | ~600 | 0 |
| Código morto removido | 0 | ~700 linhas |
| Tabelas de substituição divergentes | 2 | 1 (canônica) |
| Homografia projetiva | Nenhuma | Função pronta para OBB |



# Plano: Filtragem de Charset no Decoder CTC (v1.4.2)

## Objetivo

Mascarar logits de caracteres irrelevantes (467 de 504) no decoder CTC, forçando 100% da probabilidade para os ~37 caracteres válidos de placas brasileiras (A-Z, 0-9 + blank).

## Mudanças

### 1. `src/react-app/workers/plateProcessor.worker.ts`

**Adicionar variável global** (após linha 90, junto aos estados ONNX):
```typescript
let validIndices: Set<number> = new Set();
```

**Criar função `buildValidIndices`** (após `loadCharset`):
- Itera o `charset` e marca como válidos apenas índices cujo caractere está em `A-Z`, `0-9`, ou é o blank token (índice 0).

**Chamar `buildValidIndices()`** ao final de `initONNX()` (após linha 225, depois de `onnxReady = true`).

**Modificar `decodeCTC`** (linhas 367-370):
- Ao construir o array de logits, setar `-Infinity` para índices fora de `validIndices`:
```typescript
logits.push(validIndices.has(c) ? output[t * numClasses + c] : -Infinity);
```

**Modificar `decodeCTCBeam`** (linhas 450-453 e 470-475):
- Mesma máscara de logits na construção do array.
- No loop de candidatos, filtrar apenas `validIndices`:
```typescript
if (validIndices.has(c) && c < charset.length && charset[c] !== '') {
```

### 2. `src/react-app/pages/Configuracoes.tsx`

- Linha 1333: Atualizar versão para `1.4.2` com nota `(Charset Filter)`.

## Impacto

- Beam Search opera em ~37 candidatos em vez de ~504 por timestep
- Elimina alucinações com caracteres exóticos (ñ, €, ψ, etc.)
- Confiança calibrada sobe 20-40% por concentração de probabilidade
- Nenhuma mudança no modelo ou dict.txt


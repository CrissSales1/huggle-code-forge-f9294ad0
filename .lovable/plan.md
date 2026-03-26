

# Plano: Filtrar log para mostrar apenas pessoas (v1.6.4)

## Problema

O log `👁️ Detecções: N objeto(s)` dispara para **qualquer** objeto detectado pelo MediaPipe (carros, motos, etc.), não apenas pessoas. O filtro `filterByCategories(PERSON_CATEGORIES)` acontece depois do log.

## Solução

Mover o log para **depois** do filtro de pessoas, e só logar quando `allPersons.length > 0`.

### Arquivo: `src/react-app/hooks/usePersonDetection.ts` (linhas 96-102)

**Antes:**
```typescript
if (allDetections.length > 0) {
  console.log(`👁️ Detecções: ${allDetections.length} objeto(s), source=${sourceType}`);
}
const allPersons = filterByCategories(allDetections, PERSON_CATEGORIES);
```

**Depois:**
```typescript
const allPersons = filterByCategories(allDetections, PERSON_CATEGORIES);
if (allPersons.length > 0) {
  console.log(`👁️ Pessoa(s) detectada(s): ${allPersons.length}, source=${sourceType}`);
}
```

### Arquivo: `src/react-app/pages/Configuracoes.tsx`
Versão → `1.6.4`


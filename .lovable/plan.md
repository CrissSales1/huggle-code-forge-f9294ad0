
# Plano: Corrigir DetectionToast para Mostrar Visitantes v1.1.71

## Diagnóstico

Analisando os screenshots e o código:

### O que está acontecendo
1. **Página Monitoramento**: Mostra corretamente "VISITANTE ATIVO" para GAE7B96 (Isabel, Casa 05)
2. **Dashboard Toast**: Mostra "Veículo Desconhecido" para a mesma placa

### Causa Raiz
O componente `DetectionToast.tsx` (linha 65) verifica apenas `isMorador`:

```typescript
const isMorador = visibleDetection.isMorador;
```

Quando é um **visitante ativo** (`isVisitante: true, isMorador: false`), o toast trata como "desconhecido" porque:
- `isMorador = false` → mostra vermelho "Veículo Desconhecido"

O banco de dados está correto (`is_visitante: true, nome_visitante: ISABEL`), mas o toast ignora completamente a propriedade `isVisitante`.

---

## Correções Necessárias

### 1. `src/react-app/components/DetectionToast.tsx`

Adicionar lógica para reconhecer visitantes ativos:

**Mudanças:**
- Verificar `isVisitante` além de `isMorador`
- Adicionar estilo âmbar/amarelo para visitantes (consistente com Monitoramento)
- Mostrar nome do visitante quando disponível

**Antes (linha 65):**
```typescript
const isMorador = visibleDetection.isMorador;
```

**Depois:**
```typescript
const isMorador = visibleDetection.isMorador;
const isVisitante = visibleDetection.isVisitante;
const isIdentificado = isMorador || isVisitante;
```

**Visual:**
- Verde: Morador autorizado
- Âmbar: Visitante ativo  
- Vermelho: Veículo desconhecido

### 2. `src/react-app/pages/Configuracoes.tsx`

Atualizar versão para `1.1.71 (Fix: Toast Visitante)`

---

## Resumo das Mudanças

| Arquivo | Mudança |
|---------|---------|
| `DetectionToast.tsx` | Adicionar verificação de `isVisitante` e estilo âmbar para visitantes |
| `Configuracoes.tsx` | Versão 1.1.71 |

---

## Resultado Esperado

Após a correção:
1. Detecção de GAE7B96 no Dashboard
2. Toast aparece em **âmbar** (não vermelho)
3. Mostra "Visitante Ativo" + nome "ISABEL"
4. Mostra "Casa 05"
5. Consistente com a página de Monitoramento

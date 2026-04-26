

# Plano: Investigar Loop Infinito do Preview e Sincronização GitHub/Cloudflare

## Situação 1 — Loop infinito no preview

### Diagnóstico
O dev-server (Vite) está rodando normalmente em `:8080` — o único erro nos logs é benigno (referência a `tailwind.config.ts` quando o projeto usa `.js`, gerado pelo lovable-tagger). Portanto o "loop de reinício" **não é restart do servidor**, é **re-render/reload do app** no browser. As causas mais prováveis, em ordem:

1. **PWA Service Worker em modo `autoUpdate`** (`vite.config.ts`): em produção, o SW detecta novo build, chama `skipWaiting` e força reload da página automaticamente. Se o build é gerado continuamente (Lovable rebuilda a cada commit), o ciclo "novo SW → reload → novo SW" se sustenta. Mesmo com `devOptions.enabled: false`, o preview do Lovable serve build com PWA ativo.
2. **MonitoringContext v1.7.9 — Auto-Recovery agressivo**: o bloco em volta da linha 1234 chama `setStatus('monitoring')` a cada tick em que `staleMs > 1800`. Se algum efeito downstream depender de `status` e disparar nova execução do loop sem zerar `lastOcrAttemptTimeRef`, pode gerar setState repetitivos a cada frame. Não causa "reload" da página, mas causa o app a parecer "reiniciando" (toast/status piscando).
3. **`reconnectStream` chamado por `BackgroundVideo`/`BackgroundVigilancia`** em ciclo de mount/unmount sempre que rota muda (ex.: `/` → autenticação → `/`).

### Mudanças propostas

| Arquivo | Correção |
|---|---|
| `vite.config.ts` | Trocar `registerType: 'autoUpdate'` por `'prompt'` para que o usuário (e não um reload automático) decida quando atualizar. Elimina o ciclo "novo SW → reload". |
| `src/react-app/main.tsx` | Adicionar registro manual via `virtual:pwa-register` que apenas loga ("Nova versão disponível") em vez de recarregar — evita reloads silenciosos no preview. |
| `src/react-app/contexts/MonitoringContext.tsx` | Adicionar guard no auto-recovery (linhas ~1233-1241): só chamar `setStatus('monitoring')` se o status atual no React **for** `'processing'` (comparar via `setStatus(prev => prev === 'processing' ? 'monitoring' : prev)`) e atualizar `lastOcrAttemptTimeRef.current = Date.now()` para impedir re-disparo no próximo tick. |
| `src/react-app/components/BackgroundVideo.tsx` e `BackgroundVigilancia.tsx` | Adicionar dependência estável (já têm guard, mas reconfirmar que `reconnectStream`/`reconnectSource` são `useCallback` estáveis no contexto — caso contrário, envolver no contexto). |

### Versão
Bumpar para **v1.8.2 (Stop Reload Loop)** em `Configuracoes.tsx`.

## Situação 2 — Atualizações não chegaram ao GitHub / Cloudflare Pages

### Explicação
O Lovable faz **push automático** ao GitHub a cada edição quando o repositório está conectado. Não consigo executar `git` (estado é gerenciado pelo Lovable). As mudanças recentes (v1.7.7 → v1.8.1) foram salvas no projeto Lovable, mas se o GitHub não recebeu commits, há três causas possíveis:

1. **Conexão GitHub interrompida**: o app GitHub do Lovable foi desautorizado/desconectado. Verificar em **Connectors → GitHub**.
2. **Token expirado / permissões revogadas**: reautorizar em GitHub Settings → Applications → Lovable.
3. **Branch protegida**: regras de proteção no `main` impedem o bot de push.

### Ação para o usuário
1. Abrir **Connectors → GitHub** no Lovable e confirmar o status "Connected".
2. Se desconectado: clicar **Connect project** novamente.
3. Após reconectar, eu farei uma edição mínima (bump de versão para v1.8.2) — esse commit deve aparecer no GitHub e o Cloudflare Pages fará o build automático.
4. Se ainda assim não atualizar: verificar no Cloudflare Pages → Deployments se há build falhando ou se o webhook do GitHub está desativado.

### Não posso fazer pelo usuário
- Reautorizar o app GitHub (requer login do usuário no GitHub).
- Verificar painel do Cloudflare Pages.
- Forçar um push manual (estado git é interno ao Lovable).

## Ordem de execução

1. Aplicar correções do PWA + MonitoringContext + bump v1.8.2.
2. O commit gerado servirá de teste para a sincronização GitHub → Cloudflare.
3. Se o commit aparecer no GitHub: problema 2 resolvido.
4. Se não aparecer: usuário precisa reconectar GitHub em Connectors.


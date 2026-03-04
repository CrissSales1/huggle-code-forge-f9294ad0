

# Fix: Forçar limpeza de cache programaticamente

## Problema

O código fonte está correto (v1.2.0), mas os navegadores dos usuários continuam servindo a versão antiga do Service Worker e dos assets cacheados. O `skipWaiting` e `clientsClaim` só funcionam para **novos** Service Workers — se o navegador já tem um SW antigo registrado que não reconhece essas diretivas, ele não atualiza.

## Solução

Adicionar um script inline no `index.html` que roda **antes** do React, detecta SWs antigos e força a limpeza:

1. **`index.html`** — Adicionar `<script>` inline antes do módulo React que:
   - Chama `navigator.serviceWorker.getRegistrations()` e faz `unregister()` de todos
   - Limpa todos os caches via `caches.keys()` + `caches.delete()`
   - Usa uma flag em `localStorage` (`cache_version`) para executar isso apenas uma vez por versão (evitar loop infinito de reload)
   - Após limpar, faz `location.reload()` para carregar assets frescos

```javascript
<script>
(function() {
  var CURRENT_VERSION = '1.2.0';
  var cached = localStorage.getItem('app_cache_version');
  if (cached !== CURRENT_VERSION) {
    localStorage.setItem('app_cache_version', CURRENT_VERSION);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(regs) {
        regs.forEach(function(r) { r.unregister(); });
      });
    }
    if ('caches' in window) {
      caches.keys().then(function(names) {
        names.forEach(function(n) { caches.delete(n); });
      });
    }
    setTimeout(function() { location.reload(); }, 300);
  }
})();
</script>
```

Isso resolve o problema para **todos** os usuários sem que precisem limpar cache manualmente.

## Arquivos

| Arquivo | Mudança |
|---------|---------|
| `index.html` | Script inline de cache-busting antes do `<script type="module">` |


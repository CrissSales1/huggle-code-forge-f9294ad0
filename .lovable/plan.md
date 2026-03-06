

# Fix: Atualizar versão para confirmar deploy

O código já está correto: `deriveHlsUrl` gera `/index.m3u8` e o retry está limitado a 3 tentativas. O problema é que o build em produção ainda é antigo (os logs mostram a URL sem `index.m3u8`).

## Mudança

### Configuracoes.tsx

- Atualizar versão de `1.1.95 (HLS Fallback)` para `1.1.96 (HLS URL Fix)` para confirmar que o novo build foi aplicado.

Após o deploy, verifique se a versão na página de Configurações mostra `1.1.96`. Se sim, o fallback HLS usará a URL correta com `index.m3u8`.


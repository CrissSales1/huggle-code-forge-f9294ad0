

# Fix: HLS Fallback URL e Retry Infinito

## Problemas

1. **URL HLS incorreta**: A derivação gera `http://localhost:8888/entrada/` mas o mediamtx espera `http://localhost:8888/entrada/index.m3u8`. O erro `no EXTM3U delimiter` confirma que o servidor retorna uma página HTML/404 em vez do manifest HLS.

2. **Retry infinito**: Quando o HLS falha com erro fatal, o código reconecta após 5s sem limite de tentativas, gerando um loop infinito de erros no console.

## Mudanças

### MonitoringContext.tsx

1. **Corrigir `deriveHlsUrl`**: Adicionar `index.m3u8` ao final da URL derivada
   - Antes: `http://ip:8888/entrada/`
   - Depois: `http://ip:8888/entrada/index.m3u8`

2. **Limitar retries HLS**: Adicionar contador de tentativas (máximo 3). Após esgotar, parar e exibir mensagem de erro clara ao usuário em vez de ficar em loop.

3. **Melhorar mensagem de erro**: Quando todas as tentativas falharem, informar que tanto WHEP quanto HLS falharam e sugerir verificar a URL/servidor.


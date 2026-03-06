

# v1.1.94 fix: URLs go2rtc porta 1984

O go2rtc usa porta única 1984 para tudo. A URL do usuário é `http://localhost:1984/stream.html?src=entrada`.

Os endpoints do go2rtc na porta 1984 são:
- WHEP: `http://localhost:1984/api/whep?src=entrada`
- HLS: `http://localhost:1984/api/stream.m3u8?src=entrada`

## Mudanças

### `MonitoringContext.tsx`

**`deriveHlsFromWhep`**: Manter a mesma porta (não trocar para 8888). Apenas substituir o path `/api/whep` por `/api/stream.m3u8`, preservando o parâmetro `src=`.

```typescript
const deriveHlsFromWhep = useCallback((whepUrl: string): string => {
  try {
    const u = new URL(whepUrl);
    const srcParam = u.searchParams.get('src') || 'camera1';
    // go2rtc: mesma porta para tudo, só muda o path
    u.pathname = '/api/stream.m3u8';
    u.search = `?src=${srcParam}`;
    return u.toString();
  } catch {
    return whepUrl.replace(/\/api\/whep/, '/api/stream.m3u8');
  }
}, []);
```

**`detectProtocol`**: Aceitar também URLs do tipo `stream.html?src=` como WHEP (o usuário pode colar a URL do player, e o sistema converte para o endpoint WHEP correto). Antes de conectar WHEP, converter `stream.html` para `api/whep`.

### `CameraMonitor.tsx`

Atualizar placeholder para: `http://192.168.1.x:1984/api/whep?src=camera1`

### `Configuracoes.tsx`

Manter versão 1.1.94.

## Arquivos

| Arquivo | Mudança |
|---------|---------|
| `MonitoringContext.tsx` | Fix `deriveHlsFromWhep` (mesma porta), normalizar `stream.html` → `api/whep` |
| `CameraMonitor.tsx` | Placeholder porta 1984 |


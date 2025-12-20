# 🔧 Correção Urgente - URL do Webhook Rekor Scout

## ❌ Problema Identificado

Analisando os logs, o Rekor Scout está tentando enviar para a **URL ERRADA**:

```
❌ URL INCORRETA (está nos logs):
https://01996b0c-b023-7072-9c66-66df44ef0fcd.sandbox.mocha.app/api/rekorscout/webhook
```

**Resultado:** Erro 502 (Bad Gateway) - O servidor sandbox não está ativo e retorna apenas HTML de erro.

---

## ✅ Solução

### URL Correta para Configurar

Configure o Rekor Scout com esta URL:

```
✅ URL CORRETA (produção):
https://5e6hs2nknfd26.mocha.app/api/rekorscout/webhook
```

---

## 🔧 Como Corrigir

### Opção 1: Rekor Scout Web Interface

1. Acesse as configurações do Rekor Scout
2. Vá em **Webhooks** ou **Integrations**
3. Localize o webhook configurado
4. **ALTERE** a URL para: `https://5e6hs2nknfd26.mocha.app/api/rekorscout/webhook`
5. Salve as alterações

### Opção 2: Arquivo de Configuração (config.yaml)

Se você configurou via arquivo YAML, edite:

```yaml
webhooks:
  - url: "https://5e6hs2nknfd26.mocha.app/api/rekorscout/webhook"  # ← URL CORRETA
    method: POST
    events:
      - plate_detection
    headers:
      Content-Type: "application/json"
```

### Opção 3: Alpine ALPR Config

Se está usando Alpine ALPR diretamente, edite o arquivo de configuração:

```
webhook_url = https://5e6hs2nknfd26.mocha.app/api/rekorscout/webhook
```

---

## 🧪 Teste Após Corrigir

Após atualizar a URL, teste com este comando:

```bash
curl -X POST https://5e6hs2nknfd26.mocha.app/api/rekorscout/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "results": [{
      "plate": "ABC1234",
      "score": 0.95
    }]
  }'
```

**Resposta esperada de SUCESSO:**
```json
{
  "success": true,
  "message": "Placa processada com sucesso",
  "placa": "ABC1234",
  "is_morador": false,
  "casa": null
}
```

---

## 📊 Como Verificar se Está Funcionando

1. **Configure a URL correta** no Rekor Scout
2. **Passe um veículo** na câmera
3. **Abra o PortaCerta** na aba **Monitoramento**
4. **A detecção deve aparecer** em até 3 segundos

---

## ⚠️ Importante

- **NÃO use** URLs `.sandbox.mocha.app` - são temporárias
- **USE SEMPRE** `https://5e6hs2nknfd26.mocha.app` - este é seu domínio de produção
- Após corrigir, aguarde alguns segundos para o Rekor Scout aplicar as mudanças

---

## 🆘 Se Ainda Não Funcionar

1. Verifique se salvou a configuração corretamente
2. Reinicie o serviço do Rekor Scout/Alpine
3. Teste manualmente com curl (comando acima)
4. Verifique os logs novamente - deve mostrar sucesso ao invés de 502

---

**Status Atual:** ❌ Webhook configurado com URL sandbox (inativa)  
**Ação Necessária:** ✅ Atualizar para URL de produção  
**Tempo Estimado:** 2 minutos

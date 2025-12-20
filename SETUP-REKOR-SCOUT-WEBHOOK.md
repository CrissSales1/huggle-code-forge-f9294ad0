# 🎯 Configuração do Webhook Rekor Scout - PortaCerta

## ⚠️ IMPORTANTE

O Rekor Scout precisa ser configurado para **ENVIAR** as detecções de placas para o webhook do PortaCerta. Sem esta configuração, as detecções não aparecerão no monitoramento.

---

## 📋 Pré-requisitos

- Rekor Scout instalado e funcionando
- Acesso ao painel de configuração do Rekor Scout
- URL do seu app PortaCerta

---

## 🔧 Configuração Passo a Passo

### Etapa 1: Obter a URL do Webhook

Sua URL do webhook é:
```
https://5e6hs2nknfd26.mocha.app/api/rekorscout/webhook
```

**OU**

Se estiver em desenvolvimento local:
```
http://localhost:5173/api/rekorscout/webhook
```

### Etapa 2: Configurar no Rekor Scout

#### Opção A: Rekor Scout Cloud

1. Acesse o painel do Rekor Scout Cloud
2. Vá em **Settings** > **Webhooks** ou **Integrations**
3. Clique em **Add Webhook**
4. Configure:
   - **URL**: `https://5e6hs2nknfd26.mocha.app/api/rekorscout/webhook`
   - **Method**: POST
   - **Content-Type**: application/json
   - **Events**: Plate Detection / License Plate Read
   - **Authentication** (opcional): Se configurou REKOR_SCOUT_WEBHOOK_TOKEN, adicione como header

#### Opção B: Rekor Scout On-Premises / Desktop

1. Abra o arquivo de configuração do Rekor Scout (geralmente `config.yaml` ou via interface)
2. Localize a seção de webhooks ou notifications
3. Adicione:
   ```yaml
   webhooks:
     - url: "https://5e6hs2nknfd26.mocha.app/api/rekorscout/webhook"
       method: POST
       events:
         - plate_detection
       headers:
         Content-Type: "application/json"
   ```
4. Salve e reinicie o Rekor Scout

#### Opção C: Via API do Rekor Scout

Se o Rekor Scout tem API própria para configuração:
```bash
curl -X POST https://api.rekorscout.com/v1/webhooks \
  -H "Authorization: Bearer SEU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://5e6hs2nknfd26.mocha.app/api/rekorscout/webhook",
    "events": ["plate.detected"],
    "active": true
  }'
```

### Etapa 3: Testar a Configuração

1. No PortaCerta, vá na aba **Monitoramento**
2. O sistema mostrará "Aguardando Detecções"
3. Faça o Rekor Scout detectar uma placa (passe um carro na câmera)
4. Em até 3 segundos, a detecção deve aparecer no monitoramento

**Se NÃO aparecer:**
- Verifique os logs do Rekor Scout para ver se está enviando
- Teste o webhook manualmente (veja seção abaixo)
- Verifique se a URL está correta

---

## 🧪 Testar o Webhook Manualmente

Use este comando para testar se o webhook está funcionando:

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

**Se a placa estiver cadastrada como morador:**
```json
{
  "success": true,
  "message": "Placa processada com sucesso",
  "placa": "ABC1234",
  "is_morador": true,
  "casa": "CASA 10"
}
```

---

## 📊 Formatos de Payload Suportados

O webhook aceita vários formatos de payload do Rekor Scout:

### Formato 1: Array de resultados (padrão Plate Recognizer)
```json
{
  "results": [
    {
      "plate": "ABC1234",
      "score": 0.95
    }
  ]
}
```

### Formato 2: Objeto lpr_data
```json
{
  "lpr_data": {
    "plate": "ABC1234",
    "confidence": 0.95
  }
}
```

### Formato 3: Placa direta
```json
{
  "plate": "ABC1234",
  "score": 0.95
}
```

### Formato 4: License plate
```json
{
  "license_plate": "ABC1234",
  "confidence": 0.95
}
```

---

## 🔐 Segurança (Opcional)

Para adicionar autenticação ao webhook:

1. No PortaCerta, configure a secret `REKOR_SCOUT_WEBHOOK_TOKEN`
2. No Rekor Scout, adicione header de autenticação:
   - Header: `X-Rekor-Token: seu_token_aqui`
   - OU: `Authorization: Bearer seu_token_aqui`

---

## 🛠️ Solução de Problemas

### Problema: "Aguardando detecções" mas nada aparece

**Possíveis causas:**
1. ✅ **Webhook não configurado no Rekor Scout** - Configure seguindo o guia acima
2. ✅ **URL incorreta** - Verifique se é `https://5e6hs2nknfd26.mocha.app/api/rekorscout/webhook`
3. ✅ **Firewall bloqueando** - Certifique-se que o Rekor Scout pode acessar a URL
4. ✅ **Formato de payload incompatível** - Teste manualmente com os formatos acima

### Problema: Erro 401 Unauthorized

**Solução:**
- Remova a secret `REKOR_SCOUT_WEBHOOK_TOKEN` se não estiver usando autenticação
- OU configure o header correto no Rekor Scout

### Problema: Placa detectada mas formato inválido

**Solução:**
- Verifique se a placa está no formato brasileiro: ABC1234 ou ABC1D23
- Placas com menos ou mais de 7 caracteres serão rejeitadas

### Problema: Detecções duplicadas

**Solução:**
- Normal se o Rekor Scout detecta a mesma placa várias vezes
- O sistema armazena todas as detecções
- Configure o Rekor Scout para enviar apenas 1 detecção por veículo

---

## 📝 Verificar Logs

Para ver se o webhook está recebendo dados, verifique os logs do PortaCerta:

```bash
# Logs mostrarão:
📝 Payload recebido do Rekor Scout: { ... }
✅ PLACA VÁLIDA RECEBIDA: ABC1234 (Confiança: 95.0%)
💾 Detecção salva no banco: ABC1234 - Morador: false
```

---

## ✅ Checklist Final

Antes de considerar a configuração completa:

- [ ] Webhook configurado no Rekor Scout com URL correta
- [ ] Evento de detecção de placa habilitado
- [ ] Content-Type: application/json configurado
- [ ] Teste manual do webhook funcionou
- [ ] Detecção apareceu no monitoramento após passar um carro
- [ ] Placa foi identificada corretamente
- [ ] Moradores são identificados quando cadastrados

---

## 🆘 Suporte

Se após seguir todos os passos as detecções ainda não aparecem:

1. Verifique os logs do Rekor Scout
2. Teste o webhook manualmente com curl
3. Confirme que o Rekor Scout está enviando para a URL correta
4. Verifique se não há firewall bloqueando
5. Confirme que o formato do payload é compatível

---

## 📚 Documentação Útil

- [Rekor Scout - Webhook Configuration](https://docs.rekorscout.com/webhooks)
- [Rekor Scout - API Reference](https://docs.rekorscout.com/api)

---

**Configurado com sucesso? As detecções devem aparecer automaticamente no monitoramento! 🎉**

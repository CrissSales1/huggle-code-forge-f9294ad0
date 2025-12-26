# 🎯 Configuração do Webhook Rekor Scout - PortaCerta

## ⚠️ IMPORTANTE

O Rekor Scout precisa ser configurado para **ENVIAR** as detecções de placas para o webhook do PortaCerta. Sem esta configuração, as detecções não aparecerão no monitoramento.

---

## 📋 Pré-requisitos

- Rekor Scout Desktop instalado e funcionando
- Câmera configurada e detectando placas
- Acesso à internet no computador do Rekor Scout
- **Company ID** da sua conta Rekor (obrigatório)

---

## 🔧 URL do Webhook

```
https://kbgftpiyzfmabrncpnas.supabase.co/functions/v1/rekor-webhook
```

---

## 🏆 Método Recomendado: "Other HTTP Web Server"

### Por que usar este método?

| Característica | Second Tube | Other HTTP Web Server |
|----------------|-------------|----------------------|
| Configuração | Via arquivo `alprd.conf` | ✅ Via interface gráfica |
| Heartbeats | Não envia | Envia (ignorados automaticamente) |
| Facilidade | Complexo | ✅ Simples |
| Suporte GUI | Não | ✅ Sim |
| **Recomendado** | ❌ Não | ✅ **Sim** |

---

## 📝 Passo a Passo - Configuração via GUI

### Etapa 1: Abrir o Rekor Scout Desktop

1. Inicie o aplicativo **Rekor Scout** no computador
2. Certifique-se de que a câmera está funcionando e detectando placas
3. Verifique se há conexão com a internet

### Etapa 2: Acessar Configurações de Web Server

1. Clique em **Configure** (ícone de engrenagem)
2. Vá em **Webserver** ou **Web Server Settings**
3. Localize a seção **Destination** ou **Upload Destination**

### Etapa 3: Selecionar "Other HTTP Web Server"

1. Na lista de opções, marque **"Other HTTP Web Server"**
2. Deixe desmarcadas as outras opções como "OpenALPR Cloud"

### Etapa 4: Configurar a URL

1. No campo **URL** ou **Endpoint**, cole:
   ```
   https://kbgftpiyzfmabrncpnas.supabase.co/functions/v1/rekor-webhook
   ```

### Etapa 5: ⚠️ Preencher o Company ID (OBRIGATÓRIO)

> **ATENÇÃO:** Este campo é **OBRIGATÓRIO**. Sem ele, a câmera pode não carregar corretamente!

1. Localize o campo **Company ID** na mesma seção
2. Preencha com seu ID de usuário/empresa do Rekor Scout
3. Se não souber seu Company ID:
   - Acesse sua conta no portal Rekor Scout
   - Vá em Settings/Profile
   - Copie o ID da sua conta

**Se o Company ID estiver vazio:**
- ❌ A câmera pode não carregar
- ❌ As detecções podem não ser enviadas
- ❌ O sistema pode apresentar erros

### Etapa 6: Aplicar e Reiniciar

1. Clique em **Apply** para salvar as configurações
2. Clique em **Finish** ou **OK** para fechar
3. **Reinicie o serviço do Rekor Scout**:
   - Windows: Reinicie o serviço "OpenALPR" no Gerenciador de Serviços
   - Ou: Feche e abra novamente o aplicativo

### Etapa 7: Testar a Integração

1. No PortaCerta, vá na aba **Monitoramento**
2. Passe um veículo na frente da câmera
3. A detecção deve aparecer em **1-3 segundos**

---

## 📊 Formatos de Payload Suportados

O webhook processa automaticamente os seguintes formatos:

### Formato 1: alpr_group (Detecção Agrupada)
```json
{
  "data_type": "alpr_group",
  "best_plate": {
    "plate": "ABC1234",
    "confidence": 95.5
  },
  "epoch_start": 1703123456000
}
```

### Formato 2: alpr_results (Detecção Individual)
```json
{
  "data_type": "alpr_results",
  "results": [{
    "plate": "ABC1234",
    "confidence": 95.5
  }],
  "epoch_time": 1703123456000
}
```

### Formato 3: Heartbeat (Ignorado Automaticamente)
```json
{
  "data_type": "heartbeat",
  "agent_hostname": "DESKTOP-ABC",
  "system_uptime_seconds": 12345
}
```

Os heartbeats são enviados periodicamente pelo Rekor Scout para indicar que o sistema está online. O PortaCerta **ignora automaticamente** esses eventos.

---

## ⚡ Configurações para Velocidade (Opcional)

Para reduzir o tempo entre detecção e exibição no app:

1. No Rekor Scout, vá em **Configure > OpenALPR Settings**
2. Localize e ative **Override** para cada configuração:

| Configuração | Valor Recomendado |
|--------------|-------------------|
| `plate_groups_min_plates_to_group` | **1** |
| `plate_groups_time_delta_ms` | **500** |

3. **IMPORTANTE:** NÃO desative `plate_groups_enabled` - isso impede o envio de webhooks!
4. Reinicie o serviço após as alterações

---

## 🛠️ Solução de Problemas

### ❌ Problema: Câmera não carrega quando ativa Web Server

**Causa:** Company ID não preenchido

**Solução:**
1. Volte às configurações de Webserver
2. Preencha o campo **Company ID** com seu ID de usuário
3. Aplique e reinicie o serviço

### ❌ Problema: Apenas heartbeats chegam, mas não detecções

**Causas possíveis:**
1. Câmera não está detectando placas
2. Configuração de plate_groups incorreta

**Solução:**
1. Verifique se a câmera está funcionando no Rekor Scout
2. Confirme que `plate_groups_enabled` está **ATIVADO**
3. Teste passando um veículo na frente da câmera

### ❌ Problema: Detecções demoram muito (mais de 5 segundos)

**Causa:** Configurações de agrupamento muito lentas

**Solução:**
1. Configure `plate_groups_min_plates_to_group = 1`
2. Configure `plate_groups_time_delta_ms = 500`
3. Reinicie o serviço

### ❌ Problema: "Aguardando detecções" mas nada aparece

**Verificar:**
1. ✅ URL do webhook está correta?
2. ✅ Company ID está preenchido?
3. ✅ "Other HTTP Web Server" está marcado?
4. ✅ Computador tem acesso à internet?
5. ✅ Serviço foi reiniciado após configuração?

### ❌ Problema: Placa detectada mas formato inválido

**Solução:**
- Verifique se a placa está no formato brasileiro: `ABC1234` ou `ABC1D23` (Mercosul)
- Placas com menos ou mais de 7 caracteres serão rejeitadas

---

## 🧪 Testar o Webhook Manualmente

Use este comando para testar se o webhook está funcionando:

```bash
curl -X POST https://kbgftpiyzfmabrncpnas.supabase.co/functions/v1/rekor-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "data_type": "alpr_group",
    "best_plate": {
      "plate": "ABC1234",
      "confidence": 95.5
    },
    "epoch_start": 1703123456000
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

## ❌ Método Alternativo: Second Tube (NÃO RECOMENDADO)

Este método requer edição manual de arquivos de configuração e é mais complexo. Use apenas se o método GUI não funcionar.

### Configuração via alprd.conf

1. Edite o arquivo `C:\OpenALPR\Agent\etc\openalpr\alprd.conf`
2. Adicione/modifique:

```ini
upload_second_tube_post_enabled = 1
upload_second_tube_post_url = https://kbgftpiyzfmabrncpnas.supabase.co/functions/v1/rekor-webhook
upload_single_plates = 1
```

3. Reinicie o serviço OpenALPR

**Desvantagens:**
- Configuração manual complexa
- Sem interface gráfica
- Mais difícil de diagnosticar problemas
- Não envia heartbeats (dificulta saber se está conectado)

---

## ✅ Checklist Final

Antes de considerar a configuração completa:

- [ ] **Other HTTP Web Server** marcado
- [ ] URL do webhook correta: `https://kbgftpiyzfmabrncpnas.supabase.co/functions/v1/rekor-webhook`
- [ ] **Company ID preenchido** (obrigatório!)
- [ ] Configurações aplicadas
- [ ] Serviço reiniciado
- [ ] Teste manual do webhook funcionou
- [ ] Detecção apareceu no monitoramento após passar um veículo
- [ ] Moradores são identificados quando cadastrados

---

## 📚 Documentação Útil

- [Guia Interativo no PortaCerta](/guia-rekor-scout) - Tutorial passo a passo com imagens
- [Página de Ajuda e Teste](/monitoramento-help) - Testar conexão e formatos

---

**Configurado com sucesso? As detecções devem aparecer automaticamente no monitoramento! 🎉**

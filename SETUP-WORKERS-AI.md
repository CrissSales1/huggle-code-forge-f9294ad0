# 🤖 Configuração Cloudflare Workers AI - PortaCerta

## Visão Geral

Este guia mostra como configurar o Cloudflare Workers AI para reconhecimento automático de placas usando a REST API direta.

> **✅ Vantagem**: Não depende de bindings no wrangler.json - funciona via API REST

## 📋 Pré-requisitos

- Conta Cloudflare (gratuita)
- Acesso ao painel Cloudflare Workers

## 🚀 Passo a Passo Completo

### Etapa 1: Obter Account ID

#### 1.1 Acessar Dashboard
1. Vá para [dash.cloudflare.com](https://dash.cloudflare.com)
2. Faça login com sua conta Cloudflare
3. Na barra lateral, você verá seu Account ID ou clique em qualquer domínio
4. O Account ID aparece na URL: `dash.cloudflare.com/<ACCOUNT_ID>/...`
5. Ou vá em **Workers & Pages** e veja no canto direito

#### 1.2 Copiar Account ID
1. Copie o Account ID (formato: 32 caracteres hexadecimais)
2. Exemplo: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`

### Etapa 2: Criar API Token

#### 2.1 Acessar API Tokens
1. Clique no seu perfil (canto superior direito)
2. Selecione **My Profile**
3. Vá na aba **API Tokens**
4. Clique **Create Token**

#### 2.2 Configurar Permissões
1. Clique **Create Custom Token**
2. Configure:
   - **Token name**: `PortaCerta Workers AI`
   - **Permissions**:
     - Account > Workers AI > Read
     - Account > Workers Scripts > Read
   - **Account Resources**: Selecione sua conta
   - **TTL**: Deixe padrão ou configure expiração
3. Clique **Continue to summary**
4. Revise e clique **Create Token**

#### 2.3 Copiar Token
1. **IMPORTANTE**: Copie o token imediatamente
2. Você não poderá vê-lo novamente!
3. Guarde em local seguro

### Etapa 3: Configurar no PortaCerta

#### 3.1 Adicionar Secrets
1. Acesse seu painel do PortaCerta
2. Vá em **Configurações** ou onde apareceu a mensagem sobre secrets
3. Adicione os dois secrets:

**Secret 1: CLOUDFLARE_ACCOUNT_ID**
- Nome: `CLOUDFLARE_ACCOUNT_ID`
- Valor: cole seu Account ID aqui
- Tipo: Secret (encrypted)

**Secret 2: CLOUDFLARE_API_TOKEN**
- Nome: `CLOUDFLARE_API_TOKEN`
- Valor: cole seu API Token aqui
- Tipo: Secret (encrypted)

#### 3.2 Verificar Configuração
1. Abra seu PortaCerta
2. Vá em **Cadastro de Visitante**
3. Clique no ícone da câmera
4. Deve aparecer: **"✅ Cloudflare Workers AI - Reconhecimento Inteligente"**

### Etapa 4: Testar Funcionamento

#### 4.1 Teste Real
1. Use a câmera para focar em uma placa
2. Clique **"Ler Placa"**
3. Aguarde processamento
4. Placa deve ser reconhecida automaticamente

## 💰 Custos e Limites

### Workers AI (2024)
- **Primeiras 10.000 requisições/dia**: GRÁTIS
- **Após limite diário**: $0.011 por 1.000 requisições
- **Modelo usado**: Llava 1.5 7B (multimodal - visão + texto)

### Estimativa de Uso
- **Uso baixo** (20 placas/dia): GRÁTIS
- **Uso médio** (50 placas/dia): GRÁTIS
- **Uso alto** (100 placas/dia): GRÁTIS
- **Uso muito alto** (300 placas/dia): GRÁTIS

💡 **Praticamente ilimitado para uso em portarias!**

## 🔍 Monitoramento

### Ver Uso Atual
1. Cloudflare Dashboard
2. **Analytics & Logs** > **Workers**
3. Veja métricas de uso da AI

### Configurar Alertas
1. Vá em **Notifications**
2. Configure alertas de uso se necessário

## 🛠️ Solução de Problemas

### Erro: "Account ID não configurado"
- ✅ Verifique se adicionou o secret CLOUDFLARE_ACCOUNT_ID
- ✅ Confirme que o ID está correto (32 caracteres)
- ✅ Faça redeploy após adicionar

### Erro: "API Token não configurado"
- ✅ Verifique se adicionou o secret CLOUDFLARE_API_TOKEN
- ✅ Confirme que o token está correto
- ✅ Verifique se o token não expirou

### Erro: "Unauthorized" ou "Forbidden"
- ✅ Verifique as permissões do API Token
- ✅ Token deve ter permissão para Workers AI
- ✅ Recrie o token se necessário

### Erro: "Model not found"
- ✅ Workers AI pode estar temporariamente indisponível
- ✅ Tente novamente em alguns minutos
- ✅ Verifique status do Cloudflare

### Reconhecimento Impreciso
- ✅ Use boa iluminação
- ✅ Mantenha placa centralizada
- ✅ Configure área de leitura no modal
- ✅ Evite reflexos e sombras

## 🔐 Segurança

### ✅ Boas Práticas
- Nunca compartilhe seu API Token
- Use secrets do Cloudflare (encrypted)
- Configure permissões mínimas no token
- Monitore uso regularmente
- Troque token a cada 6 meses

### ❌ Evite
- Não coloque tokens no código fonte
- Não commite arquivos com tokens
- Não use mesmo token em múltiplos projetos
- Não compartilhe por email/chat

## 🔄 Rotação de Tokens

Recomenda-se trocar o token a cada 6 meses:

1. Crie novo token no Cloudflare
2. Atualize o secret CLOUDFLARE_API_TOKEN
3. Teste funcionamento
4. Desative token antigo no Cloudflare

## 🆘 Em Caso de Vazamento

Se suspeitar que seu token foi comprometido:

1. **Imediatamente**: Desative o token no Cloudflare
2. Crie um novo token
3. Atualize o secret no app
4. Monitore usage incomum
5. Verifique logs de acesso

## 📞 Suporte

### Recursos Oficiais
- [Documentação Workers AI](https://developers.cloudflare.com/workers-ai/)
- [API Reference](https://developers.cloudflare.com/workers-ai/models/)
- [Community Discord](https://discord.cloudflare.com)

---

## ✅ Checklist Final

Antes de finalizar, verifique:

- [ ] Account ID copiado corretamente
- [ ] API Token criado com permissões corretas
- [ ] Secret CLOUDFLARE_ACCOUNT_ID adicionado
- [ ] Secret CLOUDFLARE_API_TOKEN adicionado
- [ ] Teste de reconhecimento funcionando
- [ ] Alertas de uso configurados (opcional)

**Parabéns! Seu reconhecimento de placas com Workers AI está configurado! 🎉**

## 🚀 Vantagens do Workers AI

✅ **Grátis**: 10.000 requisições/dia gratuitas
✅ **Rápido**: Processamento em edge, próximo ao usuário
✅ **Sem setup**: Não precisa configurar infraestrutura
✅ **Escalável**: Cloudflare cuida da escala automaticamente
✅ **Integrado**: Já está no ecossistema Cloudflare
✅ **Moderno**: Usa modelos de IA de ponta (Llava 1.5 7B)

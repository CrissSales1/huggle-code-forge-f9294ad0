# 🏢 PortaCerta - Sistema de Controle de Visitantes

## 📋 Visão Geral

O **PortaCerta** é um sistema web completo e moderno para controle de visitantes em condomínios residenciais e comerciais. Desenvolvido com tecnologias de ponta, oferece uma interface intuitiva e recursos avançados para gestão eficiente de entrada e saída de visitantes.

### 🎯 Objetivo Principal

Automatizar e otimizar o processo de controle de acesso de visitantes, proporcionando:
- **Segurança** através do controle rigoroso de entrada/saída
- **Eficiência** com processos automatizados e interfaces intuitivas  
- **Rastreabilidade** completa de todas as visitas
- **Relatórios** detalhados para análise e auditoria

---

## 🛠️ Stack Tecnológica

### Frontend
- **React 19** com TypeScript para interface moderna e tipada
- **Tailwind CSS** para design responsivo e consistente
- **React Router 7** para navegação SPA
- **Lucide React** para iconografia consistente
- **Recharts** para visualizações de dados avançadas
- **Vite** como bundler e dev server

### Backend
- **Hono.js** framework web otimizado para Cloudflare Workers
- **Cloudflare D1** banco de dados SQLite serverless
- **Cloudflare Workers** para execução edge computing
- **Zod** para validação de dados robusta

### Infraestrutura
- **Cloudflare Pages** para hospedagem do frontend
- **Cloudflare Workers** para APIs serverless
- **Google Vision API** para reconhecimento de placas (opcional)

---

## 🎨 Interface e Design

### Princípios de Design
- **Design System Linear/Notion-inspired** com elementos modernos
- **Paleta de cores harmoniosa** com azul primário (#2563eb)
- **Componentes com gradientes** e sombras sutis
- **Animações fluidas** e transições suaves
- **Tipografia clara** com hierarquia bem definida
- **Layout responsivo** otimizado para desktop, tablet e mobile

### Elementos Visuais Únicos
- **Prismas magnéticos 3D** com efeito visual realista em laranja
- **Placas de veículo** estilizadas com tipografia automotiva
- **Cards com gradientes** e efeitos de profundidade
- **Badges coloridos** para status e categorização
- **Loading states** com spinners animados

---

## 📊 Funcionalidades Principais

### 1. 🏠 Dashboard Principal

#### Estatísticas em Tempo Real
- **Vagas de Visitantes Disponíveis** - contador dinâmico com ícone de carro
- **Prismas Magnéticos Disponíveis** - gestão visual dos dispositivos
- **Total de Visitantes Ativos** - monitoramento em tempo real

#### Lista de Visitantes Ativos
Cards visuais modernos exibindo:
- **Nome do visitante** em destaque
- **Casa visitada** com ícone de casa
- **Placa do veículo** estilizada como placa oficial brasileira
- **Horário de entrada** formatado em português
- **Tempo de permanência** calculado dinamicamente
- **Número do prisma** em 3D laranja no canto superior direito
- **Tipo de vaga** com badges coloridos:
  - 🟢 Verde para "Vaga de Visitante"
  - 🟠 Laranja para "Vaga do Morador"
- **Alerta visual** para permanência > 24h em vermelho
- **Observações** quando disponíveis
- **Liberado por** quando informado
- **Botões de ação**:
  - "Dar Baixa" proeminente em verde
  - "Editar" discreto em cinza

#### Funcionalidades do Dashboard
- **Auto-refresh** a cada 30 segundos
- **Botão de atualização manual** com ícone
- **Botão "Novo Cadastro"** com acesso direto ao modal
- **Estado vazio** com call-to-action para primeiro cadastro

### 2. ➕ Cadastro de Visitantes

#### Modal em Duas Etapas Intuitivas

**Etapa 1: Seleção do Prisma**
- **Grid visual** com prismas disponíveis em 3D
- **Prismas indisponíveis** claramente marcados
- **Hover effects** para melhor UX
- **Validação** de disponibilidade em tempo real

**Etapa 2: Dados do Visitante**
- **Formulário completo** com todos os campos necessários:
  - Nome do visitante (maiúsculo automático)
  - Casa visitada (maiúsculo automático)  
  - Placa do veículo (validação formato brasileiro)
  - Tipo de vaga (radio buttons)
  - Observações (opcional)
  - Liberado por (opcional)
- **Prisma selecionado** exibido em 3D no canto superior direito
- **Autocompletar inteligente**:
  - Por placa: preenche nome e casa automaticamente
  - Por nome: preenche placa e casa automaticamente
- **Validação em tempo real** com Zod
- **Mensagens de erro** claras e úteis

#### Recursos Avançados de Cadastro
- **Reconhecimento de placas** via Google Vision API (opcional)
- **Histórico de visitantes** para preenchimento automático
- **Validação de placas** brasileiras (antiga e Mercosul)
- **Prevenção de duplicatas** de prismas

### 3. ✏️ Edição de Visitantes

#### Modal de Edição Completo
- **Todos os campos** editáveis exceto prisma
- **Dados pré-preenchidos** com informações atuais
- **Validação** idêntica ao cadastro
- **Feedback visual** de sucesso/erro
- **Preservação de dados** não alterados

### 4. 📈 Relatórios e Histórico

#### Filtros Sempre Visíveis
- **Data inicial e final** com date pickers
- **Nome do visitante** com busca parcial
- **Casa visitada** com busca parcial
- **Placa do veículo** com busca parcial
- **Botão "Limpar Filtros"** para reset rápido

#### Estatísticas do Período
Cards informativos mostrando:
- **Total de visitas** no período filtrado
- **Visitas finalizadas** (com saída registrada)
- **Visitas ativas** (ainda no condomínio)
- **Tempo médio de permanência** calculado

#### Tabela de Resultados
- **Dados completos** de cada visitante
- **Prisma 3D** na coluna correspondente
- **Placa estilizada** como placa oficial
- **Status visual** com badges coloridos
- **Tempo de permanência** calculado dinamicamente
- **Scroll horizontal** responsivo para mobile

#### Paginação Inteligente
- **100 registros por página** por padrão
- **Navegação por páginas** com primeira/última
- **Indicadores visuais** de página atual
- **Contador de registros** exibido

#### Exportação de Dados
- **Formato CSV** com UTF-8 BOM
- **Todas as colunas** incluídas
- **Nome do arquivo** com timestamp
- **Download automático** via browser

### 5. ⚙️ Configurações do Sistema

#### Gestão de Recursos
- **Configuração de vagas totais** para visitantes
- **Configuração de prismas totais** disponíveis
- **Validação** de valores mínimos
- **Feedback visual** de alterações pendentes

#### Gestão de Dados
- **Limpeza completa** do banco de dados
- **Processo de confirmação** em duas etapas para segurança
- **Reset automático** de prismas para estado livre
- **Alerta de sucesso** pós-limpeza (desaparece em 5s)

#### Ajuste Automático de Prismas
- **Criação automática** de novos prismas quando aumenta total
- **Remoção segura** de prismas livres quando diminui total
- **Preservação** de prismas em uso

### 6. 📊 Estatísticas Avançadas

#### Períodos de Análise
- **7 dias** para análise semanal
- **30 dias** para análise mensal  
- **90 dias** para análise trimestral

#### Cards de Resumo Executivo
- **Total de visitantes** no período
- **Média diária** de visitantes
- **Tempo médio** de permanência
- **Taxa de ocupação** percentual

#### Gráficos Interativos (Recharts)

**Visitantes por Dia**
- **Gráfico de área** com gradiente azul
- **Eixo temporal** formatado em português
- **Tooltips informativos** com dados detalhados

**Horários de Maior Movimento**
- **Gráfico de barras** em verde
- **Distribuição por hora** (0h-23h)
- **Identificação** de picos de movimento

**Distribuição de Tempo de Permanência**
- **Gráfico de pizza** colorido
- **Faixas de tempo** categorizadas
- **Percentuais** calculados automaticamente

**Visitantes por Dia da Semana**
- **Gráfico de barras** em azul
- **Dias da semana** em português
- **Padrões semanais** de visitação

#### Rankings e Listas

**Top Visitantes Recorrentes**
- **Lista ranqueada** por número de visitas
- **Nome e casa** do visitante
- **Total de visitas** no período

**Maior Tempo de Permanência**
- **Lista ordenada** por tempo de estadia
- **Cálculo preciso** em horas e minutos
- **Data da visita** para contexto

#### Sistema de Alertas
- **Visitantes com +24h** automaticamente detectados
- **Alertas visuais** em vermelho
- **Detalhes contextuais** da situação

---

## 🔧 Recursos Técnicos Avançados

### Integração com Google Vision API

#### Reconhecimento de Placas
- **Upload de imagens** via modal de câmera
- **Processamento automático** com IA
- **Correção de caracteres** mal reconhecidos
- **Validação** de formato brasileiro
- **Suporte** a placas antigas e Mercosul
- **Fallback gracioso** quando API não configurada

#### Configuração Flexível
- **API key** configurável via secrets
- **Status check** automático
- **Instruções de setup** para desenvolvedores

### Sistema de Validação Robusto

#### Validação de Placas Brasileiras
- **Formato antigo**: ABC1234 (3 letras + 4 números)
- **Formato Mercosul**: ABC1A23 (3 letras + 1 número + 1 letra + 2 números)
- **Normalização automática** para maiúsculas
- **Remoção** de caracteres especiais

#### Esquemas Zod Completos
- **Validação client-side** e server-side
- **Mensagens de erro** personalizadas em português
- **Tipos TypeScript** derivados automaticamente

### Performance e UX

#### Otimizações de Performance
- **Fetch com retry** automático (3 tentativas)
- **Timeout** de 10 segundos por request
- **Cache inteligente** de dados estáticos
- **Lazy loading** onde apropriado
- **Debounce** em campos de busca

#### Estados de Loading
- **Spinners animados** durante carregamento
- **Skeleton screens** para melhor UX
- **Estados de erro** informativos
- **Retry mechanisms** automáticos

#### Responsividade Completa
- **Layout fluid** de 320px até 4K
- **Breakpoints** otimizados para todos os dispositivos
- **Scroll horizontal** em tabelas para mobile
- **Touch-friendly** interfaces
- **Navegação adaptativa** com scroll horizontal

### Internacionalização e Localização

#### Formatação Brasileira
- **Datas e horários** em formato brasileiro
- **Timezone** de Brasília (-03:00) padrão
- **Formatação de números** com separadores brasileiros
- **Textos** completamente em português

---

## 🗄️ Estrutura do Banco de Dados

### Tabela: visitantes
```sql
- id (INTEGER PRIMARY KEY AUTOINCREMENT)
- nome (TEXT NOT NULL)
- casa_visitada (TEXT NOT NULL)  
- placa_veiculo (TEXT NOT NULL)
- numero_prisma (INTEGER)
- estacionar_vaga_morador (BOOLEAN DEFAULT 0)
- observacoes (TEXT)
- liberado_por (TEXT)
- hora_entrada (DATETIME NOT NULL)
- hora_saida (DATETIME)
- is_ativo (BOOLEAN DEFAULT 1)
- created_at (DATETIME DEFAULT CURRENT_TIMESTAMP)
- updated_at (DATETIME DEFAULT CURRENT_TIMESTAMP)
```

### Tabela: prismas_magneticos  
```sql
- id (INTEGER PRIMARY KEY AUTOINCREMENT)
- numero (INTEGER NOT NULL UNIQUE)
- is_em_uso (BOOLEAN DEFAULT 0)
- visitante_id (INTEGER)
- created_at (DATETIME DEFAULT CURRENT_TIMESTAMP)
- updated_at (DATETIME DEFAULT CURRENT_TIMESTAMP)
```

### Tabela: configuracoes_sistema
```sql
- id (INTEGER PRIMARY KEY AUTOINCREMENT)
- total_vagas_visitantes (INTEGER NOT NULL DEFAULT 10)
- total_prismas_magneticos (INTEGER NOT NULL DEFAULT 20)
- created_at (DATETIME DEFAULT CURRENT_TIMESTAMP)
- updated_at (DATETIME DEFAULT CURRENT_TIMESTAMP)
```

---

## 🔐 Segurança e Validação

### Validação de Dados
- **Server-side validation** com Zod em todas as APIs
- **Client-side validation** em tempo real
- **Sanitização** de inputs automática
- **Prevenção** de SQL injection via prepared statements

### Controle de Integridade
- **Verificação** de disponibilidade de prismas
- **Prevenção** de estados inconsistentes
- **Rollback automático** em caso de erro
- **Logs detalhados** para debugging

### Segurança de API
- **CORS configurado** adequadamente
- **Rate limiting** implícito via Cloudflare
- **Headers de segurança** configurados
- **Validação** de todos os payloads

---

## 📱 Compatibilidade e Suporte

### Dispositivos Suportados
- **Desktop**: Chrome, Firefox, Safari, Edge (últimas 2 versões)
- **Tablet**: iPad, Android tablets (landscape e portrait)
- **Mobile**: iPhone, Android phones (iOS 12+, Android 8+)

### Funcionalidades por Dispositivo
- **Desktop**: Experiência completa com todos os recursos
- **Tablet**: Layout adaptado com grids responsivos
- **Mobile**: Interface otimizada com navegação por scroll

### Acessibilidade
- **Labels** adequados em formulários
- **Contraste** conforme WCAG 2.1 AA
- **Navegação por teclado** completa
- **Screen reader** friendly
- **Textos alternativos** em elementos visuais

---

## 🚀 Performance e Escalabilidade

### Métricas de Performance
- **First Contentful Paint**: < 1.5s
- **Largest Contentful Paint**: < 2.5s
- **Cumulative Layout Shift**: < 0.1
- **First Input Delay**: < 100ms

### Escalabilidade
- **Edge computing** via Cloudflare Workers
- **CDN global** para assets estáticos
- **Banco de dados** serverless escalável
- **Zero cold start** em requests frequentes

### Otimizações
- **Tree shaking** para bundle size mínimo
- **Code splitting** automático por rotas
- **Asset optimization** automática
- **Caching inteligente** em múltiplas camadas

---

## 🔄 Fluxos de Trabalho

### Fluxo de Cadastro de Visitante
1. Porteiro acessa dashboard
2. Clica em "Novo Cadastro"
3. Seleciona prisma disponível no grid visual
4. Preenche dados do visitante (com autocompletar)
5. Confirma cadastro
6. Visitante recebe prisma e acessa condomínio
7. Dashboard atualiza automaticamente

### Fluxo de Saída de Visitante  
1. Visitante entrega prisma na portaria
2. Porteiro localiza visitante no dashboard
3. Clica em "Dar Baixa" no card do visitante
4. Sistema registra horário de saída
5. Prisma é liberado automaticamente
6. Dashboard atualiza estatísticas

### Fluxo de Relatórios
1. Usuário acessa aba "Relatórios"
2. Define filtros desejados (período, nome, etc.)
3. Clica em "Buscar"
4. Visualiza dados na tabela paginada
5. Exporta dados em CSV se necessário

### Fluxo de Configuração
1. Acessa aba "Configurações"
2. Ajusta números de vagas/prismas conforme necessário
3. Sistema ajusta prismas físicos automaticamente
4. Confirma alterações

---

## 📋 Casos de Uso Comuns

### Condomínio Residencial
- **Visitantes sociais**: amigos, familiares
- **Prestadores de serviços**: delivery, manutenção, limpeza
- **Profissionais**: médicos, professores particulares
- **Eventos**: festas, reuniões, obras

### Condomínio Comercial  
- **Clientes** de empresas inquilinas
- **Fornecedores** e representantes
- **Prestadores de serviços** especializados
- **Visitantes corporativos**

### Benefícios Operacionais
- **Redução** do tempo de cadastro de 5min para 30s
- **Eliminação** de papelada física
- **Rastreabilidade** completa de acessos
- **Relatórios** automáticos para síndico/administração
- **Controle** eficiente de recursos (vagas/prismas)

---

## 🎯 Diferenciais Competitivos

### Interface Moderna
- **Design system** inspirado em Linear/Notion
- **Componentes 3D** únicos (prismas)
- **Animações fluidas** e microinterações
- **Responsividade** nativa para todos os dispositivos

### Tecnologia de Ponta
- **Edge computing** para performance global
- **Serverless** para custo otimizado
- **TypeScript** para robustez de código
- **Real-time updates** automáticos

### Funcionalidades Avançadas
- **IA para reconhecimento** de placas
- **Autocompletar inteligente** baseado em histórico
- **Relatórios visuais** com gráficos interativos
- **Sistema de alertas** automático

### Facilidade de Uso
- **Zero treinamento** necessário
- **Interface intuitiva** para qualquer usuário
- **Workflows otimizados** para eficiência
- **Feedback visual** constante

---

## 🔮 Potencial de Expansão

### Funcionalidades Futuras Planejadas
- **Sistema de notificações** push/email
- **Integração** com câmeras de segurança
- **Dashboard analytics** para síndicos
- **App mobile** nativo
- **Integração** com sistemas de automação predial
- **Reconhecimento facial** opcional
- **APIs** para integrações terceiras

### Escalabilidade do Sistema
- **Multi-tenancy** para múltiplos condomínios
- **Personalização** de branding por cliente
- **Módulos opcionais** para diferentes necessidades
- **Integração** com ERPs de administradoras

---

## 📞 Suporte e Manutenção

### Monitoramento
- **Health checks** automáticos
- **Métricas** de performance em tempo real
- **Alertas** automáticos para problemas
- **Logs centralizados** para debugging

### Backup e Recuperação
- **Backup automático** do banco de dados
- **Versionamento** de esquemas
- **Recovery** automatizado
- **Teste regular** de backups

### Atualizações
- **Deploy zero-downtime** via Cloudflare
- **Rollback automático** em caso de problemas
- **Feature flags** para releases graduais
- **Versionamento semântico** do sistema

---

## 📊 Métricas e KPIs

### Métricas de Uso
- **Visitantes cadastrados** por período
- **Tempo médio** de permanência
- **Taxa de ocupação** de vagas
- **Utilização** de prismas
- **Horários de pico** de movimento

### Métricas Técnicas
- **Uptime** do sistema (objetivo: 99.9%)
- **Response time** médio (objetivo: <200ms)
- **Error rate** (objetivo: <0.1%)
- **User satisfaction** via feedback

### Métricas de Negócio
- **Redução** de tempo operacional
- **Economia** em recursos humanos
- **Melhoria** na experiência do visitante
- **Compliance** com normas de segurança

---

## 🏆 Conclusão

O **PortaCerta** representa uma solução completa e moderna para controle de visitantes, combinando tecnologia de ponta com design intuitivo e funcionalidades robustas. 

### Principais Benefícios
✅ **Eficiência operacional** drasticamente melhorada  
✅ **Experiência do usuário** excepcional  
✅ **Segurança** e controle aprimorados  
✅ **Relatórios** e analytics avançados  
✅ **Escalabilidade** para crescimento futuro  
✅ **Custo-benefício** otimizado  

### Por que Escolher o PortaCerta
- **Tecnologia moderna** que não fica obsoleta
- **Interface intuitiva** que reduz treinamento
- **Performance global** via edge computing
- **Customização** flexível para diferentes necessidades
- **Suporte técnico** especializado
- **Roadmap** de inovação contínua

O sistema está pronto para transformar a gestão de visitantes em qualquer condomínio, proporcionando uma experiência digital de primeira classe tanto para operadores quanto para visitantes.

---

*Este documento reflete o estado atual do sistema PortaCerta em outubro de 2025. Para informações atualizadas sobre novos recursos e funcionalidades, consulte o changelog do projeto.*
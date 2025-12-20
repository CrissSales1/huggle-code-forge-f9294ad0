# Prompt Completo - Sistema PortaCerta
## Sistema de Controle de Visitantes para Condomínios

### Descrição Geral
Desenvolva um sistema web completo para controle de visitantes em condomínios chamado **PortaCerta**. O sistema deve gerenciar a entrada e saída de visitantes, controlar prismas magnéticos para acesso, gerenciar vagas de estacionamento e fornecer relatórios detalhados.

### Stack Tecnológica
- **Frontend**: React 18 com TypeScript, Tailwind CSS, React Router, Vite
- **Backend**: Hono.js (framework web para Cloudflare Workers)
- **Banco de Dados**: Cloudflare D1 (SQLite)
- **Ícones**: Lucide React
- **Validação**: Zod
- **Hospedagem**: Cloudflare Workers + Pages

### Estrutura do Banco de Dados

#### Tabela: visitantes
```sql
CREATE TABLE visitantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  casa_visitada TEXT NOT NULL,
  placa_veiculo TEXT NOT NULL,
  numero_prisma INTEGER,
  estacionar_vaga_morador BOOLEAN DEFAULT 0,
  hora_entrada DATETIME NOT NULL,
  hora_saida DATETIME,
  is_ativo BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### Tabela: prismas_magneticos
```sql
CREATE TABLE prismas_magneticos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero INTEGER NOT NULL UNIQUE,
  is_em_uso BOOLEAN DEFAULT 0,
  visitante_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### Tabela: configuracoes_sistema
```sql
CREATE TABLE configuracoes_sistema (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  total_vagas_visitantes INTEGER NOT NULL DEFAULT 10,
  total_prismas_magneticos INTEGER NOT NULL DEFAULT 20,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Funcionalidades Principais

#### 1. Dashboard Principal
- **Estatísticas em tempo real**:
  - Vagas de visitantes disponíveis
  - Prismas magnéticos disponíveis
  - Total de visitantes ativos
- **Lista de visitantes ativos** com cards visuais contendo:
  - Nome do visitante
  - Casa visitada
  - Placa do veículo
  - Horário de entrada
  - Tempo de permanência
  - Número do prisma (destacado no canto superior direito)
  - Tipo de vaga (Vaga do Morador/Vaga de Visitante) com badges coloridos
  - Alerta para permanência > 24h
  - Botão "Dar Baixa" proeminente e visual

#### 2. Cadastro de Visitantes
- **Modal em duas etapas**:
  1. **Seleção do Prisma**: Grid visual com prismas disponíveis
  2. **Dados do Visitante**: 
     - Nome (com autocompletar baseado no banco)
     - Casa visitada
     - Placa do veículo (com autocompletar baseado no banco)
     - Checkbox para estacionar na vaga do morador

- **Autocompletar Inteligente**:
  - Ao digitar placa: se existir no banco, preenche nome e casa automaticamente
  - Ao digitar nome: se existir no banco, preenche placa e casa automaticamente

#### 3. Relatórios e Histórico
- **Filtros sempre visíveis** (sem botão mostrar/ocultar):
  - Data inicial e final
  - Nome do visitante
  - Casa visitada
  - Placa do veículo
- **Estatísticas do período**:
  - Total de visitas
  - Visitas finalizadas
  - Visitas ativas
  - Tempo médio de permanência
- **Tabela de resultados** com todas as informações do visitante
- **Funcionalidade de exportar** (botão presente mas implementação básica)

#### 4. Configurações do Sistema
- **Gestão de Recursos**:
  - Configurar total de vagas de visitantes
  - Configurar total de prismas magnéticos
  - Indicação visual de alterações pendentes
- **Gestão de Dados**:
  - Limpeza completa do banco de dados
  - Processo de confirmação em duas etapas
  - **Alerta de sucesso** após limpeza bem-sucedida (verde, desaparece em 5s)

### APIs/Endpoints do Backend

#### Dashboard
- `GET /api/dashboard/stats` - Estatísticas em tempo real
- `GET /api/visitantes/ativos` - Lista visitantes ativos com tempo de permanência

#### Visitantes
- `POST /api/visitantes` - Cadastrar novo visitante
- `PUT /api/visitantes/:id` - Editar dados do visitante
- `POST /api/visitantes/saida` - Registrar saída
- `GET /api/visitantes/buscar?termo=` - Buscar para autocompletar

#### Prismas
- `GET /api/prismas/disponiveis` - Prismas disponíveis

#### Relatórios
- `POST /api/relatorios` - Gerar relatório com filtros

#### Configurações
- `GET /api/configuracoes` - Obter configurações
- `PUT /api/configuracoes` - Atualizar configurações
- `DELETE /api/dados` - Limpar banco de dados

### Design e Interface

#### Paleta de Cores
- **Primária**: Azul (#2563eb)
- **Verde**: Para vagas disponíveis, visitantes finalizados (#16a34a)
- **Roxo**: Para total de visitantes (#9333ea)
- **Laranja**: Para alertas de permanência (#ea580c)
- **Vermelho**: Para ações de remoção (#dc2626)
- **Cinza**: Para textos secundários e bordas

#### Componentes Visuais
- **Cards com gradientes** e sombras sutis
- **Badges coloridos** para tipos de vaga
- **Ícones do Lucide React** para todos os elementos
- **Botões com hover states** e transições suaves
- **Modals** com backdrop blur
- **Loading states** com spinners animados

#### Layout Responsivo
- **Desktop**: Layout completo com grids e múltiplas colunas
- **Tablet**: Ajustes de grid para 2 colunas
- **Mobile**: 
  - Layout empilhado
  - Scroll horizontal para tabelas
  - Botões reorganizados
  - Grids adaptáveis
  - Header compacto
  - Navegação com scroll horizontal

### Regras de Negócio

#### Controle de Prismas
- Cada visitante recebe um prisma magnético único
- Prismas são liberados automaticamente na saída
- Verificação de disponibilidade antes do cadastro

#### Controle de Vagas
- Diferenciação entre vagas de visitante e vaga do morador
- Visitantes em vaga do morador não ocupam cota de vagas de visitante
- Cálculo dinâmico de vagas disponíveis

#### Permanência
- Cálculo automático do tempo de permanência
- Alerta visual para permanência > 24 horas
- Formatação legível (Ex: 2h30min, 45min)

#### Validações
- Todos os campos obrigatórios validados
- Placas em formato uppercase
- Verificação de prisma disponível antes do cadastro
- Validação de dados com Zod

### Navegação e Estrutura

#### Páginas Principais
1. **Dashboard** (`/`) - Visão geral e visitantes ativos
2. **Cadastro** (`/cadastro`) - Modal de cadastro em página dedicada
3. **Relatórios** (`/relatorios`) - Histórico e análises
4. **Configurações** (`/configuracoes`) - Configurações do sistema

#### Header
- Logo do sistema "PortaCerta"
- Data e hora atual em tempo real
- Design limpo e profissional

#### Navegação
- Ícones intuitivos para cada seção
- Estado ativo visual
- Responsiva com scroll horizontal no mobile

### Estados e Interações

#### Loading States
- Spinners durante carregamento de dados
- Estados de loading específicos para cada ação
- Feedback visual em todas as operações

#### Error Handling
- Mensagens de erro claras e úteis
- Tratamento de erros de rede
- Validação em tempo real de formulários

#### Success States
- Feedback visual para ações bem-sucedidas
- Redirecionamentos após cadastros
- Atualizações automáticas de listas

### Implementação Técnica

#### Hooks Customizados
- `useApi.ts` - Gerenciamento de todas as chamadas API
- `useDateTime.ts` - Formatação de data/hora
- Estados globais compartilhados

#### Componentização
- Componentes reutilizáveis em `src/react-app/components/`
- Páginas como controllers em `src/react-app/pages/`
- Hooks organizados em `src/react-app/hooks/`

#### Tipos TypeScript
- Validação com Zod
- Types compartilhados entre frontend e backend
- Interface definitions completas

### Inicialização do Sistema
1. Criar tabelas do banco de dados
2. Inserir configuração padrão (10 vagas, 20 prismas)
3. Popular prismas magnéticos numerados de 1 a N
4. Configurar Workers e domínio

### Performance e UX
- Atualizações automáticas a cada 30 segundos no dashboard
- Debounce nos campos de autocompletar
- Lazy loading onde apropriado
- Transições suaves entre estados
- Cache de dados quando possível

### Acessibilidade
- Labels adequados em todos os formulários
- Contraste adequado de cores
- Navegação por teclado
- Estados focáveis bem definidos
- Textos alternativos para elementos visuais

---

## Instruções para Implementação

1. **Configure o ambiente** com Cloudflare Workers + D1
2. **Implemente o backend** com todos os endpoints listados
3. **Crie o banco de dados** com as tabelas especificadas
4. **Desenvolva o frontend** seguindo a estrutura de componentes
5. **Implemente a responsividade** conforme especificado
6. **Teste todas as funcionalidades** em diferentes dispositivos
7. **Configure o deploy** no Cloudflare

Este prompt deve ser suficiente para recriar o sistema PortaCerta completo com todas as suas funcionalidades e características visuais.

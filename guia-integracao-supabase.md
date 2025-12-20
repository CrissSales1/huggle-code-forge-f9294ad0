# Guia Completo: PortaCerta Local + Supabase

## Visão Geral
Este guia fornece um passo a passo completo para baixar o código fonte do sistema PortaCerta e adaptá-lo para rodar localmente com banco de dados Supabase (PostgreSQL).

## 📋 Pré-requisitos

- Node.js 18+ instalado
- npm ou yarn
- Conta no Supabase (gratuita)
- Git instalado
- Editor de código (VS Code recomendado)

## 🔽 Passo 1: Download do Código Fonte

### 1.1 Exportar do Mocha (se disponível)
Se você tem acesso ao painel Mocha:
1. Acesse o painel do projeto
2. Procure por opção "Export" ou "Download Source"
3. Baixe o arquivo ZIP com o código fonte

### 1.2 Recriar Estrutura Manualmente
Caso não tenha acesso direto, recrie a estrutura:

```bash
mkdir portacerta-local
cd portacerta-local
npm init -y
```

Copie todos os arquivos do sistema atual para esta pasta, mantendo a estrutura:
```
portacerta-local/
├── src/
│   ├── react-app/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   └── ...
│   ├── shared/
│   └── worker/ (será removido)
├── package.json
├── index.html
└── ...
```

## 🗄️ Passo 2: Configuração do Supabase

### 2.1 Criar Projeto no Supabase
1. Acesse [supabase.com](https://supabase.com)
2. Faça login/cadastro
3. Clique em "New Project"
4. Configure:
   - Nome: `portacerta-db`
   - Região: escolha a mais próxima
   - Senha do banco: crie uma senha forte
5. Aguarde a criação (2-3 minutos)

### 2.2 Obter Credenciais
No painel do projeto Supabase:
1. Vá em **Settings > API**
2. Anote:
   - `Project URL`
   - `anon/public` API Key
   - `service_role` API Key (secret)
3. Vá em **Settings > Database**
4. Anote a `Connection String`

## 🔧 Passo 3: Adaptação do Código

### 3.1 Atualizar package.json
```json
{
  "name": "portacerta-local",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "db:migrate": "node scripts/migrate.js"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0",
    "hono": "^4.0.0",
    "lucide-react": "^0.510.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router": "^7.5.3",
    "zod": "^3.24.3"
  },
  "devDependencies": {
    "@types/node": "^22.14.1",
    "@types/react": "^19.0.10",
    "@types/react-dom": "^19.0.4",
    "@vitejs/plugin-react": "^4.4.1",
    "autoprefixer": "^10.4.21",
    "postcss": "^8.5.3",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.8.3",
    "vite": "^7.1.3"
  }
}
```

### 3.2 Instalar Dependências
```bash
npm install
```

### 3.3 Configurar Variáveis de Ambiente
Crie `.env.local`:
```env
VITE_SUPABASE_URL=sua_project_url_aqui
VITE_SUPABASE_ANON_KEY=sua_anon_key_aqui
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key_aqui
```

## 🗃️ Passo 4: Migração do Banco de Dados

### 4.1 Criar Script de Migração
Crie `scripts/migrate.js`:
```javascript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function migrate() {
  console.log('🚀 Iniciando migração...')

  // 1. Criar tabela de visitantes
  const { error: visitantesError } = await supabase.rpc('execute_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS visitantes (
        id BIGSERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        casa_visitada TEXT NOT NULL,
        placa_veiculo TEXT NOT NULL,
        numero_prisma INTEGER,
        estacionar_vaga_morador BOOLEAN DEFAULT FALSE,
        observacoes TEXT,
        liberado_por TEXT,
        hora_entrada TIMESTAMPTZ NOT NULL,
        hora_saida TIMESTAMPTZ,
        is_ativo BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `
  })

  // 2. Criar tabela de prismas magnéticos
  const { error: prismasError } = await supabase.rpc('execute_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS prismas_magneticos (
        id BIGSERIAL PRIMARY KEY,
        numero INTEGER NOT NULL UNIQUE,
        is_em_uso BOOLEAN DEFAULT FALSE,
        visitante_id BIGINT REFERENCES visitantes(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `
  })

  // 3. Criar tabela de configurações
  const { error: configError } = await supabase.rpc('execute_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS configuracoes_sistema (
        id BIGSERIAL PRIMARY KEY,
        total_vagas_visitantes INTEGER NOT NULL DEFAULT 10,
        total_prismas_magneticos INTEGER NOT NULL DEFAULT 20,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `
  })

  // 4. Inserir configuração padrão
  const { error: insertConfigError } = await supabase
    .from('configuracoes_sistema')
    .insert({
      total_vagas_visitantes: 10,
      total_prismas_magneticos: 20
    })

  // 5. Inserir prismas magnéticos (1 a 20)
  const prismas = Array.from({ length: 20 }, (_, i) => ({
    numero: i + 1,
    is_em_uso: false
  }))

  const { error: insertPrismasError } = await supabase
    .from('prismas_magneticos')
    .insert(prismas)

  console.log('✅ Migração concluída!')
}

migrate().catch(console.error)
```

### 4.2 Executar Migração
```bash
npm run db:migrate
```

## 🔄 Passo 5: Adaptação do Backend

### 5.1 Criar Cliente Supabase
Crie `src/lib/supabase.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

// Cliente para operações administrativas (server-side)
export const supabaseAdmin = createClient(
  supabaseUrl,
  import.meta.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey
)
```

### 5.2 Substituir Backend Hono
Remova a pasta `src/worker` e crie `src/api/index.ts`:
```typescript
import { supabase } from '../lib/supabase'
import type {
  DashboardStats,
  VisitanteAtivo,
  VisitanteType,
  CadastroVisitanteType,
  // ... outros tipos
} from '../shared/types'

export class PortaCertaAPI {
  
  // Dashboard Stats
  async getDashboardStats(): Promise<DashboardStats> {
    // Obter configurações
    const { data: config } = await supabase
      .from('configuracoes_sistema')
      .select('*')
      .single()

    if (!config) throw new Error('Configurações não encontradas')

    // Contar visitantes ocupando vagas
    const { count: visitantesOcupandoVagas } = await supabase
      .from('visitantes')
      .select('*', { count: 'exact', head: true })
      .eq('is_ativo', true)
      .eq('estacionar_vaga_morador', false)

    // Contar prismas em uso
    const { count: prismasEmUso } = await supabase
      .from('prismas_magneticos')
      .select('*', { count: 'exact', head: true })
      .eq('is_em_uso', true)

    // Contar total de visitantes ativos
    const { count: totalVisitantesAtivos } = await supabase
      .from('visitantes')
      .select('*', { count: 'exact', head: true })
      .eq('is_ativo', true)

    return {
      vagas_visitantes_disponiveis: config.total_vagas_visitantes - (visitantesOcupandoVagas || 0),
      prismas_magneticos_disponiveis: config.total_prismas_magneticos - (prismasEmUso || 0),
      total_visitantes_ativos: totalVisitantesAtivos || 0
    }
  }

  // Visitantes Ativos
  async getVisitantesAtivos(): Promise<VisitanteAtivo[]> {
    const { data: visitantes } = await supabase
      .from('visitantes')
      .select(`
        *,
        prismas_magneticos!inner(numero)
      `)
      .eq('is_ativo', true)
      .order('hora_entrada', { ascending: false })

    return visitantes?.map(visitante => {
      const horaEntrada = new Date(visitante.hora_entrada)
      const agora = new Date()
      const tempoPermanenciaMs = agora.getTime() - horaEntrada.getTime()
      const tempoPermanenciaHoras = tempoPermanenciaMs / (1000 * 60 * 60)

      return {
        ...visitante,
        numero_prisma: visitante.prismas_magneticos?.[0]?.numero,
        tempo_permanencia_horas: tempoPermanenciaHoras,
        alerta_permanencia_prolongada: tempoPermanenciaHoras > 24
      }
    }) || []
  }

  // Prismas Disponíveis
  async getPrismasDisponiveis() {
    const { data } = await supabase
      .from('prismas_magneticos')
      .select('*')
      .eq('is_em_uso', false)
      .order('numero')

    return data || []
  }

  // Cadastrar Visitante
  async cadastrarVisitante(dados: CadastroVisitanteType) {
    // Verificar se prisma está disponível
    const { data: prisma } = await supabase
      .from('prismas_magneticos')
      .select('*')
      .eq('numero', dados.numero_prisma)
      .eq('is_em_uso', false)
      .single()

    if (!prisma) throw new Error('Prisma não disponível')

    // Inserir visitante
    const { data: visitante, error } = await supabase
      .from('visitantes')
      .insert({
        nome: dados.nome,
        casa_visitada: dados.casa_visitada,
        placa_veiculo: dados.placa_veiculo,
        estacionar_vaga_morador: dados.estacionar_vaga_morador,
        observacoes: dados.observacoes,
        liberado_por: dados.liberado_por,
        hora_entrada: new Date().toISOString()
      })
      .select()
      .single()

    if (error) throw error

    // Marcar prisma como em uso
    await supabase
      .from('prismas_magneticos')
      .update({
        is_em_uso: true,
        visitante_id: visitante.id
      })
      .eq('numero', dados.numero_prisma)

    return visitante
  }

  // ... implementar outros métodos conforme necessário
}

export const api = new PortaCertaAPI()
```

### 5.3 Atualizar Hook useApi
Modifique `src/react-app/hooks/useApi.ts`:
```typescript
import { useState, useEffect, useCallback } from 'react'
import { api } from '../../api'
// ... imports dos tipos

// Substituir todas as chamadas fetch() por chamadas para a classe API
export function useDashboardStats() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await api.getDashboardStats()
      setStats(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [fetchStats])

  return { stats, loading, error, refetch: fetchStats }
}

// ... atualizar outros hooks da mesma forma
```

## ⚙️ Passo 6: Configuração do Vite

### 6.1 Atualizar vite.config.ts
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 3000,
    host: true
  }
})
```

## 🚀 Passo 7: Executar Localmente

### 7.1 Comandos de Execução
```bash
# Instalar dependências
npm install

# Executar migrações do banco
npm run db:migrate

# Iniciar servidor de desenvolvimento
npm run dev
```

### 7.2 Acessar Aplicação
Abra o navegador em: `http://localhost:3000`

## 🔧 Passo 8: Configurações Adicionais

### 8.1 Configurar RLS (Row Level Security) no Supabase
No painel Supabase, vá em **Authentication > Policies** e configure:

```sql
-- Permitir leitura para todos
CREATE POLICY "Allow read access" ON visitantes FOR SELECT USING (true);
CREATE POLICY "Allow read access" ON prismas_magneticos FOR SELECT USING (true);
CREATE POLICY "Allow read access" ON configuracoes_sistema FOR SELECT USING (true);

-- Permitir escrita para todos (ajustar conforme necessário)
CREATE POLICY "Allow insert access" ON visitantes FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update access" ON visitantes FOR UPDATE USING (true);
```

### 8.2 Habilitar Realtime (opcional)
Para updates em tempo real:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE visitantes;
ALTER PUBLICATION supabase_realtime ADD TABLE prismas_magneticos;
```

## 📁 Estrutura Final do Projeto

```
portacerta-local/
├── src/
│   ├── api/
│   │   └── index.ts
│   ├── lib/
│   │   └── supabase.ts
│   ├── react-app/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   └── ...
│   └── shared/
│       └── types.ts
├── scripts/
│   └── migrate.js
├── .env.local
├── package.json
├── vite.config.ts
└── ...
```

## 🛠️ Solução de Problemas

### Erro de CORS
Se encontrar problemas de CORS, configure no Supabase:
1. Vá em **Settings > API**
2. Em "CORS Origins" adicione: `http://localhost:3000`

### Erro de Conexão com Banco
Verifique se:
- As URLs estão corretas no `.env.local`
- O projeto Supabase está ativo
- As credenciais estão corretas

### Erro de Tipos TypeScript
Execute:
```bash
npm install --save-dev @types/node
```

## 📚 Recursos Adicionais

- [Documentação Supabase](https://supabase.com/docs)
- [Guia React + Supabase](https://supabase.com/docs/guides/getting-started/tutorials/with-react)
- [API Reference Supabase](https://supabase.com/docs/reference/javascript/introduction)

## 🎯 Próximos Passos

1. **Autenticação**: Implementar login/registro usando Supabase Auth
2. **Deploy**: Configurar deploy no Vercel/Netlify
3. **Backup**: Configurar backup automático do banco
4. **Monitoramento**: Adicionar logs e métricas

---

Com este guia, você terá o sistema PortaCerta rodando localmente com banco Supabase totalmente funcional. Qualquer dúvida, consulte a documentação oficial do Supabase ou entre em contato.

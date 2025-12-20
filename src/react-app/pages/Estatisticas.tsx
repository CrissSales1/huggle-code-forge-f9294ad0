import { useState } from 'react';
import { Calendar, TrendingUp, Clock, Users, BarChart3, PieChart, Activity, AlertTriangle } from 'lucide-react';
import { useEstatisticas } from '@/react-app/hooks/useApi';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Cell,
  Pie,
  Area,
  AreaChart,
} from 'recharts';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#84CC16', '#F97316'];

export default function Estatisticas() {
  const [periodo, setPeriodo] = useState<'7' | '30' | '90'>('30');
  const { estatisticas, loading, error } = useEstatisticas(periodo);

  if (loading) {
    return (
      <div className="container mx-auto px-4 lg:px-6 py-4 lg:py-8">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-500">Carregando estatísticas...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 lg:px-6 py-4 lg:py-8">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      </div>
    );
  }

  if (!estatisticas) return null;

  return (
    <div className="container mx-auto px-4 lg:px-6 py-4 lg:py-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Estatísticas</h1>
          <p className="text-gray-600 mt-1">Análise detalhada dos dados de visitantes</p>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => setPeriodo('7')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              periodo === '7' 
                ? 'bg-blue-600 text-white' 
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            7 dias
          </button>
          <button
            onClick={() => setPeriodo('30')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              periodo === '30' 
                ? 'bg-blue-600 text-white' 
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            30 dias
          </button>
          <button
            onClick={() => setPeriodo('90')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              periodo === '90' 
                ? 'bg-blue-600 text-white' 
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            90 dias
          </button>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-8">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-700 opacity-75">Total de Visitantes</p>
              <p className="text-3xl font-bold text-blue-900 mt-2">{estatisticas.totalVisitantes}</p>
              <p className="text-xs text-blue-600 mt-1">Últimos {periodo} dias</p>
            </div>
            <div className="p-3 rounded-lg bg-blue-100 text-blue-600">
              <Users className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-700 opacity-75">Média por Dia</p>
              <p className="text-3xl font-bold text-green-900 mt-2">{estatisticas.mediaPorDia}</p>
              <p className="text-xs text-green-600 mt-1">visitantes/dia</p>
            </div>
            <div className="p-3 rounded-lg bg-green-100 text-green-600">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-purple-700 opacity-75">Tempo Médio</p>
              <p className="text-3xl font-bold text-purple-900 mt-2">{estatisticas.tempoMedioPermanencia}</p>
              <p className="text-xs text-purple-600 mt-1">de permanência</p>
            </div>
            <div className="p-3 rounded-lg bg-purple-100 text-purple-600">
              <Clock className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-orange-700 opacity-75">Taxa Ocupação</p>
              <p className="text-3xl font-bold text-orange-900 mt-2">{estatisticas.taxaOcupacaoMedia}%</p>
              <p className="text-xs text-orange-600 mt-1">média no período</p>
            </div>
            <div className="p-3 rounded-lg bg-orange-100 text-orange-600">
              <Activity className="w-6 h-6" />
            </div>
          </div>
        </div>
      </div>

      {/* Grid Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Visitantes por Dia */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center space-x-2 mb-6">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">Visitantes por Dia</h2>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={estatisticas.visitantesPorDia}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="data" 
                stroke="#6b7280"
                fontSize={12}
                tickFormatter={(value) => new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
              />
              <YAxis stroke="#6b7280" fontSize={12} />
              <Tooltip 
                labelFormatter={(value) => new Date(value).toLocaleDateString('pt-BR')}
                formatter={(value: any) => [value, 'Visitantes']}
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
              />
              <Area type="monotone" dataKey="visitantes" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.1} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Horários de Pico */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center space-x-2 mb-6">
            <Clock className="w-5 h-5 text-green-600" />
            <h2 className="text-xl font-semibold text-gray-900">Horários de Maior Movimento</h2>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={estatisticas.horariosPico}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="hora" 
                stroke="#6b7280"
                fontSize={12}
                tickFormatter={(value) => `${value}h`}
              />
              <YAxis stroke="#6b7280" fontSize={12} />
              <Tooltip 
                formatter={(value: any) => [value, 'Visitantes']}
                labelFormatter={(value) => `${value}:00`}
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
              />
              <Bar dataKey="visitantes" fill="#10B981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Segunda linha de gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Distribuição de Tempo de Permanência */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center space-x-2 mb-6">
            <PieChart className="w-5 h-5 text-purple-600" />
            <h2 className="text-xl font-semibold text-gray-900">Tempo de Permanência</h2>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <RechartsPieChart>
              <Pie
                data={estatisticas.distribuicaoTempo}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }: any) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="quantidade"
              >
                {estatisticas.distribuicaoTempo.map((_entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value: any) => [value, 'Visitantes']}
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
              />
            </RechartsPieChart>
          </ResponsiveContainer>
        </div>

        {/* Visitantes por Dia da Semana */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center space-x-2 mb-6">
            <Calendar className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">Visitantes por Dia da Semana</h2>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={estatisticas.visitantesPorDiaSemana}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="dia" stroke="#6b7280" fontSize={12} />
              <YAxis stroke="#6b7280" fontSize={12} />
              <Tooltip 
                formatter={(value: any) => [value, 'Visitantes']}
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
              />
              <Bar dataKey="visitantes" fill="#3B82F6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Terceira linha - Tabelas e listas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Visitantes Recorrentes */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center space-x-2 mb-6">
            <Users className="w-5 h-5 text-green-600" />
            <h2 className="text-xl font-semibold text-gray-900">Top Visitantes Recorrentes</h2>
          </div>
          <div className="space-y-4">
            {estatisticas.visitantesRecorrentes.map((visitante: any, index: number) => (
              <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{visitante.nome}</p>
                  <p className="text-sm text-gray-500">{visitante.casa_visitada}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg text-blue-600">{visitante.total_visitas}</p>
                  <p className="text-xs text-gray-500">visitas</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Maior Tempo de Permanência */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center space-x-2 mb-6">
            <Clock className="w-5 h-5 text-orange-600" />
            <h2 className="text-xl font-semibold text-gray-900">Maior Tempo de Permanência</h2>
          </div>
          <div className="space-y-4">
            {estatisticas.maiorTempoPermanencia.map((visitante: any, index: number) => (
              <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{visitante.nome}</p>
                  <p className="text-sm text-gray-500">
                    Casa {visitante.casa_visitada} • {new Date(visitante.hora_entrada).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg text-orange-600">{visitante.tempo_permanencia}</p>
                  <p className="text-xs text-gray-500">permanência</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Alertas */}
      {estatisticas.alertas && estatisticas.alertas.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center space-x-2 mb-6">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <h2 className="text-xl font-semibold text-gray-900">Alertas e Anomalias</h2>
          </div>
          <div className="space-y-4">
            {estatisticas.alertas.map((alerta: any, index: number) => (
              <div key={index} className="flex items-start space-x-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-red-900">{alerta.titulo}</p>
                  <p className="text-sm text-red-700 mt-1">{alerta.descricao}</p>
                  {alerta.detalhes && (
                    <p className="text-xs text-red-600 mt-2">{alerta.detalhes}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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
    <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6 lg:mb-8">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">Estatísticas</h1>
          <p className="text-gray-600 mt-0.5 sm:mt-1 text-xs sm:text-sm lg:text-base">Análise detalhada dos dados de visitantes</p>
        </div>
        
        <div className="flex gap-1 sm:gap-2">
          <button
            onClick={() => setPeriodo('7')}
            className={`px-2.5 sm:px-3 lg:px-4 py-1.5 sm:py-2 rounded-lg font-medium transition-colors text-xs sm:text-sm ${
              periodo === '7' 
                ? 'bg-blue-600 text-white' 
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            7d
          </button>
          <button
            onClick={() => setPeriodo('30')}
            className={`px-2.5 sm:px-3 lg:px-4 py-1.5 sm:py-2 rounded-lg font-medium transition-colors text-xs sm:text-sm ${
              periodo === '30' 
                ? 'bg-blue-600 text-white' 
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            30d
          </button>
          <button
            onClick={() => setPeriodo('90')}
            className={`px-2.5 sm:px-3 lg:px-4 py-1.5 sm:py-2 rounded-lg font-medium transition-colors text-xs sm:text-sm ${
              periodo === '90' 
                ? 'bg-blue-600 text-white' 
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            90d
          </button>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4 mb-4 sm:mb-6 lg:mb-8">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg sm:rounded-xl p-3 sm:p-4 lg:p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] sm:text-xs lg:text-sm font-medium text-blue-700 opacity-75 truncate">Total Visitantes</p>
              <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-blue-900 mt-1 sm:mt-2">{estatisticas.totalVisitantes}</p>
              <p className="text-[10px] sm:text-xs text-blue-600 mt-0.5 sm:mt-1">Últimos {periodo}d</p>
            </div>
            <div className="p-1.5 sm:p-2 lg:p-3 rounded-lg bg-blue-100 text-blue-600 flex-shrink-0">
              <Users className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg sm:rounded-xl p-3 sm:p-4 lg:p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] sm:text-xs lg:text-sm font-medium text-green-700 opacity-75 truncate">Média/Dia</p>
              <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-green-900 mt-1 sm:mt-2">{estatisticas.mediaPorDia}</p>
              <p className="text-[10px] sm:text-xs text-green-600 mt-0.5 sm:mt-1">visitantes</p>
            </div>
            <div className="p-1.5 sm:p-2 lg:p-3 rounded-lg bg-green-100 text-green-600 flex-shrink-0">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-lg sm:rounded-xl p-3 sm:p-4 lg:p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] sm:text-xs lg:text-sm font-medium text-purple-700 opacity-75 truncate">Tempo Médio</p>
              <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-purple-900 mt-1 sm:mt-2">{estatisticas.tempoMedioPermanencia}</p>
              <p className="text-[10px] sm:text-xs text-purple-600 mt-0.5 sm:mt-1">permanência</p>
            </div>
            <div className="p-1.5 sm:p-2 lg:p-3 rounded-lg bg-purple-100 text-purple-600 flex-shrink-0">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-lg sm:rounded-xl p-3 sm:p-4 lg:p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] sm:text-xs lg:text-sm font-medium text-orange-700 opacity-75 truncate">Taxa Ocupação</p>
              <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-orange-900 mt-1 sm:mt-2">{estatisticas.taxaOcupacaoMedia}%</p>
              <p className="text-[10px] sm:text-xs text-orange-600 mt-0.5 sm:mt-1">média</p>
            </div>
            <div className="p-1.5 sm:p-2 lg:p-3 rounded-lg bg-orange-100 text-orange-600 flex-shrink-0">
              <Activity className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6" />
            </div>
          </div>
        </div>
      </div>

      {/* Grid Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6 mb-4 sm:mb-6 lg:mb-8">
        {/* Visitantes por Dia */}
        <div className="bg-white rounded-lg sm:rounded-xl border border-gray-200 p-3 sm:p-4 lg:p-6 shadow-sm">
          <div className="flex items-center space-x-2 mb-3 sm:mb-4 lg:mb-6">
            <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
            <h2 className="text-sm sm:text-base lg:text-xl font-semibold text-gray-900">Visitantes por Dia</h2>
          </div>
          <ResponsiveContainer width="100%" height={200} className="sm:!h-[250px] lg:!h-[300px]">
            <AreaChart data={estatisticas.visitantesPorDia}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="data" 
                stroke="#6b7280"
                fontSize={10}
                tickFormatter={(value) => new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
              />
              <YAxis stroke="#6b7280" fontSize={10} width={30} />
              <Tooltip 
                labelFormatter={(value) => new Date(value).toLocaleDateString('pt-BR')}
                formatter={(value: any) => [value, 'Visitantes']}
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  fontSize: '12px'
                }}
              />
              <Area type="monotone" dataKey="visitantes" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.1} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Horários de Pico */}
        <div className="bg-white rounded-lg sm:rounded-xl border border-gray-200 p-3 sm:p-4 lg:p-6 shadow-sm">
          <div className="flex items-center space-x-2 mb-3 sm:mb-4 lg:mb-6">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
            <h2 className="text-sm sm:text-base lg:text-xl font-semibold text-gray-900">Horários de Pico</h2>
          </div>
          <ResponsiveContainer width="100%" height={200} className="sm:!h-[250px] lg:!h-[300px]">
            <BarChart data={estatisticas.horariosPico}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="hora" 
                stroke="#6b7280"
                fontSize={10}
                tickFormatter={(value) => `${value}h`}
              />
              <YAxis stroke="#6b7280" fontSize={10} width={30} />
              <Tooltip 
                formatter={(value: any) => [value, 'Visitantes']}
                labelFormatter={(value) => `${value}:00`}
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  fontSize: '12px'
                }}
              />
              <Bar dataKey="visitantes" fill="#10B981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Segunda linha de gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6 mb-4 sm:mb-6 lg:mb-8">
        {/* Distribuição de Tempo de Permanência */}
        <div className="bg-white rounded-lg sm:rounded-xl border border-gray-200 p-3 sm:p-4 lg:p-6 shadow-sm">
          <div className="flex items-center space-x-2 mb-3 sm:mb-4 lg:mb-6">
            <PieChart className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
            <h2 className="text-sm sm:text-base lg:text-xl font-semibold text-gray-900">Tempo de Permanência</h2>
          </div>
          <ResponsiveContainer width="100%" height={200} className="sm:!h-[250px] lg:!h-[300px]">
            <RechartsPieChart>
              <Pie
                data={estatisticas.distribuicaoTempo}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }: any) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={60}
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
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  fontSize: '12px'
                }}
              />
            </RechartsPieChart>
          </ResponsiveContainer>
        </div>

        {/* Visitantes por Dia da Semana */}
        <div className="bg-white rounded-lg sm:rounded-xl border border-gray-200 p-3 sm:p-4 lg:p-6 shadow-sm">
          <div className="flex items-center space-x-2 mb-3 sm:mb-4 lg:mb-6">
            <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
            <h2 className="text-sm sm:text-base lg:text-xl font-semibold text-gray-900">Por Dia da Semana</h2>
          </div>
          <ResponsiveContainer width="100%" height={200} className="sm:!h-[250px] lg:!h-[300px]">
            <BarChart data={estatisticas.visitantesPorDiaSemana}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="dia" stroke="#6b7280" fontSize={10} />
              <YAxis stroke="#6b7280" fontSize={10} width={30} />
              <Tooltip 
                formatter={(value: any) => [value, 'Visitantes']}
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  fontSize: '12px'
                }}
              />
              <Bar dataKey="visitantes" fill="#3B82F6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Terceira linha - Tabelas e listas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6 mb-4 sm:mb-6 lg:mb-8">
        {/* Visitantes Recorrentes */}
        <div className="bg-white rounded-lg sm:rounded-xl border border-gray-200 p-3 sm:p-4 lg:p-6 shadow-sm">
          <div className="flex items-center space-x-2 mb-3 sm:mb-4 lg:mb-6">
            <Users className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
            <h2 className="text-sm sm:text-base lg:text-xl font-semibold text-gray-900">Visitantes Recorrentes</h2>
          </div>
          <div className="space-y-2 sm:space-y-3 lg:space-y-4 max-h-[250px] sm:max-h-[300px] overflow-y-auto">
            {estatisticas.visitantesRecorrentes.map((visitante: any, index: number) => (
              <div key={index} className="flex items-center justify-between p-2 sm:p-3 lg:p-4 bg-gray-50 rounded-lg">
                <div className="min-w-0 flex-1 mr-2">
                  <p className="font-medium text-gray-900 text-xs sm:text-sm lg:text-base truncate">{visitante.nome}</p>
                  <p className="text-[10px] sm:text-xs lg:text-sm text-gray-500 truncate">{visitante.casa_visitada}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-sm sm:text-base lg:text-lg text-blue-600">{visitante.total_visitas}</p>
                  <p className="text-[10px] sm:text-xs text-gray-500">visitas</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Maior Tempo de Permanência */}
        <div className="bg-white rounded-lg sm:rounded-xl border border-gray-200 p-3 sm:p-4 lg:p-6 shadow-sm">
          <div className="flex items-center space-x-2 mb-3 sm:mb-4 lg:mb-6">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600" />
            <h2 className="text-sm sm:text-base lg:text-xl font-semibold text-gray-900">Maior Permanência</h2>
          </div>
          <div className="space-y-2 sm:space-y-3 lg:space-y-4 max-h-[250px] sm:max-h-[300px] overflow-y-auto">
            {estatisticas.maiorTempoPermanencia.map((visitante: any, index: number) => (
              <div key={index} className="flex items-center justify-between p-2 sm:p-3 lg:p-4 bg-gray-50 rounded-lg">
                <div className="min-w-0 flex-1 mr-2">
                  <p className="font-medium text-gray-900 text-xs sm:text-sm lg:text-base truncate">{visitante.nome}</p>
                  <p className="text-[10px] sm:text-xs lg:text-sm text-gray-500 truncate">
                    Casa {visitante.casa_visitada} • {new Date(visitante.hora_entrada).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-sm sm:text-base lg:text-lg text-orange-600">{visitante.tempo_permanencia}</p>
                  <p className="text-[10px] sm:text-xs text-gray-500">permanência</p>
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

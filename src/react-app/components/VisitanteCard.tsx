import { AlertTriangle, Edit, LogOut, Car, Home, Clock, FileText, User } from 'lucide-react';
import PlacaVeiculo from './PlacaVeiculo';
import { useLiveTimer } from '@/react-app/hooks/useLiveTimer';
import type { VisitanteAtivo } from '@/shared/types';

interface VisitanteCardProps {
  visitante: VisitanteAtivo;
  onEdit: (visitante: VisitanteAtivo) => void;
  onRegistrarSaida: (id: number) => void;
  loading?: boolean;
}

export default function VisitanteCard({ visitante, onEdit, onRegistrarSaida, loading }: VisitanteCardProps) {
  // Hook para cronômetro em tempo real
  const tempoPermanenciaHoras = useLiveTimer(visitante.hora_entrada!);
  const alertaPermanenciaProlongada = tempoPermanenciaHoras > 24;

  const formatarHora = (hora: string) => {
    return new Date(hora).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatarTempoPermanencia = (horas: number) => {
    if (horas < 1) {
      return `${Math.floor(horas * 60)}min`;
    }
    return `${Math.floor(horas)}h${Math.floor((horas % 1) * 60)}min`;
  };

  const tipoVaga = visitante.estacionar_vaga_morador ? 'morador' : 'visitante';

  return (
    <div className={`relative bg-white rounded-xl border-2 shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden group flex flex-col h-full ${
      alertaPermanenciaProlongada 
        ? 'border-amber-400 bg-gradient-to-br from-amber-50 to-white' 
        : 'border-gray-200 hover:border-blue-300'
    }`}>
      
      {/* Header com gradiente e prisma */}
      <div className={`relative p-2 sm:p-3 lg:p-4 bg-gradient-to-r flex-shrink-0 ${
        alertaPermanenciaProlongada 
          ? 'from-amber-500 to-orange-600' 
          : 'from-blue-600 to-blue-700'
      }`}>
        {/* Prisma Estilizado */}
        <div className="absolute top-1 right-1 sm:top-2 sm:right-2">
          <div className="relative">
            {/* Prisma 3D em laranja */}
            <div className="relative w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12">
              {/* Face frontal do prisma */}
              <div className="absolute inset-0 bg-gradient-to-br from-orange-400 to-orange-600 rounded-lg transform perspective-1000 shadow-lg border border-orange-500">
                {/* Face lateral direita (efeito 3D) */}
                <div className="absolute top-0 right-0 w-2 h-full bg-gradient-to-b from-orange-500 to-orange-700 transform skew-y-12 origin-top-right rounded-r-lg"></div>
                {/* Face superior (efeito 3D) */}
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-orange-300 to-orange-500 transform skew-x-12 origin-top-left rounded-t-lg"></div>
                
                {/* Número do prisma centralizado */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-black text-white text-sm sm:text-base lg:text-lg drop-shadow-lg tracking-tight" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                    {visitante.numero_prisma || '?'}
                  </span>
                </div>
                
                {/* Brilho/highlight no prisma */}
                <div className="absolute top-1 left-1 w-3 h-3 bg-white opacity-30 rounded-full blur-sm"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Nome */}
        <div className="pr-8 sm:pr-10 lg:pr-12">
          {/* Rótulo do nome */}
          <p className="text-white text-[0.6rem] sm:text-xs opacity-80 font-medium mb-0.5 sm:mb-1 uppercase tracking-wide">
            Nome do Visitante
          </p>
          
          <h3 className="text-white font-bold text-xs sm:text-sm lg:text-base leading-tight mb-1 sm:mb-1.5 truncate" title={visitante.nome}>
            {visitante.nome}
          </h3>
          
          {/* Alerta de permanência */}
          {alertaPermanenciaProlongada && (
            <div className="flex items-center space-x-0.5 sm:space-x-1 bg-red-500 bg-opacity-90 text-white px-1 sm:px-1.5 py-0.5 rounded-full text-[0.6rem] sm:text-xs font-bold border border-white border-opacity-30 mt-0.5 sm:mt-1 inline-flex">
              <AlertTriangle className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              <span>+24h</span>
            </div>
          )}
        </div>
      </div>

      {/* Conteúdo principal - flex-grow para ocupar espaço disponível */}
      <div className="flex-grow p-1.5 sm:p-2 lg:p-3 space-y-1.5 sm:space-y-2 lg:space-y-3">
        {/* Casa e Placa - Layout melhorado */}
        <div className="grid grid-cols-2 gap-1.5 sm:gap-2 lg:gap-3">
          {/* Casa */}
          <div className="bg-blue-50 rounded-md sm:rounded-lg p-1.5 sm:p-2 lg:p-2.5 border border-blue-100">
            <div className="flex items-center space-x-1 sm:space-x-1.5 mb-1 sm:mb-1.5">
              <Home className="w-2.5 h-2.5 sm:w-3 sm:h-3 lg:w-3.5 lg:h-3.5 text-blue-600" />
              <span className="text-[0.6rem] sm:text-xs font-medium text-blue-700 uppercase tracking-wide">Casa</span>
            </div>
            <p className="text-sm sm:text-base lg:text-lg font-bold text-blue-900 text-center">{visitante.casa_visitada}</p>
          </div>
          
          {/* Tipo de Vaga - Visual */}
          <div className={`rounded-md sm:rounded-lg p-1.5 sm:p-2 lg:p-2.5 border ${tipoVaga === 'morador' ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'}`}>
            <div className="flex items-center space-x-1 sm:space-x-1.5 mb-1 sm:mb-1.5">
              <Car className={`w-2.5 h-2.5 sm:w-3 sm:h-3 lg:w-3.5 lg:h-3.5 ${tipoVaga === 'morador' ? 'text-orange-600' : 'text-green-600'}`} />
              <span className={`text-[0.6rem] sm:text-xs font-medium uppercase tracking-wide ${tipoVaga === 'morador' ? 'text-orange-700' : 'text-green-700'}`}>Vaga</span>
            </div>
            <p className={`text-xs sm:text-sm font-bold text-center ${tipoVaga === 'morador' ? 'text-orange-900' : 'text-green-900'}`}>
              {tipoVaga === 'morador' ? 'Morador' : 'Visitante'}
            </p>
          </div>
        </div>

        {/* Placa do Veículo - Destaque */}
        <div className="bg-gray-50 rounded-md sm:rounded-lg p-1.5 sm:p-2 lg:p-2.5 border border-gray-200 text-center">
          <div className="flex items-center justify-center space-x-1 sm:space-x-1.5 mb-1 sm:mb-2">
            <Car className="w-2.5 h-2.5 sm:w-3 sm:h-3 lg:w-3.5 lg:h-3.5 text-gray-600" />
            <span className="text-[0.6rem] sm:text-xs font-medium text-gray-700 uppercase tracking-wide">Placa</span>
          </div>
          <div className="flex justify-center scale-75 sm:scale-90 lg:scale-100">
            <PlacaVeiculo placa={visitante.placa_veiculo} size="sm" />
          </div>
        </div>

        {/* Informações de tempo */}
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-md sm:rounded-lg p-1.5 sm:p-2 lg:p-2.5 border border-indigo-200">
          <div className="space-y-1.5 sm:space-y-2 lg:space-y-2.5">
            {/* Entrada */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1 sm:space-x-1.5">
                <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 lg:w-3.5 lg:h-3.5 text-indigo-600" />
                <span className="text-[0.6rem] sm:text-xs font-medium text-indigo-700 uppercase tracking-wide">Entrada</span>
              </div>
              <span className="font-bold text-indigo-900 text-[0.65rem] sm:text-xs lg:text-sm">{formatarHora(visitante.hora_entrada!)}</span>
            </div>
            
            {/* Divisor */}
            <div className="border-t border-indigo-200"></div>
            
            {/* Permanência */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1 sm:space-x-1.5">
                <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 lg:w-3.5 lg:h-3.5 text-purple-600" />
                <span className="text-[0.6rem] sm:text-xs font-medium text-purple-700 uppercase tracking-wide">Permanência</span>
              </div>
              <span className={`font-bold text-[0.65rem] sm:text-xs lg:text-sm px-1.5 sm:px-2 py-0.5 rounded-full ${
                alertaPermanenciaProlongada 
                  ? 'bg-red-100 text-red-700 border border-red-300' 
                  : 'bg-green-100 text-green-700 border border-green-300'
              }`}>
                {formatarTempoPermanencia(tempoPermanenciaHoras)}
              </span>
            </div>
          </div>
        </div>

        {/* Informações adicionais */}
        {(visitante.observacoes || visitante.liberado_por) && (
          <div className="space-y-1.5 sm:space-y-2 lg:space-y-2.5">
            {visitante.liberado_por && (
              <div className="bg-emerald-50 rounded-md sm:rounded-lg p-1.5 sm:p-2 lg:p-2.5 border border-emerald-200">
                <div className="flex items-center space-x-1 sm:space-x-1.5 mb-0.5 sm:mb-1">
                  <User className="w-2.5 h-2.5 sm:w-3 sm:h-3 lg:w-3.5 lg:h-3.5 text-emerald-600" />
                  <span className="text-[0.6rem] sm:text-xs font-medium text-emerald-700 uppercase tracking-wide">Liberado por</span>
                </div>
                <p className="font-semibold text-emerald-900 text-xs sm:text-sm truncate">{visitante.liberado_por}</p>
              </div>
            )}
            
            {visitante.observacoes && (
              <div className="bg-blue-50 rounded-md sm:rounded-lg p-1.5 sm:p-2 lg:p-2.5 border border-blue-200">
                <div className="flex items-center space-x-1 sm:space-x-1.5 mb-0.5 sm:mb-1">
                  <FileText className="w-2.5 h-2.5 sm:w-3 sm:h-3 lg:w-3.5 lg:h-3.5 text-blue-600" />
                  <span className="text-[0.6rem] sm:text-xs font-medium text-blue-700 uppercase tracking-wide">Observações</span>
                </div>
                <p className="text-blue-900 text-xs sm:text-sm leading-relaxed line-clamp-2" title={visitante.observacoes}>
                  {visitante.observacoes}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Botões de ação - Fixos na parte inferior */}
      <div className="p-1.5 sm:p-2 lg:p-3 border-t border-gray-100 bg-gray-50 flex-shrink-0 space-y-1 sm:space-y-1.5 lg:space-y-2">
        <button
          onClick={() => onRegistrarSaida(visitante.id!)}
          disabled={loading}
          className="w-full flex items-center justify-center space-x-1 sm:space-x-1.5 lg:space-x-2 px-2 sm:px-2.5 lg:px-3 py-1.5 sm:py-2 lg:py-2.5 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-md sm:rounded-lg hover:from-green-700 hover:to-green-800 transition-all duration-200 disabled:opacity-50 font-semibold shadow-md hover:shadow-lg group-hover:shadow-xl transform hover:scale-105 text-xs sm:text-sm"
        >
          <LogOut className="w-3 h-3 sm:w-3.5 sm:h-3.5 lg:w-4 lg:h-4" />
          <span>Dar Baixa</span>
        </button>
        
        <button
          onClick={() => onEdit(visitante)}
          disabled={loading}
          className="w-full flex items-center justify-center space-x-1 sm:space-x-1.5 lg:space-x-2 px-2 sm:px-2.5 lg:px-3 py-1.5 sm:py-2 text-gray-700 bg-white hover:bg-gray-50 rounded-md sm:rounded-lg transition-colors disabled:opacity-50 font-medium border border-gray-300 hover:border-gray-400 transform hover:scale-105 text-xs sm:text-sm"
        >
          <Edit className="w-3 h-3 sm:w-3.5 sm:h-3.5 lg:w-4 lg:h-4" />
          <span>Editar</span>
        </button>
      </div>
    </div>
  );
}

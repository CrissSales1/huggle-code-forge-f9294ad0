import { AlertTriangle, Edit, LogOut, Home, Car, Info } from 'lucide-react';
import PlacaVeiculo from './PlacaVeiculo';
import { useLiveTimer } from '@/react-app/hooks/useLiveTimer';
import type { VisitanteAtivo } from '@/shared/types';

interface VisitanteCardProps {
  visitante: VisitanteAtivo;
  onEdit: (visitante: VisitanteAtivo) => void;
  onRegistrarSaida: (id: number) => void;
  loading?: boolean;
}

export default function VisitanteCard({
  visitante,
  onEdit,
  onRegistrarSaida,
  loading,
}: VisitanteCardProps) {
  const tempoPermanenciaHoras = useLiveTimer(visitante.hora_entrada!);
  const alertaPermanenciaProlongada = tempoPermanenciaHoras > 24;

  const formatarHoraCurta = (hora: string) =>
    new Date(hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const formatarDataDia = (hora: string) => {
    const d = new Date(hora);
    const hoje = new Date();
    if (d.toDateString() === hoje.toDateString()) return 'Hoje';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  const formatarTempoPermanencia = (horas: number) => {
    if (horas < 1) return `${Math.floor(horas * 60)}min`;
    return `${Math.floor(horas)}h${Math.floor((horas % 1) * 60)
      .toString()
      .padStart(2, '0')}min`;
  };
  const topAccent = alertaPermanenciaProlongada ? 'border-t-error' : 'border-t-[#E65100]';
  const headerBg = alertaPermanenciaProlongada ? 'bg-error/5' : 'bg-[#FFF3E0]/40';

  return (
    <div
      className={`bg-surface-container-lowest rounded-card shadow-ambient-1 hover:shadow-ambient-2 hover:-translate-y-0.5 transition-all duration-300 flex flex-col h-full border border-outline-variant/40 border-t-[3px] ${topAccent} overflow-hidden`}
    >
      {/* Header */}
      <div className={`p-md border-b border-outline-variant/60 flex justify-between items-start gap-3 ${headerBg}`}>

        <div className="min-w-0 flex-1">
          <h3 className="text-h3 font-semibold text-on-surface mb-2 truncate" title={visitante.nome}>
            {visitante.nome}
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Chip Casa visitada */}
            <div className="inline-flex items-center gap-1.5 bg-primary/10 border border-primary/25 text-primary px-2 py-1 rounded-full text-label-caps font-semibold">
              <Home className="w-3.5 h-3.5" />
              <span className="truncate max-w-[120px]" title={visitante.casa_visitada}>
                {visitante.casa_visitada}
              </span>
            </div>
            {/* Chip Vaga — diferenciação clara entre Morador e Visitante */}
            {visitante.estacionar_vaga_morador ? (
              <div
                className="inline-flex items-center gap-1.5 bg-secondary/15 border border-secondary/40 text-secondary px-2 py-1 rounded-full text-label-caps font-bold shadow-ambient-1"
                title="Estacionado em vaga de morador"
              >
                <Car className="w-3.5 h-3.5" />
                <span>VAGA MORADOR</span>
              </div>
            ) : (
              <div
                className="inline-flex items-center gap-1.5 bg-tertiary/10 border border-tertiary/30 text-tertiary px-2 py-1 rounded-full text-label-caps font-semibold"
                title="Estacionado em vaga de visitante"
              >
                <Car className="w-3.5 h-3.5" />
                <span>VAGA VISITANTE</span>
              </div>
            )}
          </div>
          {alertaPermanenciaProlongada && (
            <div className="mt-2 inline-flex items-center gap-1 bg-error/10 text-error px-2 py-0.5 rounded-full text-label-caps font-bold">
              <AlertTriangle className="w-3 h-3" />
              <span>+24H</span>
            </div>
          )}
        </div>
        {/* Badge prisma */}
        <div className="w-11 h-11 rounded-full bg-[#FFF3E0] text-[#E65100] flex items-center justify-center font-bold text-h3 shadow-ambient-2 ring-4 ring-[#E65100]/10 flex-shrink-0">
          {visitante.numero_prisma ?? '?'}
        </div>
      </div>

      {/* Conteúdo */}
      <div className="p-md flex-1 flex flex-col gap-md">
        {/* Placa */}
        <div className="flex justify-center">
          <PlacaVeiculo placa={visitante.placa_veiculo} size="md" />
        </div>

        {/* Timing */}
        <div className="bg-primary/5 border border-primary/15 rounded-lg p-3 grid grid-cols-2 gap-4 divide-x divide-primary/15">
          <div>
            <p className="text-label-caps text-primary/80 mb-1">ENTRADA</p>
            <p className="text-body-md text-on-surface font-semibold">
              {formatarHoraCurta(visitante.hora_entrada!)}
            </p>
            <p className="text-[12px] text-on-surface-variant">{formatarDataDia(visitante.hora_entrada!)}</p>
          </div>
          <div className="pl-4">
            <p className="text-label-caps text-primary/80 mb-1">PERMANÊNCIA</p>
            <span
              className={`text-body-md font-semibold inline-block px-2 py-0.5 rounded ${
                alertaPermanenciaProlongada
                  ? 'bg-error/10 text-error'
                  : 'bg-secondary/10 text-secondary'
              }`}
            >
              {formatarTempoPermanencia(tempoPermanenciaHoras)}
            </span>
          </div>
        </div>

        {/* Observações / liberado por */}
        {(visitante.observacoes || visitante.liberado_por) && (
          <div className="flex items-start gap-2 bg-surface p-3 rounded-lg border border-surface-variant">
            <Info className="text-outline w-4 h-4 mt-0.5 flex-shrink-0" />
            <div className="text-body-sm text-on-surface-variant min-w-0">
              {visitante.liberado_por && (
                <p className="truncate">
                  <span className="font-semibold">Liberado por:</span> {visitante.liberado_por}
                </p>
              )}
              {visitante.observacoes && (
                <p className="line-clamp-2" title={visitante.observacoes}>
                  {visitante.observacoes}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Ações */}
      <div className="p-md border-t border-outline-variant/60 grid grid-cols-2 gap-3 bg-surface-container-low/60 rounded-b-card">
        <button
          onClick={() => onEdit(visitante)}
          disabled={loading}
          className="bg-surface-container-lowest border border-primary/30 text-primary text-button font-semibold rounded-btn py-2 hover:bg-primary/10 hover:border-primary/60 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          <Edit className="w-4 h-4" />
          Editar
        </button>
        <button
          onClick={() => onRegistrarSaida(visitante.id!)}
          disabled={loading}
          className="bg-secondary text-on-secondary text-button font-semibold rounded-btn py-2 hover:bg-secondary-fixed-dim hover:shadow-ambient-2 transition-all shadow-ambient-1 disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          <LogOut className="w-4 h-4" />
          Dar Baixa
        </button>
      </div>
    </div>
  );
}

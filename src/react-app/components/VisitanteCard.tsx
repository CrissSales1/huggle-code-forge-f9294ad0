import { AlertTriangle, Edit, LogOut, Home, Car, Info } from 'lucide-react';
import PlacaVeiculo from './PlacaVeiculo';
import PrismaBadge from './PrismaBadge';
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

  const accentGradient = alertaPermanenciaProlongada
    ? 'bg-gradient-to-r from-error via-error to-error/70'
    : 'bg-gradient-to-r from-[#E65100] via-[#F36F1A] to-[#FFB74D]';

  return (
    <div
      className="group relative bg-surface-container-lowest rounded-2xl shadow-ambient-1 hover:shadow-ambient-3 hover:-translate-y-1 hover:ring-1 hover:ring-primary/20 transition-all duration-300 flex flex-col h-full border border-outline-variant/40 overflow-hidden"
    >
      {/* Faixa de acento superior */}
      <div className={`h-1 w-full ${accentGradient}`} aria-hidden />

      {/* Header */}
      <div className="relative p-4 pb-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3
              className="text-base font-semibold tracking-tight text-on-surface truncate leading-snug"
              title={visitante.nome}
            >
              {visitante.nome}
            </h3>
            <div className="mt-1 h-px bg-outline-variant/40" />

            <div className="mt-2.5 flex items-center gap-2 flex-wrap">
              {/* Chip Casa visitada */}
              <div
                className="inline-flex items-center gap-1.5 bg-primary/10 text-primary pl-1 pr-3 py-1 rounded-full"
                title={`Casa ${visitante.casa_visitada}`}
              >
                <span className="w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center flex-shrink-0">
                  <Home className="w-3.5 h-3.5" strokeWidth={2.75} />
                </span>
                <span className="text-sm font-bold leading-none truncate max-w-[110px]">
                  {visitante.casa_visitada}
                </span>
              </div>

              {/* Tag Vaga — cores distintas por tipo */}
              {visitante.estacionar_vaga_morador ? (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/40 text-amber-700 dark:text-amber-400 text-xs font-bold uppercase tracking-wider"
                  title="Estacionado em vaga de morador"
                >
                  <Car className="w-4 h-4" strokeWidth={2.5} />
                  Vaga Morador
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-500/10 border border-sky-500/40 text-sky-700 dark:text-sky-400 text-xs font-bold uppercase tracking-wider"
                  title="Estacionado em vaga de visitante"
                >
                  <Car className="w-4 h-4" strokeWidth={2.5} />
                  Vaga Visitante
                </span>
              )}

              {alertaPermanenciaProlongada && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-error/10 text-error text-[10px] font-bold uppercase tracking-wider">
                  <AlertTriangle className="w-3 h-3 animate-pulse" />
                  +24h
                </span>
              )}
            </div>
          </div>

          {/* Prisma 3D */}
          <PrismaBadge
            numero={visitante.numero_prisma}
            size="sm"
            variant={alertaPermanenciaProlongada ? 'error' : 'orange'}
            withGroundShadow
            className="flex-shrink-0"
          />
        </div>
      </div>

      {/* Conteúdo */}
      <div className="px-4 pb-4 flex-1 flex flex-col gap-3">
        {/* Placa */}
        <div className="flex justify-center">
          <PlacaVeiculo placa={visitante.placa_veiculo} size="md" />
        </div>

        {/* Painel Entrada / Permanência */}
        <div className="rounded-xl bg-surface-container/70 backdrop-blur-sm border border-outline-variant/40 p-3 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-outline mb-1">
              Entrada
            </p>
            <p className="font-mono tabular-nums text-sm font-semibold text-on-surface leading-tight">
              {formatarHoraCurta(visitante.hora_entrada!)}
            </p>
            <p className="text-[11px] text-on-surface-variant mt-0.5">
              {formatarDataDia(visitante.hora_entrada!)}
            </p>
          </div>
          <div className="border-l border-outline-variant/40 pl-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-outline mb-1">
              Permanência
            </p>
            <p
              className={`font-mono tabular-nums text-sm font-semibold leading-tight inline-flex items-center gap-1.5 ${
                alertaPermanenciaProlongada ? 'text-error' : 'text-on-surface'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                  alertaPermanenciaProlongada ? 'bg-error' : 'bg-secondary'
                }`}
                aria-hidden
              />
              {formatarTempoPermanencia(tempoPermanenciaHoras)}
            </p>
            <p className="text-[11px] text-on-surface-variant mt-0.5">em tempo real</p>
          </div>
        </div>

        {/* Observações / liberado por */}
        {(visitante.observacoes || visitante.liberado_por) && (
          <div className="flex items-start gap-2 bg-surface-container-low/60 p-2.5 rounded-lg">
            <Info className="text-outline w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <div className="text-[12px] text-on-surface-variant min-w-0 leading-snug">
              {visitante.liberado_por && (
                <p className="truncate">
                  <span className="font-semibold text-on-surface">Liberado por:</span>{' '}
                  {visitante.liberado_por}
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
      <div className="px-4 py-3 border-t border-outline-variant/40 grid grid-cols-[1fr_auto] gap-2 bg-surface-container-low/40">
        <button
          onClick={() => onEdit(visitante)}
          disabled={loading}
          className="text-primary text-sm font-semibold rounded-lg py-2.5 hover:bg-primary/10 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          <Edit className="w-4 h-4" />
          Editar
        </button>
        <button
          onClick={() => onRegistrarSaida(visitante.id!)}
          disabled={loading}
          className="group/btn bg-rose-500/90 hover:bg-rose-600 text-white text-sm font-semibold rounded-lg px-4 py-2.5 hover:shadow-ambient-2 transition-all shadow-ambient-1 disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          <LogOut className="w-4 h-4 transition-transform group-hover/btn:translate-x-0.5" />
          Dar Baixa
        </button>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Edit, LogOut, Home, Car, UserCheck, MessageSquare, X, Check } from 'lucide-react';
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

  const COUNTDOWN_INICIAL = 5;
  const [confirmandoBaixa, setConfirmandoBaixa] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_INICIAL);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const limparInterval = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => () => limparInterval(), []);

  const iniciarConfirmacao = () => {
    setCountdown(COUNTDOWN_INICIAL);
    setConfirmandoBaixa(true);
    limparInterval();
    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          limparInterval();
          setConfirmandoBaixa(false);
          onRegistrarSaida(visitante.id!);
          return COUNTDOWN_INICIAL;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const cancelarConfirmacao = () => {
    limparInterval();
    setConfirmandoBaixa(false);
    setCountdown(COUNTDOWN_INICIAL);
  };

  const confirmarAgora = () => {
    limparInterval();
    setConfirmandoBaixa(false);
    setCountdown(COUNTDOWN_INICIAL);
    onRegistrarSaida(visitante.id!);
  };

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
      <div className={`h-0.5 w-full ${accentGradient}`} aria-hidden />

      {/* Header — linha divisória centralizada no badge */}
      <div className="relative p-3 pb-2">
        <div className="grid grid-cols-[1fr_auto] gap-x-2.5">
          {/* Coluna esquerda — topo: nome */}
          <div className="min-w-0 pb-1 flex items-end">
            <h3
              className="text-[15px] font-extrabold tracking-tight text-on-surface truncate leading-none"
              style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif", letterSpacing: '-0.02em' }}
              title={visitante.nome}
            >
              {visitante.nome}
            </h3>
          </div>

          {/* Coluna direita — badge ocupa as duas linhas, centralizado verticalmente */}
          <div className="row-span-2 self-center flex flex-col items-center flex-shrink-0">
            <span
              className="text-[9px] font-bold uppercase tracking-[0.12em] text-outline mb-1"
              style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif" }}
            >
              Prisma
            </span>
            <PrismaBadge
              numero={visitante.numero_prisma}
              size="lg"
              variant={alertaPermanenciaProlongada ? 'error' : 'orange'}
              withGroundShadow
            />
          </div>

          {/* Linha divisória atravessando o card (apenas na coluna esquerda, alinhada ao meio do badge) */}
          <div className="h-px bg-outline-variant/40" aria-hidden />

          {/* Coluna esquerda — base: placa centralizada na largura da linha (colada nela) */}
          <div className="pt-1 flex justify-center">
            <PlacaVeiculo placa={visitante.placa_veiculo} size="sm" />
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="px-3 pb-2 flex-1 flex flex-col gap-2 pt-1">

        {/* Casa + Tipo de vaga ocupando a largura do card */}
        <div className="grid grid-cols-[auto_1fr] gap-1.5 items-stretch">
          <div
            className="inline-flex items-center gap-1.5 bg-primary/10 text-primary pl-0.5 pr-2.5 py-1 rounded-full"
            title={`Casa ${visitante.casa_visitada}`}
          >
            <span className="relative w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center flex-shrink-0">
              <Home className="w-4 h-4" strokeWidth={2.75} />
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-[8px] font-bold uppercase tracking-wider text-primary/70">Casa</span>
              <span className="text-xs font-bold leading-none truncate max-w-[70px] mt-0.5">
                {visitante.casa_visitada}
              </span>
            </span>
          </div>

          {visitante.estacionar_vaga_morador ? (
            <span
              className="flex items-center justify-center gap-1.5 px-2 py-1 rounded-full bg-amber-500/10 border border-amber-500/40 text-amber-700 dark:text-amber-400 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
              title="Estacionado em vaga de morador"
            >
              <Car className="w-3.5 h-3.5" strokeWidth={2.5} />
              Vaga Morador
            </span>
          ) : (
            <span
              className="flex items-center justify-center gap-1.5 px-2 py-1 rounded-full bg-sky-500/10 border border-sky-500/40 text-sky-700 dark:text-sky-400 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
              title="Estacionado em vaga de visitante"
            >
              <Car className="w-3.5 h-3.5" strokeWidth={2.5} />
              Vaga Visitante
            </span>
          )}
        </div>

        {alertaPermanenciaProlongada && (
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-error/10 text-error text-[9px] font-bold uppercase tracking-wider">
              <AlertTriangle className="w-3 h-3 animate-pulse" />
              +24h
            </span>
          </div>
        )}

        {/* Painel Entrada / Permanência */}
        <div className="rounded-lg bg-surface-container/70 backdrop-blur-sm border border-outline-variant/40 p-2 grid grid-cols-2 gap-2">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-outline mb-0.5">
              Entrada
            </p>
            <p className="font-mono tabular-nums text-xs font-semibold text-on-surface leading-tight">
              {formatarHoraCurta(visitante.hora_entrada!)}
            </p>
            <p className="text-[10px] text-on-surface-variant mt-0.5">
              {formatarDataDia(visitante.hora_entrada!)}
            </p>
          </div>
          <div className="border-l border-outline-variant/40 pl-2.5">
            <p className="text-[9px] font-bold uppercase tracking-wider text-outline mb-0.5">
              Permanência
            </p>
            <p
              className={`font-mono tabular-nums text-xs font-semibold leading-tight inline-flex items-center gap-1 ${
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
            <p className="text-[10px] text-on-surface-variant mt-0.5">em tempo real</p>
          </div>
        </div>

        {/* Liberado por — card próprio */}
        {visitante.liberado_por && (
          <div className="flex items-start gap-1.5 bg-emerald-500/5 border border-emerald-500/20 p-2 rounded-lg">
            <UserCheck className="text-emerald-600 dark:text-emerald-400 w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <div className="min-w-0 leading-snug">
              <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-0.5">
                Liberado por
              </p>
              <p className="text-[11px] font-semibold text-on-surface truncate" title={visitante.liberado_por}>
                {visitante.liberado_por}
              </p>
            </div>
          </div>
        )}

        {/* Observações — card próprio */}
        {visitante.observacoes && (
          <div className="flex items-start gap-1.5 bg-surface-container-low/60 p-2 rounded-lg">
            <MessageSquare className="text-outline w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <div className="min-w-0 leading-snug">
              <p className="text-[9px] font-bold uppercase tracking-wider text-outline mb-0.5">
                Observações
              </p>
              <p className="text-[11px] text-on-surface-variant line-clamp-2" title={visitante.observacoes}>
                {visitante.observacoes}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Ações */}
      <div className="px-3 py-2 border-t border-outline-variant/40 bg-surface-container-low/40">
        {!confirmandoBaixa ? (
          <div className="grid grid-cols-[1fr_auto] gap-1.5">
            <button
              onClick={() => onEdit(visitante)}
              disabled={loading}
              className="text-primary text-xs font-semibold rounded-lg py-2 hover:bg-primary/10 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <Edit className="w-3.5 h-3.5" />
              Editar
            </button>
            <button
              onClick={iniciarConfirmacao}
              disabled={loading}
              className="group/btn bg-rose-500/90 hover:bg-rose-600 text-white text-xs font-semibold rounded-lg px-3 py-2 hover:shadow-ambient-2 transition-all shadow-ambient-1 disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5 transition-transform group-hover/btn:translate-x-0.5" />
              Dar Baixa
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <p
                className="text-[11px] font-semibold text-on-surface flex items-center gap-1.5"
                aria-live="polite"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                Confirmando saída em <span className="font-mono tabular-nums text-rose-500 text-xs">{countdown}s</span>…
              </p>
            </div>
            <div className="h-1 w-full rounded-full bg-rose-500/15 overflow-hidden">
              <div
                className="h-full bg-rose-500 transition-all duration-1000 ease-linear"
                style={{ width: `${(countdown / COUNTDOWN_INICIAL) * 100}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-1.5 mt-0.5">
              <button
                onClick={cancelarConfirmacao}
                className="text-on-surface text-xs font-semibold rounded-lg py-1.5 border border-outline-variant hover:bg-surface-container transition-colors flex items-center justify-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" />
                Cancelar
              </button>
              <button
                onClick={confirmarAgora}
                className="bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold rounded-lg py-1.5 transition-colors flex items-center justify-center gap-1.5 shadow-ambient-1"
              >
                <Check className="w-3.5 h-3.5" />
                Confirmar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

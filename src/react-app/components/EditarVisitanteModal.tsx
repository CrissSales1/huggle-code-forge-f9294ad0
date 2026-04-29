import { useState, useEffect } from 'react';
import { AlertTriangle, Home, UserCheck, Ban, Pencil } from 'lucide-react';
import Modal from './Modal';
import PrismaBadge from './PrismaBadge';
import { useVisitanteActions } from '@/react-app/hooks/useApi';
import { supabase } from '@/integrations/supabase/client';
import { normalizarNumeroCasa } from '@/react-app/utils/formatters';
import type { VisitanteAtivo } from '@/shared/types';

interface EditarVisitanteModalProps {
  isOpen: boolean;
  onClose: () => void;
  visitante: VisitanteAtivo | null;
  onSuccess: () => void;
}

export default function EditarVisitanteModal({ isOpen, onClose, visitante, onSuccess }: EditarVisitanteModalProps) {
  const [nome, setNome] = useState('');
  const [casaVisitada, setCasaVisitada] = useState('');
  const [placaVeiculo, setPlacaVeiculo] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [liberadoPor, setLiberadoPor] = useState('');
  const [estacionarVagaMorador, setEstacionarVagaMorador] = useState(false);
  const [numeroPrisma, setNumeroPrisma] = useState<number | null>(null);
  const [prismasDisponiveis, setPrismasDisponiveis] = useState<number[]>([]);
  const [editandoPrisma, setEditandoPrisma] = useState(false);

  const { editarVisitante, loading, error } = useVisitanteActions();

  // Validação de placa
  const isValidPlaca = (placa: string): boolean => {
    const placaLimpa = placa.replace(/[^A-Z0-9]/g, '').toUpperCase();
    if (placaLimpa.length !== 7) return false;
    const formatoAntigo = /^[A-Z]{3}[0-9]{4}$/;
    const formatoMercosul = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;
    return formatoAntigo.test(placaLimpa) || formatoMercosul.test(placaLimpa);
  };

  useEffect(() => {
    if (!isOpen || !visitante) return;

    setNome(visitante.nome);
    setCasaVisitada(visitante.casa_visitada);
    setPlacaVeiculo(visitante.placa_veiculo);
    setObservacoes(visitante.observacoes || '');
    setLiberadoPor(visitante.liberado_por || '');
    setEstacionarVagaMorador(visitante.estacionar_vaga_morador ?? false);
    setNumeroPrisma(visitante.numero_prisma ?? null);

    // Buscar prismas livres no momento exato da abertura (sempre fresco)
    (async () => {
      const { data: visitantesAtivos } = await supabase
        .from('visitantes')
        .select('numero_prisma, id')
        .eq('is_ativo', true)
        .not('numero_prisma', 'is', null);

      const ocupadosPorOutros = new Set(
        (visitantesAtivos || [])
          .filter((v) => v.id !== visitante.id && v.numero_prisma != null)
          .map((v) => v.numero_prisma as number)
      );

      const { data: todosPrismas } = await supabase
        .from('prismas_magneticos')
        .select('numero')
        .order('numero', { ascending: true });

      const livres = (todosPrismas || [])
        .map((p) => p.numero)
        .filter((n) => !ocupadosPorOutros.has(n));

      setPrismasDisponiveis(livres);
    })();
  }, [isOpen, visitante]);

  // Lista final: prismas livres + o atual do visitante (garantido)
  const opcoesPrismas = (() => {
    const numeros = new Set<number>(prismasDisponiveis);
    if (numeroPrisma) numeros.add(numeroPrisma);
    return Array.from(numeros).sort((a, b) => a - b);
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!visitante) return;

    const sucesso = await editarVisitante({
      id: visitante.id!,
      nome: nome.trim(),
      casa_visitada: normalizarNumeroCasa(casaVisitada.trim()),
      placa_veiculo: placaVeiculo.trim().toUpperCase(),
      numero_prisma: numeroPrisma,
      estacionar_vaga_morador: estacionarVagaMorador,
      observacoes: observacoes.trim() || undefined,
      liberado_por: liberadoPor.trim() || undefined,
    });

    if (sucesso) {
      onSuccess();
      onClose();
    }
  };

  const handleClose = () => {
    onClose();
  };

  const prismaAtualOriginal = visitante?.numero_prisma ?? null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Editar Visitante" size="lg">
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && (
          <div className="flex items-start gap-2 bg-error-container/40 border border-error/30 text-on-error-container px-4 py-3 rounded-btn">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-error" />
            <span className="text-body-sm">{error}</span>
          </div>
        )}

        {/* Nome */}
        <div>
          <label htmlFor="nome" className="block text-label-caps uppercase text-on-surface-variant mb-1.5">
            Nome do visitante *
          </label>
          <input
            type="text"
            id="nome"
            value={nome}
            onChange={(e) => setNome(e.target.value.toUpperCase())}
            className="w-full px-3 py-2.5 border border-outline-variant rounded-btn bg-surface-container-lowest text-on-surface uppercase placeholder:normal-case placeholder:text-on-surface-variant/60 focus:border-primary"
            required
          />
        </div>

        {/* Casa + Placa lado a lado */}
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-3">
            <label htmlFor="casa" className="block text-label-caps uppercase text-on-surface-variant mb-1.5">
              Casa/Apto *
            </label>
            <input
              type="text"
              id="casa"
              value={casaVisitada}
              onChange={(e) => setCasaVisitada(e.target.value.toUpperCase())}
              className="w-full px-3 py-2.5 border border-outline-variant rounded-btn bg-surface-container-lowest text-on-surface uppercase text-center font-bold tracking-wide focus:border-primary"
              placeholder="Ex: 102A"
              maxLength={5}
              required
            />
          </div>

          <div className="col-span-9 relative">
            <label htmlFor="placa" className="block text-label-caps uppercase text-on-surface-variant mb-1.5">
              Placa do veículo *
            </label>
            <input
              type="text"
              id="placa"
              value={placaVeiculo}
              onChange={(e) => {
                const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                if (v.length <= 7) setPlacaVeiculo(v);
              }}
              className="w-full px-3 py-2.5 border border-outline-variant rounded-btn bg-surface-container-lowest text-on-surface uppercase tracking-[0.15em] font-mono font-semibold focus:border-primary"
              placeholder="ABC-1234"
              maxLength={7}
              required
            />
            {placaVeiculo && !isValidPlaca(placaVeiculo) && (
              <div className="absolute top-full left-0 mt-1 text-xs text-error font-medium">
                Formato inválido. Use ABC1234 ou ABC1A23
              </div>
            )}
          </div>
        </div>

        {/* Observações em linha única */}
        <div>
          <label htmlFor="observacoes" className="block text-label-caps uppercase text-on-surface-variant mb-1.5">
            Observações
          </label>
          <input
            type="text"
            id="observacoes"
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value.toUpperCase())}
            className="w-full px-3 py-2.5 border border-outline-variant rounded-btn bg-surface-container-lowest text-on-surface uppercase placeholder:normal-case placeholder:text-on-surface-variant/60 focus:border-primary"
            placeholder="Informações adicionais relevantes..."
          />
        </div>

        {/* Liberado por */}
        <div>
          <label htmlFor="liberadoPor" className="block text-label-caps uppercase text-on-surface-variant mb-1.5">
            Liberado por
          </label>
          <input
            type="text"
            id="liberadoPor"
            value={liberadoPor}
            onChange={(e) => setLiberadoPor(e.target.value.toUpperCase())}
            className="w-full px-3 py-2.5 border border-outline-variant rounded-btn bg-surface-container-lowest text-on-surface uppercase placeholder:normal-case placeholder:text-on-surface-variant/60 focus:border-primary"
            placeholder="Nome do morador responsável pela liberação"
          />
        </div>

        {/* Onde vai estacionar? — mesmo padrão do Cadastro */}
        <div className="pt-1">
          <label className="block text-label-caps uppercase text-on-surface-variant mb-1.5">
            Onde vai estacionar?
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setEstacionarVagaMorador(false)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-btn text-left transition-colors ${
                !estacionarVagaMorador
                  ? 'border-2 border-secondary bg-secondary-container/20'
                  : 'border border-outline-variant bg-surface hover:bg-surface-container-highest'
              }`}
            >
              <Home className={`w-4 h-4 shrink-0 ${!estacionarVagaMorador ? 'text-secondary' : 'text-on-surface-variant'}`} />
              <span className="text-body-sm font-semibold text-on-surface truncate">
                Vaga Comum
              </span>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                !estacionarVagaMorador ? 'bg-secondary/15 text-secondary' : 'bg-surface-container-highest text-on-surface-variant'
              }`}>
                Padrão
              </span>
              {!estacionarVagaMorador && (
                <UserCheck className="w-4 h-4 ml-auto text-secondary shrink-0" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setEstacionarVagaMorador(true)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-btn text-left transition-colors ${
                estacionarVagaMorador
                  ? 'border-2 border-tertiary bg-tertiary-fixed/30'
                  : 'border border-outline-variant bg-surface hover:bg-surface-container-highest'
              }`}
            >
              <Home className={`w-4 h-4 shrink-0 ${estacionarVagaMorador ? 'text-tertiary' : 'text-on-surface-variant'}`} />
              <span className="text-body-sm font-semibold text-on-surface truncate">
                Vaga Morador
              </span>
              {estacionarVagaMorador && (
                <UserCheck className="w-4 h-4 ml-auto text-tertiary shrink-0" />
              )}
            </button>
          </div>
        </div>

        {/* Seleção de Prisma — grade visual */}
        <div className="pt-1">
          <label className="block text-label-caps uppercase text-on-surface-variant mb-1.5">
            Prisma magnético
          </label>
          <div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
            {/* Sem prisma */}
            <button
              type="button"
              onClick={() => setNumeroPrisma(null)}
              className={`aspect-square flex flex-col items-center justify-center gap-1 rounded-card p-2 transition-all ${
                numeroPrisma === null
                  ? 'border-2 border-primary bg-primary-container/30 shadow-ambient-1'
                  : 'border border-outline-variant bg-surface-container-low hover:bg-surface-container hover:-translate-y-0.5'
              }`}
              title="Sem prisma"
            >
              <Ban className={`w-5 h-5 ${numeroPrisma === null ? 'text-primary' : 'text-on-surface-variant'}`} />
              <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Sem</span>
            </button>

            {opcoesPrismas.map((numero) => {
              const isSelecionado = numero === numeroPrisma;
              const isAtual = numero === prismaAtualOriginal;
              return (
                <button
                  key={numero}
                  type="button"
                  onClick={() => setNumeroPrisma(numero)}
                  className={`group relative aspect-square flex flex-col items-center justify-center gap-1 rounded-card p-2 transition-all ${
                    isSelecionado
                      ? 'border-2 border-primary bg-primary-container/30 shadow-ambient-2'
                      : 'border border-outline-variant bg-surface-container-low hover:bg-primary-container/20 hover:border-primary/60 hover:-translate-y-0.5'
                  }`}
                >
                  <PrismaBadge
                    numero={numero}
                    size="md"
                    withGroundShadow
                    className="group-hover:scale-105 transition-transform"
                  />
                  {isAtual && (
                    <span className="absolute -top-1.5 -right-1.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary text-on-primary shadow-ambient-1">
                      Atual
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Rodapé */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-outline-variant/30">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-button font-semibold text-on-surface-variant hover:bg-surface-container-high rounded-btn transition-colors"
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary text-button font-semibold rounded-btn shadow-ambient-1 hover:bg-primary-container hover:shadow-ambient-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />
                <span>Salvando...</span>
              </>
            ) : (
              <>
                <UserCheck className="w-4 h-4" />
                <span>Salvar Alterações</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}

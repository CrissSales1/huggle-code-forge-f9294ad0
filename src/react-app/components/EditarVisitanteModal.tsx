import { useState, useEffect } from 'react';
import Modal from './Modal';
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

  const { editarVisitante, loading, error } = useVisitanteActions();

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

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Editar Visitante">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="nome" className="block text-sm font-medium text-gray-700 mb-2">
            Nome do Visitante
          </label>
          <input
            type="text"
            id="nome"
            value={nome}
            onChange={(e) => setNome(e.target.value.toUpperCase())}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase"
            required
          />
        </div>

        <div>
          <label htmlFor="casa" className="block text-sm font-medium text-gray-700 mb-2">
            Casa Visitada
          </label>
          <input
            type="text"
            id="casa"
            value={casaVisitada}
            onChange={(e) => setCasaVisitada(e.target.value.toUpperCase())}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase"
            required
          />
        </div>

        <div>
          <label htmlFor="placa" className="block text-sm font-medium text-gray-700 mb-2">
            Placa do Veículo
          </label>
          <input
            type="text"
            id="placa"
            value={placaVeiculo}
            onChange={(e) => setPlacaVeiculo(e.target.value.toUpperCase())}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="ABC1234 ou ABC1A23"
            maxLength={7}
            required
          />
        </div>

        <div>
          <label htmlFor="prisma" className="block text-sm font-medium text-gray-700 mb-2">
            Prisma Magnético
          </label>
          <select
            id="prisma"
            value={numeroPrisma ?? ''}
            onChange={(e) => setNumeroPrisma(e.target.value ? Number(e.target.value) : null)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
          >
            <option value="">Sem prisma</option>
            {opcoesPrismas.map((numero) => (
              <option key={numero} value={numero}>
                Prisma {numero}{numero === visitante?.numero_prisma ? ' (atual)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Tipo de Vaga
          </label>
          <div className="flex items-center space-x-4">
            <label className="flex items-center">
              <input
                type="radio"
                name="tipoVaga"
                checked={!estacionarVagaMorador}
                onChange={() => setEstacionarVagaMorador(false)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
              />
              <span className="ml-2 text-sm text-gray-700">Vaga de Visitantes</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="tipoVaga"
                checked={estacionarVagaMorador}
                onChange={() => setEstacionarVagaMorador(true)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
              />
              <span className="ml-2 text-sm text-gray-700">Vaga do Morador</span>
            </label>
          </div>
        </div>

        <div>
          <label htmlFor="observacoes" className="block text-sm font-medium text-gray-700 mb-2">
            Observações
          </label>
          <textarea
            id="observacoes"
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value.toUpperCase())}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase"
            placeholder="Ex: Entregador, Uber, motorista particular, etc."
            rows={3}
          />
        </div>

        <div>
          <label htmlFor="liberadoPor" className="block text-sm font-medium text-gray-700 mb-2">
            Liberado Por
          </label>
          <input
            type="text"
            id="liberadoPor"
            value={liberadoPor}
            onChange={(e) => setLiberadoPor(e.target.value.toUpperCase())}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase"
            placeholder="Nome de quem autorizou a entrada"
          />
        </div>

        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

import { useState, useEffect } from 'react';
import { X, Save, Car } from 'lucide-react';
import { normalizarNumeroCasa } from '@/react-app/utils/formatters';
import { supabase } from '@/integrations/supabase/client';

interface EditarVeiculoMoradorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  veiculo: {
    id: number;
    placa_veiculo: string;
    casa: string;
  } | null;
}

export default function EditarVeiculoMoradorModal({ isOpen, onClose, onSuccess, veiculo }: EditarVeiculoMoradorModalProps) {
  const [placa, setPlaca] = useState('');
  const [casa, setCasa] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (veiculo) {
      setPlaca(veiculo.placa_veiculo);
      setCasa(veiculo.casa);
    }
  }, [veiculo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!placa || !casa || !veiculo) {
      setError('Todos os campos são obrigatórios');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from('veiculos_moradores')
        .update({
          placa_veiculo: placa.toUpperCase(),
          casa: normalizarNumeroCasa(casa),
        })
        .eq('id', veiculo.id);

      if (updateError) throw updateError;

      setPlaca('');
      setCasa('');
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !veiculo) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <Car className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Editar Veículo de Morador</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="placa" className="block text-sm font-medium text-gray-700 mb-1">
              Placa do Veículo
            </label>
            <input
              type="text"
              id="placa"
              value={placa}
              onChange={(e) => setPlaca(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="ABC1234 ou ABC1D23"
              maxLength={7}
              required
            />
          </div>

          <div>
            <label htmlFor="casa" className="block text-sm font-medium text-gray-700 mb-1">
              Casa/Apartamento
            </label>
            <input
              type="text"
              id="casa"
              value={casa}
              onChange={(e) => setCasa(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Ex: CASA 10, APT 305"
              required
            />
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Salvar</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

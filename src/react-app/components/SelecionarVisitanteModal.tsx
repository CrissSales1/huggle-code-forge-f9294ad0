import { useState } from 'react';
import { Users, Car, Home, User, X } from 'lucide-react';
import Modal from './Modal';
import PlacaVeiculo from './PlacaVeiculo';
import type { VisitanteType } from '@/shared/types';

interface SelecionarVisitanteModalProps {
  isOpen: boolean;
  onClose: () => void;
  visitantes: VisitanteType[];
  placa: string;
  onSelecionarVisitante: (visitante: VisitanteType) => void;
  onCriarNovo: () => void;
}

export default function SelecionarVisitanteModal({
  isOpen,
  onClose,
  visitantes,
  placa,
  onSelecionarVisitante,
  onCriarNovo
}: SelecionarVisitanteModalProps) {
  const [visitanteSelecionado, setVisitanteSelecionado] = useState<VisitanteType | null>(null);

  if (!isOpen || visitantes.length === 0) return null;

  const handleSelecionar = () => {
    if (visitanteSelecionado) {
      onSelecionarVisitante(visitanteSelecionado);
      setVisitanteSelecionado(null);
      onClose();
    }
  };

  const handleCriarNovo = () => {
    onCriarNovo();
    setVisitanteSelecionado(null);
    onClose();
  };

  const handleClose = () => {
    setVisitanteSelecionado(null);
    onClose();
  };

  // Remover duplicatas baseado em nome + casa
  const visitantesUnicos = visitantes.filter((visitante, index, self) => 
    index === self.findIndex(v => 
      v.nome === visitante.nome && v.casa_visitada === visitante.casa_visitada
    )
  );

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Placa Conhecida Encontrada" size="lg">
      <div className="space-y-6">
        {/* Cabeçalho com placa */}
        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
          <div className="flex items-center justify-center space-x-4">
            <Car className="w-6 h-6 text-blue-600" />
            <div className="text-center">
              <h3 className="text-lg font-semibold text-blue-900 mb-2">
                Esta placa já foi cadastrada antes!
              </h3>
              <div className="flex justify-center">
                <PlacaVeiculo placa={placa} size="md" />
              </div>
            </div>
          </div>
        </div>

        {/* Instruções */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <div className="flex items-center space-x-2 mb-2">
            <Users className="w-4 h-4 text-yellow-600" />
            <span className="text-sm font-medium text-yellow-800">
              Escolha uma das opções abaixo:
            </span>
          </div>
          <ul className="text-xs text-yellow-700 space-y-1 ml-6">
            <li>• Selecione um visitante existente para usar os dados cadastrados</li>
            <li>• Ou crie um novo cadastro se for uma pessoa diferente</li>
          </ul>
        </div>

        {/* Lista de visitantes */}
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {visitantesUnicos.map((visitante, index) => (
            <div
              key={index}
              onClick={() => setVisitanteSelecionado(visitante)}
              className={`p-4 border-2 rounded-xl cursor-pointer transition-all duration-200 hover:shadow-md ${
                visitanteSelecionado?.nome === visitante.nome && 
                visitanteSelecionado?.casa_visitada === visitante.casa_visitada
                  ? 'border-blue-500 bg-blue-50 shadow-lg'
                  : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 space-y-2">
                  {/* Nome do visitante */}
                  <div className="flex items-center space-x-2">
                    <User className="w-4 h-4 text-gray-600" />
                    <span className="font-semibold text-gray-900 text-lg">
                      {visitante.nome}
                    </span>
                  </div>
                  
                  {/* Detalhes */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-600">
                    <div className="flex items-center space-x-2">
                      <Home className="w-3 h-3" />
                      <span>Casa: <strong>{visitante.casa_visitada}</strong></span>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Car className="w-3 h-3" />
                      <span>Placa: <strong className="font-mono">{visitante.placa_veiculo}</strong></span>
                    </div>
                  </div>
                  
                  {/* Informações adicionais */}
                  {(visitante.observacoes || visitante.liberado_por) && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      {visitante.observacoes && (
                        <div className="text-xs text-gray-500 mb-1">
                          <strong>Obs:</strong> {visitante.observacoes}
                        </div>
                      )}
                      {visitante.liberado_por && (
                        <div className="text-xs text-gray-500">
                          <strong>Liberado por:</strong> {visitante.liberado_por}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                {/* Indicador de seleção */}
                {visitanteSelecionado?.nome === visitante.nome && 
                 visitanteSelecionado?.casa_visitada === visitante.casa_visitada && (
                  <div className="ml-4 flex-shrink-0">
                    <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full"></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Botões de ação */}
        <div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-3 pt-4 border-t border-gray-200">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center justify-center space-x-2"
          >
            <X className="w-4 h-4" />
            <span>Cancelar</span>
          </button>
          
          <button
            onClick={handleCriarNovo}
            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center justify-center space-x-2"
          >
            <Users className="w-4 h-4" />
            <span>Criar Novo Cadastro</span>
          </button>
          
          <button
            onClick={handleSelecionar}
            disabled={!visitanteSelecionado}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            <User className="w-4 h-4" />
            <span>Usar Dados Selecionados</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}

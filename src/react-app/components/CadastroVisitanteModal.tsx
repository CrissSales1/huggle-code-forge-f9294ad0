import { useState, useEffect, useRef } from 'react';
import { Camera, ChevronDown } from 'lucide-react';
import Modal from './Modal';
import CameraModal from './CameraModal';
import SelecionarVisitanteModal from './SelecionarVisitanteModal';
import { usePrismasDisponiveis, useVisitanteActions } from '@/react-app/hooks/useApi';
import type { VisitanteType } from '@/shared/types';


interface CadastroVisitanteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CadastroVisitanteModal({ isOpen, onClose, onSuccess }: CadastroVisitanteModalProps) {
  const [etapa, setEtapa] = useState<'prisma' | 'dados'>('prisma');
  const [prismaSelecionado, setPrismaSelecionado] = useState<number | null>(null);
  const [nome, setNome] = useState('');
  const [casaVisitada, setCasaVisitada] = useState('');
  const [placaVeiculo, setPlacaVeiculo] = useState('');
  const [estacionarVagaMorador, setEstacionarVagaMorador] = useState(false);
  const [observacoes, setObservacoes] = useState('');
  const [liberadoPor, setLiberadoPor] = useState('');
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [showNomeDropdown, setShowNomeDropdown] = useState(false);
  const [nomeOptions, setNomeOptions] = useState<VisitanteType[]>([]);
  const [searchingNome, setSearchingNome] = useState(false);
  const [showSelecionarVisitante, setShowSelecionarVisitante] = useState(false);
  const [visitantesEncontrados, setVisitantesEncontrados] = useState<VisitanteType[]>([]);
  const [placaPesquisada, setPlacaPesquisada] = useState('');
  
  const nomeInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const { prismas, loading: loadingPrismas, refetch: refetchPrismas } = usePrismasDisponiveis();
  const { cadastrarVisitante, buscarVisitantes, loading, error } = useVisitanteActions();

  // Função para validar formato de placa
  const isValidPlaca = (placa: string): boolean => {
    const placaLimpa = placa.replace(/[^A-Z0-9]/g, '').toUpperCase();
    if (placaLimpa.length !== 7) return false;
    
    // Formato placa antiga: ABC1234 (3 letras + 4 números)
    const formatoAntigo = /^[A-Z]{3}[0-9]{4}$/;
    // Formato placa Mercosul: ABC1A23 (3 letras + 1 número + 1 letra + 2 números)
    const formatoMercosul = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;
    
    return formatoAntigo.test(placaLimpa) || formatoMercosul.test(placaLimpa);
  };

  useEffect(() => {
    if (isOpen) {
      refetchPrismas();
      setEtapa('prisma');
      resetForm();
    }
  }, [isOpen, refetchPrismas]);

  const resetForm = () => {
    setPrismaSelecionado(null);
    setNome('');
    setCasaVisitada('');
    setPlacaVeiculo('');
    setEstacionarVagaMorador(false);
    setObservacoes('');
    setLiberadoPor('');
    setShowCameraModal(false);
    setShowNomeDropdown(false);
    setNomeOptions([]);
    setSearchingNome(false);
    setShowSelecionarVisitante(false);
    setVisitantesEncontrados([]);
    setPlacaPesquisada('');
  };

  const handleSelecionarPrisma = (numeroPrisma: number) => {
    setPrismaSelecionado(numeroPrisma);
    setEtapa('dados');
  };

  // Verificar se placa já existe e mostrar opções
  const handlePlacaChange = async (value: string) => {
    const placaFormatada = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (placaFormatada.length <= 7) {
      setPlacaVeiculo(placaFormatada);
    }

    // Se a placa estiver completa (7 caracteres) e for válida
    if (placaFormatada.length === 7 && isValidPlaca(placaFormatada)) {
      const visitantes = await buscarVisitantes(placaFormatada);
      const visitantesComPlaca = visitantes.filter(v => 
        v.placa_veiculo === placaFormatada
      );
      
      if (visitantesComPlaca.length > 0) {
        // Se já tem dados preenchidos, avisar sobre duplicata
        if (nome || casaVisitada) {
          setVisitantesEncontrados(visitantesComPlaca);
          setPlacaPesquisada(placaFormatada);
          setShowSelecionarVisitante(true);
        } else {
          // Se não tem dados, mostrar opções
          setVisitantesEncontrados(visitantesComPlaca);
          setPlacaPesquisada(placaFormatada);
          setShowSelecionarVisitante(true);
        }
      }
    }
  };

  // Buscar opções para dropdown do nome
  const handleNomeChange = async (value: string) => {
    const upperValue = value.toUpperCase();
    setNome(upperValue);

    if (upperValue.length >= 3) {
      setSearchingNome(true);
      const visitantes = await buscarVisitantes(upperValue);
      const visitantesFiltrados = visitantes.filter(v => 
        v.nome.toLowerCase().includes(upperValue.toLowerCase())
      );
      
      if (visitantesFiltrados.length > 0) {
        // Remover duplicatas baseado em nome + placa + casa
        const visitantesUnicos = visitantesFiltrados.filter((visitante, index, self) => 
          index === self.findIndex(v => 
            v.nome === visitante.nome && 
            v.placa_veiculo === visitante.placa_veiculo && 
            v.casa_visitada === visitante.casa_visitada
          )
        );
        
        setNomeOptions(visitantesUnicos);
        setShowNomeDropdown(true);
      } else {
        setNomeOptions([]);
        setShowNomeDropdown(false);
      }
      setSearchingNome(false);
    } else {
      setNomeOptions([]);
      setShowNomeDropdown(false);
    }
  };

  // Selecionar visitante do dropdown
  const handleSelectVisitante = (visitante: VisitanteType) => {
    setNome(visitante.nome.toUpperCase());
    setPlacaVeiculo(visitante.placa_veiculo);
    setCasaVisitada(visitante.casa_visitada.toUpperCase());
    if (visitante.observacoes) {
      setObservacoes(visitante.observacoes.toUpperCase());
    }
    if (visitante.liberado_por) {
      setLiberadoPor(visitante.liberado_por.toUpperCase());
    }
    setShowNomeDropdown(false);
    setNomeOptions([]);
  };

  // Fechar dropdown quando clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
          nomeInputRef.current && !nomeInputRef.current.contains(event.target as Node)) {
        setShowNomeDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!prismaSelecionado) return;
    
    // Validar formato da placa antes de enviar
    if (!isValidPlaca(placaVeiculo)) {
      alert('Formato de placa inválido. Use o formato ABC1234 ou ABC1A23');
      return;
    }

    const sucesso = await cadastrarVisitante({
      nome: nome.trim(),
      casa_visitada: casaVisitada.trim(),
      placa_veiculo: placaVeiculo.trim().toUpperCase(),
      numero_prisma: prismaSelecionado,
      estacionar_vaga_morador: estacionarVagaMorador,
      observacoes: observacoes.trim() || undefined,
      liberado_por: liberadoPor.trim() || undefined,
    });

    if (sucesso) {
      onSuccess();
      onClose();
      resetForm();
    }
  };

  const handleClose = () => {
    onClose();
    resetForm();
  };

  const handlePlacaFromCamera = async (placa: string) => {
    setPlacaVeiculo(placa);
    
    // Verificar se a placa reconhecida já existe no sistema
    if (placa.length === 7 && isValidPlaca(placa)) {
      const visitantes = await buscarVisitantes(placa);
      const visitantesComPlaca = visitantes.filter(v => 
        v.placa_veiculo === placa
      );
      
      if (visitantesComPlaca.length > 0) {
        // Mostrar modal de seleção sempre que encontrar placa conhecida
        setVisitantesEncontrados(visitantesComPlaca);
        setPlacaPesquisada(placa);
        setShowSelecionarVisitante(true);
      }
    }
  };

  const handleVoltar = () => {
    setEtapa('prisma');
    setPrismaSelecionado(null);
  };

  // Função para quando o usuário seleciona um visitante existente
  const handleSelecionarVisitanteExistente = (visitante: VisitanteType) => {
    setNome(visitante.nome.toUpperCase());
    setCasaVisitada(visitante.casa_visitada.toUpperCase());
    setPlacaVeiculo(visitante.placa_veiculo);
    if (visitante.observacoes) {
      setObservacoes(visitante.observacoes.toUpperCase());
    }
    if (visitante.liberado_por) {
      setLiberadoPor(visitante.liberado_por.toUpperCase());
    }
    setShowSelecionarVisitante(false);
  };

  // Função para criar novo cadastro mantendo apenas a placa
  const handleCriarNovoCadastro = () => {
    // Manter apenas a placa, limpar outros dados
    const placaAtual = placaPesquisada;
    setNome('');
    setCasaVisitada('');
    setObservacoes('');
    setLiberadoPor('');
    setPlacaVeiculo(placaAtual);
    setShowSelecionarVisitante(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Novo Cadastro de Visitante" size="lg">
      {etapa === 'prisma' && (
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            1. Selecionar Prisma Magnético
          </h3>
          
          {loadingPrismas ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-500">Carregando prismas...</p>
            </div>
          ) : prismas.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-red-600">Nenhum prisma disponível no momento.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2 lg:gap-3">
              {prismas.map((prisma) => (
                <button
                  key={prisma.id}
                  onClick={() => handleSelecionarPrisma(prisma.numero)}
                  className="p-3 lg:p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all duration-300 text-center transform hover:scale-105"
                >
                  {/* Prisma 3D estilizado */}
                  <div className="flex justify-center mb-2">
                    <div className="relative w-10 h-10 lg:w-12 lg:h-12">
                      {/* Face frontal do prisma */}
                      <div className="absolute inset-0 bg-gradient-to-br from-orange-400 to-orange-600 rounded-lg transform perspective-1000 shadow-lg border border-orange-500">
                        {/* Face lateral direita (efeito 3D) */}
                        <div className="absolute top-0 right-0 w-2 h-full bg-gradient-to-b from-orange-500 to-orange-700 transform skew-y-12 origin-top-right rounded-r-lg"></div>
                        {/* Face superior (efeito 3D) */}
                        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-orange-300 to-orange-500 transform skew-x-12 origin-top-left rounded-t-lg"></div>
                        
                        {/* Número do prisma centralizado */}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="font-black text-white text-lg lg:text-xl drop-shadow-lg tracking-tight" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                            {prisma.numero}
                          </span>
                        </div>
                        
                        {/* Brilho/highlight no prisma */}
                        <div className="absolute top-1 left-1 w-3 h-3 bg-white opacity-30 rounded-full blur-sm"></div>
                      </div>
                    </div>
                  </div>
                  <span className="text-xs lg:text-sm text-gray-600 font-medium">Prisma {prisma.numero}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {etapa === 'dados' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              2. Dados do Visitante
            </h3>
            <div className="flex items-center space-x-3 text-sm text-gray-600">
              <span>Prisma selecionado:</span>
              <div className="relative">
                {/* Prisma 3D em laranja */}
                <div className="relative w-8 h-8">
                  {/* Face frontal do prisma */}
                  <div className="absolute inset-0 bg-gradient-to-br from-orange-400 to-orange-600 rounded-lg transform perspective-1000 shadow-lg border border-orange-500">
                    {/* Face lateral direita (efeito 3D) */}
                    <div className="absolute top-0 right-0 w-1.5 h-full bg-gradient-to-b from-orange-500 to-orange-700 transform skew-y-12 origin-top-right rounded-r-lg"></div>
                    {/* Face superior (efeito 3D) */}
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-orange-300 to-orange-500 transform skew-x-12 origin-top-left rounded-t-lg"></div>
                    
                    {/* Número do prisma centralizado */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="font-black text-white text-sm drop-shadow-lg tracking-tight" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                        {prismaSelecionado}
                      </span>
                    </div>
                    
                    {/* Brilho/highlight no prisma */}
                    <div className="absolute top-0.5 left-0.5 w-2 h-2 bg-white opacity-30 rounded-full blur-sm"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <div className="relative">
              <label htmlFor="nome" className="block text-sm font-medium text-gray-700 mb-2">
                Nome do Visitante *
              </label>
              <div className="relative">
                <input
                  ref={nomeInputRef}
                  type="text"
                  id="nome"
                  value={nome}
                  onChange={(e) => handleNomeChange(e.target.value)}
                  className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase"
                  placeholder="Digite o nome (mostra opções se já cadastrado)"
                  required
                />
                {searchingNome && (
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
                {nomeOptions.length > 0 && !searchingNome && (
                  <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                )}
              </div>
              
              {/* Dropdown de opções do nome */}
              {showNomeDropdown && nomeOptions.length > 0 && (
                <div 
                  ref={dropdownRef}
                  className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto"
                >
                  {nomeOptions.map((visitante, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => handleSelectVisitante(visitante)}
                      className="w-full px-4 py-3 text-left hover:bg-blue-50 focus:bg-blue-50 focus:outline-none border-b border-gray-100 last:border-b-0"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-gray-900 uppercase">
                            {visitante.nome}
                          </div>
                          <div className="text-sm text-gray-600 flex items-center space-x-4 mt-1">
                            <span className="flex items-center">
                              <span className="font-medium">Casa:</span>
                              <span className="ml-1 font-bold">{visitante.casa_visitada}</span>
                            </span>
                            <span className="flex items-center">
                              <span className="font-medium">Placa:</span>
                              <span className="ml-1 font-mono font-bold">{visitante.placa_veiculo}</span>
                            </span>
                          </div>
                        </div>
                        <ChevronDown className="w-4 h-4 text-gray-400 transform rotate-[-90deg]" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Casa Visitada e Placa do Veículo lado a lado */}
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-3">
                <label htmlFor="casa" className="block text-sm font-medium text-gray-700 mb-2">
                  Casa *
                </label>
                <input
                  type="text"
                  id="casa"
                  value={casaVisitada}
                  onChange={(e) => setCasaVisitada(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase text-center font-bold"
                  placeholder="123"
                  maxLength={3}
                  required
                />
              </div>
              
              <div className="col-span-9">
                <label htmlFor="placa" className="block text-sm font-medium text-gray-700 mb-2">
                  Placa do Veículo *
                </label>
                <div className="flex space-x-2">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      id="placa"
                      value={placaVeiculo}
                      onChange={(e) => handlePlacaChange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase tracking-wider font-mono"
                      placeholder="ABC1234 ou ABC1A23"
                      maxLength={7}
                      required
                    />
                    {placaVeiculo && !isValidPlaca(placaVeiculo) && (
                      <div className="absolute top-full left-0 mt-1 text-xs text-red-600">
                        Formato inválido. Use ABC1234 ou ABC1A23
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCameraModal(true)}
                    className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-1 whitespace-nowrap"
                    title="Ler placa com câmera"
                  >
                    <Camera className="w-4 h-4" />
                    <span className="hidden sm:inline">Ler Placa</span>
                  </button>
                </div>
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

            {/* Opção de estacionar na vaga do morador - DESTAQUE MÁXIMO */}
            <div className="bg-gradient-to-r from-orange-100 to-yellow-100 border-2 lg:border-4 border-orange-400 rounded-xl p-3 lg:p-6 space-y-3 lg:space-y-4 shadow-lg">
              <div className="flex items-center justify-center mb-2">
                <div className="bg-gradient-to-r from-orange-600 to-red-600 text-white px-2 lg:px-4 py-1 lg:py-2 rounded-full text-xs lg:text-sm font-black uppercase tracking-wider shadow-lg animate-pulse">
                  🚨 PERGUNTA OBRIGATÓRIA 🚨
                </div>
              </div>
              
              <div className="text-center bg-white rounded-lg p-2 lg:p-4 border-2 border-orange-300">
                <h4 className="text-orange-900 font-black text-sm lg:text-lg mb-2 lg:mb-4 uppercase">
                  🅿️ ONDE VAI ESTACIONAR? 🅿️
                </h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 lg:gap-4">
                  <button
                    type="button"
                    onClick={() => setEstacionarVagaMorador(false)}
                    className={`py-3 lg:py-6 px-2 lg:px-4 rounded-xl font-black text-sm lg:text-lg transition-all duration-300 border-2 lg:border-4 ${
                      !estacionarVagaMorador
                        ? 'bg-green-500 text-white border-green-600 shadow-2xl transform lg:scale-110 ring-2 lg:ring-4 ring-green-300'
                        : 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200 hover:scale-105'
                    }`}
                  >
                    <div className="text-2xl lg:text-4xl mb-1 lg:mb-2">🅿️</div>
                    <div className="text-sm lg:text-xl font-black leading-tight">VAGA COMUM</div>
                    <div className="text-xs lg:text-sm font-normal mt-0.5 lg:mt-1">Área de visitantes</div>
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => setEstacionarVagaMorador(true)}
                    className={`py-3 lg:py-6 px-2 lg:px-4 rounded-xl font-black text-sm lg:text-lg transition-all duration-300 border-2 lg:border-4 ${
                      estacionarVagaMorador
                        ? 'bg-orange-500 text-white border-orange-600 shadow-2xl transform lg:scale-110 ring-2 lg:ring-4 ring-orange-300'
                        : 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200 hover:scale-105'
                    }`}
                  >
                    <div className="text-2xl lg:text-4xl mb-1 lg:mb-2">🏠</div>
                    <div className="text-sm lg:text-xl font-black leading-tight">VAGA MORADOR</div>
                    <div className="text-xs lg:text-sm font-normal mt-0.5 lg:mt-1">Vaga particular</div>
                  </button>
                </div>
              </div>
              
              <div className="text-center bg-white rounded-lg p-2 lg:p-3 border-2 border-orange-300">
                <p className={`text-sm lg:text-lg font-bold leading-tight ${estacionarVagaMorador ? 'text-orange-700' : 'text-green-700'}`}>
                  {estacionarVagaMorador ? 
                    "🚨 AUTORIZADO: Vaga do próprio morador" : 
                    "✅ PADRÃO: Vaga comum de visitantes"
                  }
                </p>
              </div>
            </div>

            <div className="flex justify-between pt-4">
              <button
                type="button"
                onClick={handleVoltar}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                disabled={loading}
              >
                Voltar
              </button>
              
              <div className="space-x-3">
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
                  {loading ? 'Cadastrando...' : 'Finalizar Cadastro'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <CameraModal
        isOpen={showCameraModal}
        onClose={() => setShowCameraModal(false)}
        onPlacaDetected={handlePlacaFromCamera}
      />
      
      <SelecionarVisitanteModal
        isOpen={showSelecionarVisitante}
        onClose={() => setShowSelecionarVisitante(false)}
        visitantes={visitantesEncontrados}
        placa={placaPesquisada}
        onSelecionarVisitante={handleSelecionarVisitanteExistente}
        onCriarNovo={handleCriarNovoCadastro}
      />
    </Modal>
  );
}

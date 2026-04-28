import { useState, useEffect, useRef } from 'react';
import { Camera, ChevronDown, ArrowLeft, Pencil, AlertTriangle, UserCheck, Home } from 'lucide-react';
import Modal from './Modal';
import CameraModal from './CameraModal';
import SelecionarVisitanteModal from './SelecionarVisitanteModal';
import PrismaBadge from './PrismaBadge';
import { usePrismasDisponiveis, useVisitanteActions } from '@/react-app/hooks/useApi';
import { normalizarNumeroCasa } from '@/react-app/utils/formatters';
import { encontrarNomeCanonical, nomesSimilares } from '@/react-app/utils/stringUtils';
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

    const placaFinal = placaVeiculo.trim().toUpperCase();
    let nomeFinal = nome.trim();

    // Normalização silenciosa: se a placa já existe em cadastros anteriores
    // e o nome digitado é similar ao nome canônico desses cadastros,
    // reaproveitar a grafia canônica para preservar agrupamento em estatísticas.
    try {
      const anteriores = await buscarVisitantes(placaFinal);
      const mesmaPlaca = anteriores.filter(v => v.placa_veiculo === placaFinal);
      if (mesmaPlaca.length > 0) {
        const canonical = encontrarNomeCanonical(mesmaPlaca.map(v => v.nome));
        if (canonical && nomesSimilares(canonical, nomeFinal, 85)) {
          nomeFinal = canonical;
        }
      }
    } catch {
      // Falha silenciosa — segue com o nome digitado
    }

    const sucesso = await cadastrarVisitante({
      nome: nomeFinal,
      casa_visitada: normalizarNumeroCasa(casaVisitada.trim()),
      placa_veiculo: placaFinal,
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

  // Stepper M3
  const Stepper = () => (
    <div className="flex items-center gap-sm mb-lg px-1">
      <div className={`flex items-center gap-sm ${etapa === 'prisma' ? 'text-primary' : 'text-on-surface-variant'}`}>
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-button font-semibold ${
          etapa === 'prisma' ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'
        }`}>1</div>
        <span className="text-body-sm font-medium hidden sm:inline">Identificação do Prisma</span>
        <span className="text-body-sm font-medium sm:hidden">Prisma</span>
      </div>
      <div className="flex-1 h-px bg-outline-variant" />
      <div className={`flex items-center gap-sm ${etapa === 'dados' ? 'text-primary' : 'text-on-surface-variant'}`}>
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-button font-semibold ${
          etapa === 'dados' ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'
        }`}>2</div>
        <span className="text-body-sm font-medium hidden sm:inline">Dados do Visitante</span>
        <span className="text-body-sm font-medium sm:hidden">Dados</span>
      </div>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Novo Cadastro de Visitante" size="lg">
      <Stepper />

      {etapa === 'prisma' && (
        <div>
          <div className="mb-md">
            <h3 className="text-h3 text-on-surface">Selecione um prisma magnético</h3>
            <p className="text-body-sm text-on-surface-variant mt-1">
              Escolha um prisma livre para identificar o visitante.
            </p>
          </div>

          {loadingPrismas ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent mx-auto"></div>
              <p className="mt-3 text-body-sm text-on-surface-variant">Carregando prismas...</p>
            </div>
          ) : prismas.length === 0 ? (
            <div className="text-center py-12 bg-error-container/40 rounded-card">
              <AlertTriangle className="w-8 h-8 text-error mx-auto mb-2" />
              <p className="text-body-md text-on-error-container font-medium">Nenhum prisma disponível</p>
              <p className="text-body-sm text-on-surface-variant mt-1">Libere um prisma em uso para cadastrar novo visitante.</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 gap-sm">
              {prismas.map((prisma) => (
                <button
                  key={prisma.id}
                  onClick={() => handleSelecionarPrisma(prisma.numero)}
                  className="group aspect-square flex flex-col items-center justify-center gap-1 rounded-card border border-outline-variant bg-surface-container-low hover:bg-primary-container/20 hover:border-primary hover:shadow-ambient-2 hover:-translate-y-0.5 transition-all p-2"
                >
                  <PrismaBadge
                    numero={prisma.numero}
                    size="lg"
                    withGroundShadow
                    className="group-hover:scale-105 transition-transform"
                  />
                  <span className="text-label-caps text-on-surface-variant uppercase mt-1">Prisma</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {etapa === 'dados' && (
        <div>
          <div className="flex items-center justify-between mb-sm">
            <h3 className="text-body-md font-semibold text-on-surface">Dados do visitante</h3>
            {/* Prisma 3D selecionado — clicável para trocar */}
            <button
              type="button"
              onClick={handleVoltar}
              className="group inline-flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-surface-container-low border border-outline-variant hover:bg-surface-container hover:border-primary/50 hover:shadow-ambient-1 transition-all"
              title="Clique para trocar o prisma"
            >
              <PrismaBadge numero={prismaSelecionado} size="sm" />
              <span className="text-button font-semibold text-on-surface">Trocar</span>
              <Pencil className="w-3.5 h-3.5 text-on-surface-variant opacity-70 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {error && (
              <div className="flex items-start gap-2 bg-error-container/40 border border-error/30 text-on-error-container px-4 py-3 rounded-btn">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-error" />
                <span className="text-body-sm">{error}</span>
              </div>
            )}

            <div className="relative">
              <label htmlFor="nome" className="block text-label-caps uppercase text-on-surface-variant mb-1.5">
                Nome do visitante *
              </label>
              <div className="relative">
                <input
                  ref={nomeInputRef}
                  type="text"
                  id="nome"
                  value={nome}
                  onChange={(e) => handleNomeChange(e.target.value)}
                  className="w-full px-3 py-2.5 pr-9 border border-outline-variant rounded-btn bg-surface-container-lowest text-on-surface uppercase placeholder:normal-case placeholder:text-on-surface-variant/60 focus:border-primary"
                  placeholder="Digite o nome para buscar ou cadastrar..."
                  required
                />
                {searchingNome && (
                  <div className="absolute right-2.5 top-1/2 transform -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
                {nomeOptions.length > 0 && !searchingNome && (
                  <ChevronDown className="absolute right-2.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
                )}
              </div>
              
              {/* Dropdown de opções do nome */}
              {showNomeDropdown && nomeOptions.length > 0 && (
                <div 
                  ref={dropdownRef}
                  className="absolute z-10 w-full mt-1 bg-surface-container-lowest border border-outline-variant rounded-card shadow-ambient-2 max-h-64 overflow-y-auto"
                >
                  {nomeOptions.map((visitante, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => handleSelectVisitante(visitante)}
                      className="w-full px-4 py-3 text-left hover:bg-primary-container/30 focus:bg-primary-container/30 focus:outline-none border-b border-outline-variant/30 last:border-b-0 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-body-md font-semibold text-on-surface uppercase truncate">
                            {visitante.nome}
                          </div>
                          <div className="text-body-sm text-on-surface-variant flex items-center gap-4 mt-0.5">
                            <span>Casa: <strong className="text-on-surface">{visitante.casa_visitada}</strong></span>
                            <span>Placa: <strong className="font-mono text-on-surface">{visitante.placa_veiculo}</strong></span>
                          </div>
                        </div>
                        <ChevronDown className="w-4 h-4 text-on-surface-variant transform rotate-[-90deg] flex-shrink-0" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Casa Visitada e Placa do Veículo lado a lado */}
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
              
              <div className="col-span-9">
                <label htmlFor="placa" className="block text-label-caps uppercase text-on-surface-variant mb-1.5">
                  Placa do veículo *
                </label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      id="placa"
                      value={placaVeiculo}
                      onChange={(e) => handlePlacaChange(e.target.value)}
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
                  <button
                    type="button"
                    onClick={() => setShowCameraModal(true)}
                    className="px-4 py-2.5 bg-secondary text-on-secondary rounded-btn hover:bg-on-secondary-fixed-variant hover:shadow-ambient-2 transition-all flex items-center gap-2 whitespace-nowrap text-button font-semibold"
                    title="Ler placa com câmera"
                  >
                    <Camera className="w-4 h-4" />
                    <span className="hidden sm:inline">Ler Placa (OCR)</span>
                  </button>
                </div>
              </div>
            </div>

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

            {/* Onde vai estacionar? — versão compacta inline */}
            <div className="pt-1">
              <label className="block text-label-caps uppercase text-on-surface-variant mb-1.5">
                Onde vai estacionar?
              </label>
              <div className="grid grid-cols-2 gap-2">
                {/* Vaga Comum */}
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

                {/* Vaga Morador */}
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

            <div className="flex items-center justify-between pt-3 border-t border-outline-variant/30">
              <button
                type="button"
                onClick={handleVoltar}
                className="inline-flex items-center gap-2 px-3 py-2 text-button font-semibold text-primary hover:bg-primary-container/40 rounded-btn transition-colors"
                disabled={loading}
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Trocar Prisma</span>
              </button>

              <div className="flex items-center gap-2">
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
                      <span>Cadastrando...</span>
                    </>
                  ) : (
                    <>
                      <UserCheck className="w-4 h-4" />
                      <span>Finalizar Cadastro</span>
                    </>
                  )}
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

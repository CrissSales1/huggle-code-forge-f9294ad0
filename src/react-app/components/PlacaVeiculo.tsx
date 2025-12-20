interface PlacaVeiculoProps {
  placa: string;
  size?: 'sm' | 'md' | 'lg';
}

// Função para detectar se é placa Mercosul
const isMercosul = (placa: string): boolean => {
  // Remove espaços e converte para maiúsculo
  const placaLimpa = placa.replace(/\s/g, '').toUpperCase();
  
  // Formato Mercosul: ABC1B34 (3 letras, 1 número, 1 letra, 2 números)
  const mercosulPattern = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;
  
  return mercosulPattern.test(placaLimpa);
};

// Função para formatar a placa
const formatarPlaca = (placa: string): string => {
  const placaLimpa = placa.replace(/\s/g, '').toUpperCase();
  
  if (isMercosul(placaLimpa)) {
    // Formato Mercosul: ABC1B34 -> ABC1B34 (sem hífen)
    return placaLimpa;
  } else {
    // Formato antigo: ABC1234 -> ABC-1234 (com hífen)
    if (placaLimpa.length === 7 && !placaLimpa.includes('-')) {
      return `${placaLimpa.slice(0, 3)}-${placaLimpa.slice(3)}`;
    }
    return placaLimpa;
  }
};

export default function PlacaVeiculo({ placa, size = 'md' }: PlacaVeiculoProps) {
  const placaFormatada = formatarPlaca(placa);
  const mercosul = isMercosul(placa);
  
  // Tamanhos realistas baseados na proporção das placas brasileiras (400x130mm)
  const sizes = {
    sm: {
      container: 'w-28 h-9',
      font: 'text-xs',
      brasilFont: 'text-[8px]',
      flagSize: 'w-3 h-2',
      headerHeight: 'h-3',
      mainHeight: 'h-5',
      spacing: 'tracking-wide',
      padding: 'px-2 py-1'
    },
    md: {
      container: 'w-36 h-12',
      font: 'text-base',
      brasilFont: 'text-[10px]',
      flagSize: 'w-4 h-2.5',
      headerHeight: 'h-3.5',
      mainHeight: 'h-7',
      spacing: 'tracking-wide',
      padding: 'px-3 py-1.5'
    },
    lg: {
      container: 'w-44 h-14',
      font: 'text-lg',
      brasilFont: 'text-xs',
      flagSize: 'w-5 h-3',
      headerHeight: 'h-4',
      mainHeight: 'h-9',
      spacing: 'tracking-wide',
      padding: 'px-4 py-2'
    }
  };
  
  const sizeClasses = sizes[size];

  if (mercosul) {
    return (
      <div className={`relative ${sizeClasses.container} bg-white border-2 border-gray-800 rounded-md shadow-lg drop-shadow-xl overflow-hidden flex flex-col transform hover:scale-105 transition-transform duration-200`}
           style={{ fontFamily: 'Arial, sans-serif', aspectRatio: '400/130' }}>
        
        {/* Faixa azul superior estilo Mercosul */}
        <div className={`bg-blue-700 text-white flex items-center justify-center ${sizeClasses.padding} ${sizeClasses.headerHeight} relative`}>
          {/* Bandeira do Brasil - simplificada mas fiel */}
          <div className="flex items-center space-x-2">
            <div className="relative">
              <svg className={`${sizeClasses.flagSize}`} viewBox="0 0 20 14">
                {/* Fundo verde */}
                <rect width="20" height="14" fill="#009639"/>
                {/* Losango amarelo */}
                <path d="M10 1 L18 7 L10 13 L2 7 Z" fill="#FFDF00"/>
                {/* Círculo azul */}
                <circle cx="10" cy="7" r="4" fill="#002776"/>
              </svg>
            </div>
            <span className={`${sizeClasses.brasilFont} font-bold text-white`}>
              BRASIL
            </span>
          </div>
        </div>
        
        {/* Área principal da placa - placa centralizada */}
        <div className={`${sizeClasses.mainHeight} flex items-center justify-center bg-white relative ${sizeClasses.padding}`}>
          {/* Placa centralizada */}
          <span className={`${sizeClasses.font} font-black text-black ${sizeClasses.spacing} select-none`}
                style={{ fontFamily: 'Arial, sans-serif', letterSpacing: '0.1em' }}>
            {placaFormatada}
          </span>
          
          {/* QR Code no canto inferior esquerdo */}
          <div className="absolute bottom-1 left-1">
            <div className="grid grid-cols-3 gap-px w-2 h-2 opacity-60">
              <div className="bg-black w-0.5 h-0.5"></div>
              <div className="bg-white w-0.5 h-0.5"></div>
              <div className="bg-black w-0.5 h-0.5"></div>
              <div className="bg-white w-0.5 h-0.5"></div>
              <div className="bg-black w-0.5 h-0.5"></div>
              <div className="bg-white w-0.5 h-0.5"></div>
              <div className="bg-black w-0.5 h-0.5"></div>
              <div className="bg-white w-0.5 h-0.5"></div>
              <div className="bg-black w-0.5 h-0.5"></div>
            </div>
          </div>
        </div>
      </div>
    );
  } else {
    // Placa antiga - formato fiel à imagem
    return (
      <div className={`relative ${sizeClasses.container} bg-gray-200 border-2 border-gray-700 rounded-md shadow-lg drop-shadow-xl overflow-hidden flex flex-col transform hover:scale-105 transition-transform duration-200`}
           style={{ fontFamily: 'Arial, sans-serif', aspectRatio: '400/130' }}>
        
        {/* Header com estado e município (simplificado) */}
        <div className={`bg-gray-300 text-gray-800 flex items-center justify-center ${sizeClasses.headerHeight} border-b border-gray-400 py-1`}>
          <span className={`${sizeClasses.brasilFont} font-bold leading-none`}>
            BR - BRASIL
          </span>
        </div>
        
        {/* Área principal da placa */}
        <div className={`${sizeClasses.mainHeight} flex items-center justify-center bg-white relative ${sizeClasses.padding}`}>
          <span className={`${sizeClasses.font} font-black text-black ${sizeClasses.spacing} select-none`}
                style={{ 
                  fontFamily: 'Arial, sans-serif', 
                  letterSpacing: '0.1em',
                  textShadow: '0 1px 1px rgba(0,0,0,0.1)'
                }}>
            {placaFormatada}
          </span>
        </div>
      </div>
    );
  }
}

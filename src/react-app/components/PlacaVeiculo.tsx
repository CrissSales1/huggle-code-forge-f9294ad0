interface PlacaVeiculoProps {
  placa: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const isMercosul = (placa: string): boolean => {
  const placaLimpa = placa.replace(/\s/g, '').toUpperCase();
  return /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(placaLimpa);
};

const formatarPlaca = (placa: string): string => {
  const placaLimpa = placa.replace(/\s/g, '').toUpperCase();
  if (isMercosul(placaLimpa)) return placaLimpa;
  if (placaLimpa.length === 7 && !placaLimpa.includes('-')) {
    return `${placaLimpa.slice(0, 3)}-${placaLimpa.slice(3)}`;
  }
  return placaLimpa;
};

export default function PlacaVeiculo({ placa, size = 'md' }: PlacaVeiculoProps) {
  const placaFormatada = formatarPlaca(placa);

  const sizes = {
    sm: { container: 'w-28', headerText: 'text-[8px]', plate: 'text-sm py-1' },
    md: { container: 'w-36', headerText: 'text-[9px]', plate: 'text-base py-1.5' },
    lg: { container: 'w-44', headerText: 'text-[10px]', plate: 'text-lg py-2' },
    xl: { container: 'w-64', headerText: 'text-xs', plate: 'text-3xl py-3' },
  };
  const s = sizes[size];

  return (
    <div className={`${s.container} bg-white border-2 border-outline-variant rounded-md overflow-hidden flex flex-col shadow-ambient-1 hover:shadow-ambient-2 transition-shadow duration-200`}>
      {/* Faixa superior estilo Mercosul */}
      <div className={`bg-primary text-white ${s.headerText} font-bold text-center tracking-widest flex items-center justify-between px-2 py-0.5`}>
        <span>BR</span>
        <span>BRASIL</span>
      </div>
      {/* Número da placa */}
      <div className={`text-center font-mono font-bold ${s.plate} text-on-surface tracking-wider bg-white`}
           style={{ fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', letterSpacing: '0.1em' }}>
        {placaFormatada}
      </div>
    </div>
  );
}

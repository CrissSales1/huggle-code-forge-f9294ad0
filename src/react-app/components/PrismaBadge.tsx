import { useId } from 'react';

type PrismaSize = 'sm' | 'md' | 'lg' | 'xl';
type PrismaVariant = 'orange' | 'error';

interface PrismaBadgeProps {
  numero: number | string | null | undefined;
  size?: PrismaSize;
  variant?: PrismaVariant;
  withGroundShadow?: boolean;
  className?: string;
}

/**
 * Visual 3D do prisma magnético usado no condomínio.
 * Reproduz a forma trapezoidal (base larga, topo estreito), brilho
 * vinílico e número escuro impresso, igual ao item físico.
 *
 * Implementado com clip-path + gradientes — sem libs 3D.
 */
export default function PrismaBadge({
  numero,
  size = 'md',
  variant = 'orange',
  withGroundShadow = false,
  className = '',
}: PrismaBadgeProps) {
  const reactId = useId();
  // clip-path único por instância (evita conflitos de id ao reutilizar)
  void reactId;

  // Dimensões por tamanho (largura x altura). A base trapezoidal é mais larga
  // que a altura — proporção ~1.25:1 para imitar o item físico.
  const dims: Record<PrismaSize, { w: string; h: string; font: string; numberOffset: string }> = {
    sm: { w: '3.25rem', h: '2.6rem', font: '1.05rem', numberOffset: '12%' },
    md: { w: '4rem', h: '3.2rem', font: '1.4rem', numberOffset: '12%' },
    lg: { w: '5.25rem', h: '4.2rem', font: '1.95rem', numberOffset: '14%' },
    xl: { w: '7rem', h: '5.6rem', font: '2.6rem', numberOffset: '14%' },
  };

  // Paleta por variant (laranja vinílico vs vermelho de alerta)
  const palette = variant === 'error'
    ? {
        face: 'linear-gradient(160deg, #F26B5C 0%, #D6291A 48%, #8E0E07 100%)',
        topRim: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 100%)',
      }
    : {
        face: 'linear-gradient(160deg, #FF9A4A 0%, #F36F1A 45%, #B84507 100%)',
        topRim: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 100%)',
      };

  const clipPath = 'polygon(18% 0%, 82% 0%, 100% 100%, 0% 100%)';
  const { w, h, font, numberOffset } = dims[size];

  const display =
    numero === null || numero === undefined || numero === '' ? '?' : String(numero);

  return (
    <div
      className={`relative inline-block ${className}`}
      style={{ width: w, height: withGroundShadow ? `calc(${h} + 0.4rem)` : h }}
      aria-label={`Prisma ${display}`}
    >
      {/* Wrapper do prisma com sombra projetada que respeita o clip */}
      <div
        className="relative"
        style={{
          width: w,
          height: h,
          filter:
            'drop-shadow(0 4px 6px rgba(0,0,0,0.28)) drop-shadow(0 1px 1px rgba(0,0,0,0.18))',
        }}
      >
        {/* Face frontal do prisma (cor base + gradiente) */}
        <div
          className="absolute inset-0"
          style={{
            clipPath,
            background: palette.face,
          }}
        />

        {/* Brilho vinílico vertical à esquerda (highlight especular) */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            clipPath,
            background:
              'linear-gradient(105deg, transparent 6%, rgba(255,255,255,0.55) 12%, rgba(255,255,255,0.15) 18%, transparent 26%)',
            mixBlendMode: 'screen',
          }}
        />

        {/* Sombreamento lateral direito para sensação de volume */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            clipPath,
            background:
              'linear-gradient(90deg, transparent 55%, rgba(0,0,0,0.18) 85%, rgba(0,0,0,0.32) 100%)',
          }}
        />

        {/* Vinco/costura escura no topo (dobra do "saquinho") */}
        <div
          className="absolute left-0 right-0 top-0 pointer-events-none"
          style={{
            clipPath,
            height: '22%',
            background: palette.topRim,
            opacity: 0.55,
          }}
        />

        {/* Reflexo claro logo abaixo do vinco (luz batendo no topo curvo) */}
        <div
          className="absolute pointer-events-none"
          style={{
            clipPath,
            inset: 0,
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.08) 12%, transparent 22%)',
          }}
        />

        {/* Número impresso */}
        <span
          className="absolute inset-0 flex items-center justify-center font-black select-none"
          style={{
            color: '#141414',
            fontSize: font,
            lineHeight: 1,
            letterSpacing: '-0.02em',
            transform: `translateY(${numberOffset})`,
            textShadow: '0 1px 0 rgba(255,255,255,0.12)',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          {display}
        </span>
      </div>

      {/* Sombra de chão opcional (elipse difusa) */}
      {withGroundShadow && (
        <div
          aria-hidden
          className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
          style={{
            bottom: 0,
            width: '85%',
            height: '0.45rem',
            background:
              'radial-gradient(ellipse at center, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 70%)',
            filter: 'blur(2px)',
          }}
        />
      )}
    </div>
  );
}

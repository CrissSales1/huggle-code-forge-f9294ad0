import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'red';
  subtitle?: string;
  loading?: boolean;
}

// Mapeia cor lógica para classes do design M3 (mantém a API anterior).
// Inclui borda lateral colorida + barra inferior para reforçar a identidade.
const palettes: Record<
  string,
  { iconBg: string; iconText: string; sideBorder: string; bottomBar: string; ring: string }
> = {
  green: {
    iconBg: 'bg-[#E8F5E9]',
    iconText: 'text-[#2E7D32]',
    sideBorder: 'border-l-[#2E7D32]',
    bottomBar: 'bg-[#2E7D32]',
    ring: 'ring-[#2E7D32]/10',
  },
  blue: {
    iconBg: 'bg-[#E3F2FD]',
    iconText: 'text-[#1565C0]',
    sideBorder: 'border-l-[#1565C0]',
    bottomBar: 'bg-[#1565C0]',
    ring: 'ring-[#1565C0]/10',
  },
  purple: {
    iconBg: 'bg-[#F3E5F5]',
    iconText: 'text-[#7B1FA2]',
    sideBorder: 'border-l-[#7B1FA2]',
    bottomBar: 'bg-[#7B1FA2]',
    ring: 'ring-[#7B1FA2]/10',
  },
  orange: {
    iconBg: 'bg-[#FFF3E0]',
    iconText: 'text-[#E65100]',
    sideBorder: 'border-l-[#E65100]',
    bottomBar: 'bg-[#E65100]',
    ring: 'ring-[#E65100]/10',
  },
  red: {
    iconBg: 'bg-[#FFEBEE]',
    iconText: 'text-[#C62828]',
    sideBorder: 'border-l-[#C62828]',
    bottomBar: 'bg-[#C62828]',
    ring: 'ring-[#C62828]/10',
  },
};

export default function StatsCard({
  title,
  value,
  icon: Icon,
  color = 'blue',
  subtitle,
  loading,
}: StatsCardProps) {
  const palette = palettes[color] ?? palettes.blue;

  return (
    <div
      className={`group relative overflow-hidden bg-surface-container-lowest rounded-card p-lg shadow-ambient-1 border border-outline-variant/40 border-l-4 ${palette.sideBorder} hover:shadow-ambient-2 hover:-translate-y-0.5 transition-all duration-300`}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-body-sm text-on-surface-variant font-medium leading-tight">
          {title}
        </h3>
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 shadow-ambient-1 ring-4 ${palette.ring} ${palette.iconBg} ${palette.iconText}`}
        >
          <Icon className="w-6 h-6" />
        </div>
      </div>
      <div className="flex items-end gap-2">
        {loading ? (
          <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary" />
        ) : (
          <>
            <span className="text-h1 font-bold text-on-surface leading-none">{value}</span>
            {subtitle && (
              <span className="text-body-sm text-on-surface-variant mb-1">{subtitle}</span>
            )}
          </>
        )}
      </div>

      {/* Barra inferior colorida — sutil acento que aparece no hover */}
      <span
        className={`absolute left-0 right-0 bottom-0 h-1 ${palette.bottomBar} opacity-60 group-hover:opacity-100 transition-opacity`}
      />
    </div>
  );
}

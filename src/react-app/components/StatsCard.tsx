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
const palettes: Record<string, { iconBg: string; iconText: string }> = {
  green:  { iconBg: 'bg-[#E8F5E9]', iconText: 'text-[#2E7D32]' },
  blue:   { iconBg: 'bg-[#E3F2FD]', iconText: 'text-[#1565C0]' },
  purple: { iconBg: 'bg-[#F3E5F5]', iconText: 'text-[#7B1FA2]' },
  orange: { iconBg: 'bg-[#FFF3E0]', iconText: 'text-[#E65100]' },
  red:    { iconBg: 'bg-[#FFEBEE]', iconText: 'text-[#C62828]' },
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
    <div className="bg-surface-container-lowest rounded-card p-lg shadow-ambient-1 border border-transparent hover:shadow-ambient-2 transition-shadow duration-300">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-body-sm text-on-surface-variant font-medium leading-tight">
          {title}
        </h3>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${palette.iconBg} ${palette.iconText}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="flex items-end gap-2">
        {loading ? (
          <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary" />
        ) : (
          <>
            <span className="text-h1 font-bold text-on-surface leading-none">{value}</span>
            {subtitle && (
              <span className="text-body-sm text-outline mb-1">{subtitle}</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

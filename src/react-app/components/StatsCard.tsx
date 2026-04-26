import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'red';
  loading?: boolean;
}

export default function StatsCard({ title, value, icon: Icon, color = 'blue', loading }: StatsCardProps) {
  // Material 3 — ícones em círculo pastel sobre card branco
  const iconBg = {
    blue: 'bg-[#E3F2FD] text-[#1565C0]',
    green: 'bg-[#E8F5E9] text-[#2E7D32]',
    purple: 'bg-[#F3E5F5] text-[#7B1FA2]',
    orange: 'bg-[#FFF3E0] text-[#E65100]',
    red: 'bg-[#FFEBEE] text-[#C62828]',
  }[color];

  return (
    <div className="bg-surface-container-lowest rounded-card border border-transparent shadow-ambient-1 hover:shadow-ambient-2 transition-shadow duration-300 p-md sm:p-lg">
      <div className="flex items-center justify-between gap-3 mb-3 sm:mb-4">
        <h3 className="text-body-sm font-medium text-on-surface-variant leading-tight">
          {title}
        </h3>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      {loading ? (
        <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary"></div>
      ) : (
        <p className="text-h1 font-bold text-on-surface">{value}</p>
      )}
    </div>
  );
}

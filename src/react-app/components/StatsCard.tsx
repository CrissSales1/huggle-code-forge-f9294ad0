import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'red';
  loading?: boolean;
}

export default function StatsCard({ title, value, icon: Icon, color = 'blue', loading }: StatsCardProps) {
  const colorClasses = {
    blue: 'from-blue-50 to-blue-100 border-blue-200 text-blue-700',
    green: 'from-green-50 to-green-100 border-green-200 text-green-700',
    purple: 'from-purple-50 to-purple-100 border-purple-200 text-purple-700',
    orange: 'from-orange-50 to-orange-100 border-orange-200 text-orange-700',
    red: 'from-red-50 to-red-100 border-red-200 text-red-700',
  };

  const iconColorClasses = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    purple: 'bg-purple-100 text-purple-600',
    orange: 'bg-orange-100 text-orange-600',
    red: 'bg-red-100 text-red-600',
  };

  return (
    <div className={`relative bg-gradient-to-br ${colorClasses[color]} border rounded-lg sm:rounded-xl p-3 sm:p-4 lg:p-6 shadow-sm overflow-hidden`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className={`text-[10px] sm:text-xs lg:text-sm font-medium opacity-75 leading-tight ${color === 'blue' ? 'text-blue-700' : color === 'green' ? 'text-green-700' : color === 'purple' ? 'text-purple-700' : color === 'orange' ? 'text-orange-700' : 'text-red-700'}`}>
            {title}
          </p>
          {loading ? (
            <div className="flex items-center mt-1 sm:mt-1.5 lg:mt-2">
              <div className="animate-spin rounded-full h-5 w-5 sm:h-6 sm:w-6 border-b-2 border-current"></div>
            </div>
          ) : (
            <p className={`text-xl sm:text-2xl lg:text-3xl font-bold mt-1 sm:mt-1.5 lg:mt-2 ${color === 'blue' ? 'text-blue-900' : color === 'green' ? 'text-green-900' : color === 'purple' ? 'text-purple-900' : color === 'orange' ? 'text-orange-900' : 'text-red-900'}`}>
              {value}
            </p>
          )}
        </div>
        <div className={`p-2 sm:p-2.5 lg:p-3 rounded-lg flex-shrink-0 ${iconColorClasses[color]}`}>
          <Icon className="w-5 h-5 sm:w-5 sm:h-5 lg:w-6 lg:h-6" />
        </div>
      </div>
    </div>
  );
}

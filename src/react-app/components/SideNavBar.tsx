import { useState } from 'react';
import { NavLink } from 'react-router';
import {
  Home,
  UserPlus,
  Search,
  BarChart3,
  Video,
  Shield,
  Settings,
  LogOut,
  Menu,
  X,
  Clock,
  Calendar,
} from 'lucide-react';
import { useAuth } from '@/react-app/hooks/useAuth';
import { useDateTime } from '@/react-app/hooks/useDateTime';
import { useMonitoring } from '@/react-app/contexts/MonitoringContext';
import { useVigilancia } from '@/react-app/contexts/VigilanciaContext';

const navigationItems = [
  { path: '/', label: 'Dashboard', icon: Home },
  { path: '/cadastro', label: 'Novo Cadastro', icon: UserPlus },
  { path: '/relatorios', label: 'Busca', icon: Search },
  { path: '/estatisticas', label: 'Estatísticas', icon: BarChart3 },
  { path: '/monitoramento', label: 'Monitoramento', icon: Video },
  { path: '/vigilancia', label: 'Vigilância', icon: Shield },
  { path: '/configuracoes', label: 'Configurações', icon: Settings },
];

interface SideNavBarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function SideNavBar({ mobileOpen, onMobileClose }: SideNavBarProps) {
  const { logout } = useAuth();
  const { formattedDate, formattedTime } = useDateTime();
  const { isActive: isMonitoringActive } = useMonitoring();
  const { isActive: isVigilanciaActive } = useVigilancia();

  const handleLogout = () => {
    onMobileClose();
    logout();
  };

  const navContent = (
    <>
      {/* Logo */}
      <div className="mb-8 px-2 flex items-center gap-3">
        <img
          src="/pwa-icons/icon.svg"
          alt="Águas da Fonte"
          className="w-10 h-10 rounded-full object-cover border border-outline-variant flex-shrink-0"
        />
        <div className="min-w-0">
          <h1 className="text-lg font-black tracking-tight text-primary leading-tight truncate">
            Águas da Fonte
          </h1>
          <p className="text-[12px] font-semibold text-outline tracking-wider mt-1 uppercase">
            Gestão de Acessos
          </p>
        </div>
      </div>

      {/* Navegação */}
      <div className="flex-1 flex flex-col gap-1">
        {navigationItems.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            onClick={onMobileClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 ease-in-out font-medium text-button ${
                isActive
                  ? 'text-primary bg-primary/10 font-semibold'
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-primary'
              }`
            }
          >
            <div className="relative flex-shrink-0">
              <Icon className="w-5 h-5" />
              {path === '/vigilancia' && isVigilanciaActive && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-secondary rounded-full animate-pulse" />
              )}
              {path === '/monitoramento' && isMonitoringActive && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-secondary rounded-full animate-pulse" />
              )}
            </div>
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
      </div>

      {/* Status & relógio */}
      <div className="mt-auto flex flex-col gap-2 border-t border-outline-variant pt-4">
        {(isMonitoringActive || isVigilanciaActive) && (
          <div className="px-3 py-2 text-xs font-medium text-secondary flex items-center gap-2 bg-secondary/10 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
            <span className="font-semibold">
              {isMonitoringActive && isVigilanciaActive
                ? 'Monitoramento + Vigilância'
                : isMonitoringActive
                  ? 'Monitoramento ativo'
                  : 'Vigilância ativa'}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2 px-3 py-2 text-on-surface-variant rounded-lg bg-surface-container">
          <Clock className="w-4 h-4 text-outline" />
          <span className="font-mono font-bold text-sm text-on-surface">{formattedTime}</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 text-on-surface-variant rounded-lg bg-surface-container">
          <Calendar className="w-4 h-4 text-outline" />
          <span className="text-xs font-medium capitalize truncate">{formattedDate}</span>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 text-on-surface-variant hover:bg-error/10 hover:text-error transition-all duration-200 rounded-lg font-medium text-button"
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          <span>Sair</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Sidebar Desktop (lg+) */}
      <nav className="hidden lg:flex fixed left-0 top-0 h-screen w-64 border-r border-outline-variant shadow-ambient-1 bg-surface-container-lowest flex-col py-6 px-4 gap-2 z-50">
        {navContent}
      </nav>

      {/* Top bar Mobile (sticky, mostra hamburguer) */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-surface-container-lowest border-b border-outline-variant px-4 py-3 flex items-center justify-between pwa-safe-top">
        <div className="flex items-center gap-2 min-w-0">
          <img
            src="/pwa-icons/icon.svg"
            alt="Águas da Fonte"
            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
          />
          <h1 className="text-base font-bold text-primary truncate">Águas da Fonte</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-sm text-on-surface">{formattedTime}</span>
          <button
            onClick={() => (mobileOpen ? onMobileClose() : null)}
            aria-label="Abrir menu"
            className="p-2 rounded-btn text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Drawer Mobile */}
      {mobileOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-on-surface/40 z-40"
            onClick={onMobileClose}
          />
          <nav className="lg:hidden fixed left-0 top-0 h-screen w-72 bg-surface-container-lowest shadow-ambient-3 z-50 flex flex-col py-6 px-4 gap-2 transform transition-transform duration-300">
            <button
              onClick={onMobileClose}
              className="absolute top-3 right-3 p-2 rounded-btn text-on-surface-variant hover:bg-surface-container"
              aria-label="Fechar menu"
            >
              <X className="w-5 h-5" />
            </button>
            {navContent}
          </nav>
        </>
      )}
    </>
  );
}

// Hook utilitário para botão hambúrguer externo (caso precisemos)
export function useMobileNav() {
  const [open, setOpen] = useState(false);
  return {
    open,
    openNav: () => setOpen(true),
    closeNav: () => setOpen(false),
    toggleNav: () => setOpen((v) => !v),
  };
}

import { useState } from 'react';
import { NavLink } from 'react-router';
import { useDateTime } from '@/react-app/hooks/useDateTime';
import { useAuth } from '@/react-app/hooks/useAuth';
import { Clock, Calendar, LogOut, Home, UserPlus, Search, Settings, BarChart3, Video, Menu, X } from 'lucide-react';

const navigationItems = [
  { path: '/', label: 'Dashboard', icon: Home },
  { path: '/cadastro', label: 'Novo Cadastro', icon: UserPlus },
  { path: '/relatorios', label: 'Busca', icon: Search },
  { path: '/estatisticas', label: 'Estatísticas', icon: BarChart3 },
  { path: '/monitoramento', label: 'Monitoramento', icon: Video },
  { path: '/configuracoes', label: 'Configurações', icon: Settings },
];

export default function Header() {
  const [menuAberto, setMenuAberto] = useState(false);
  const { formattedDate, formattedTime } = useDateTime();
  const { logout } = useAuth();

  const fecharMenu = () => setMenuAberto(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-lg">
      <div className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4">
        <div className="flex justify-between items-center">
          {/* Logo e Título */}
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
            <div className="w-8 h-8 sm:w-9 sm:h-9 lg:w-10 lg:h-10 bg-white bg-opacity-20 rounded-lg flex items-center justify-center backdrop-blur-sm p-1 flex-shrink-0">
              <img 
                src="https://mocha-cdn.com/01996a05-d3fb-731d-bd7e-dfeef4543b8d/car-parking-(1).svg" 
                alt="Aguas da Fonte" 
                className="w-full h-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base lg:text-xl font-bold truncate">Condomínio Aguas da Fonte</h1>
              <p className="text-blue-100 text-[10px] sm:text-xs hidden sm:block truncate">Sistema de Gerenciamento de Acessos</p>
            </div>
          </div>
          
          {/* Controles do Desktop */}
          <div className="hidden lg:flex items-center gap-3">
            <div className="flex items-center space-x-2 bg-white bg-opacity-10 rounded-lg px-3 py-1.5 backdrop-blur-sm">
              <Calendar className="w-4 h-4 text-blue-200" />
              <span className="text-xs font-medium capitalize">{formattedDate}</span>
            </div>
            
            <div className="flex items-center space-x-2 bg-white bg-opacity-10 rounded-lg px-3 py-1.5 backdrop-blur-sm">
              <Clock className="w-4 h-4 text-blue-200" />
              <span className="text-base font-mono font-bold">{formattedTime}</span>
            </div>
            
            <button
              onClick={logout}
              className="flex items-center space-x-2 bg-white bg-opacity-10 rounded-lg px-3 py-1.5 backdrop-blur-sm hover:bg-opacity-20 transition-colors"
              title="Sair do sistema"
            >
              <LogOut className="w-4 h-4 text-blue-200" />
              <span className="text-xs font-medium">Sair</span>
            </button>
          </div>

          {/* Controles Mobile */}
          <div className="flex lg:hidden items-center gap-2">
            <div className="flex items-center space-x-1.5 bg-white bg-opacity-10 rounded-lg px-2 py-1 backdrop-blur-sm">
              <Clock className="w-3.5 h-3.5 text-blue-200" />
              <span className="text-sm font-mono font-bold">{formattedTime}</span>
            </div>
            
            <button
              onClick={() => setMenuAberto(!menuAberto)}
              className="p-2 bg-white bg-opacity-10 rounded-lg backdrop-blur-sm hover:bg-opacity-20 transition-colors"
              aria-label="Menu"
            >
              {menuAberto ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
      
      {/* Menu Desktop */}
      <div className="hidden lg:block bg-gradient-to-r from-blue-400 to-blue-500 border-t border-blue-300">
        <div className="px-6">
          <div className="flex space-x-6">
            {navigationItems.map(({ path, label, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                className={({ isActive }) =>
                  `flex items-center space-x-2 py-3 px-3 border-b-2 font-medium text-sm transition-colors ${
                    isActive
                      ? 'border-white text-white'
                      : 'border-transparent text-blue-50 hover:text-white hover:border-blue-200'
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      </div>

      {/* Menu Mobile Hambúrguer */}
      {menuAberto && (
        <>
          {/* Overlay */}
          <div 
            className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={fecharMenu}
          />
          
          {/* Menu Lateral */}
          <div className="lg:hidden fixed top-0 right-0 bottom-0 w-64 bg-white shadow-2xl z-50 transform transition-transform duration-300">
            <div className="flex flex-col h-full">
              {/* Header do Menu */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white p-4 flex justify-between items-center">
                <span className="font-bold text-lg">Menu</span>
                <button onClick={fecharMenu} className="p-1 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Informações */}
              <div className="p-4 border-b border-gray-200 space-y-2">
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <Calendar className="w-4 h-4" />
                  <span className="capitalize">{formattedDate}</span>
                </div>
              </div>

              {/* Itens de Navegação */}
              <nav className="flex-1 overflow-y-auto py-2">
                {navigationItems.map(({ path, label, icon: Icon }) => (
                  <NavLink
                    key={path}
                    to={path}
                    onClick={fecharMenu}
                    className={({ isActive }) =>
                      `flex items-center space-x-3 px-4 py-3 transition-colors ${
                        isActive
                          ? 'bg-blue-50 text-blue-600 border-l-4 border-blue-600'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`
                    }
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{label}</span>
                  </NavLink>
                ))}
              </nav>

              {/* Botão Sair */}
              <div className="p-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    fecharMenu();
                    logout();
                  }}
                  className="w-full flex items-center justify-center space-x-2 bg-red-600 text-white py-3 rounded-lg hover:bg-red-700 transition-colors font-medium"
                >
                  <LogOut className="w-5 h-5" />
                  <span>Sair do Sistema</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </header>
  );
}

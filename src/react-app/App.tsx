import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { useAuth } from '@/react-app/hooks/useAuth';
import { MonitoringProvider } from '@/react-app/contexts/MonitoringContext';
import Header from '@/react-app/components/Header';
import BackgroundVideo from '@/react-app/components/BackgroundVideo';
import DetectionToast from '@/react-app/components/DetectionToast';
import Login from '@/react-app/pages/Login';
import Dashboard from '@/react-app/pages/Dashboard';
import Cadastro from '@/react-app/pages/Cadastro';
import Relatorios from '@/react-app/pages/Relatorios';
import Estatisticas from '@/react-app/pages/Estatisticas';
import Monitoramento from '@/react-app/pages/Monitoramento';
import Configuracoes from '@/react-app/pages/Configuracoes';
import Vigilancia from '@/react-app/pages/Vigilancia';
import Instalar from '@/react-app/pages/Instalar';
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
}

function App() {
  // OCR ONNX é carregado sob demanda no worker
  return (
    <BrowserRouter>
      <MonitoringProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/instalar" element={<Instalar />} />
          <Route
            path="/*"
            element={
              <PrivateRoute>
                <div className="min-h-screen bg-gray-50">
                  <Header />
                  <main className="pt-[56px] sm:pt-[60px] lg:pt-[112px] pb-4 sm:pb-6">
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/cadastro" element={<Cadastro />} />
                      <Route path="/relatorios" element={<Relatorios />} />
                      <Route path="/estatisticas" element={<Estatisticas />} />
                      <Route path="/monitoramento" element={<Monitoramento />} />
                      <Route path="/configuracoes" element={<Configuracoes />} />
                      <Route path="/vigilancia" element={<Vigilancia />} />
                    </Routes>
                  </main>
                  
                  {/* Componentes globais de monitoramento */}
                  <BackgroundVideo />
                  <DetectionToast />
                </div>
              </PrivateRoute>
            }
          />
        </Routes>
      </MonitoringProvider>
    </BrowserRouter>
  );
}

export default App;

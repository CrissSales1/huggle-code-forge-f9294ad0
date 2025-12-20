import { useState, useEffect } from 'react';

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verificar se o usuário está autenticado no localStorage
    const authenticated = localStorage.getItem('aguasdafonte_authenticated') === 'true';
    setIsAuthenticated(authenticated);
    setLoading(false);
  }, []);

  const login = () => {
    localStorage.setItem('aguasdafonte_authenticated', 'true');
    setIsAuthenticated(true);
  };

  const logout = () => {
    localStorage.removeItem('aguasdafonte_authenticated');
    setIsAuthenticated(false);
    // Forçar uma atualização da página para garantir que o logout seja aplicado
    window.location.reload();
  };

  return {
    isAuthenticated,
    loading,
    login,
    logout,
  };
}

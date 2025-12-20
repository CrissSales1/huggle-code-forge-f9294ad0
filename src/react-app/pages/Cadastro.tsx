import { useState } from 'react';
import { Navigate } from 'react-router';
import CadastroVisitanteModal from '@/react-app/components/CadastroVisitanteModal';

export default function Cadastro() {
  const [showModal, setShowModal] = useState(true);
  const [redirectToDashboard, setRedirectToDashboard] = useState(false);

  const handleClose = () => {
    setShowModal(false);
    setRedirectToDashboard(true);
  };

  const handleSuccess = () => {
    setShowModal(false);
    setRedirectToDashboard(true);
  };

  if (redirectToDashboard) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="container mx-auto px-4 lg:px-6 py-4 lg:py-8">
      <CadastroVisitanteModal
        isOpen={showModal}
        onClose={handleClose}
        onSuccess={handleSuccess}
      />
      
      {/* Conteúdo de fallback caso o modal seja fechado */}
      {!showModal && (
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Cadastro de Visitante</h1>
          <p className="text-gray-600 mb-6">O modal de cadastro foi fechado.</p>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Abrir Cadastro Novamente
          </button>
        </div>
      )}
    </div>
  );
}

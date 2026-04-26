import { useState } from 'react';
import { Navigate } from 'react-router';
import { PlusCircle } from 'lucide-react';
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
    <div className="px-4 sm:px-6 lg:px-8 mt-lg max-w-[1440px] w-full mx-auto">
      <CadastroVisitanteModal
        isOpen={showModal}
        onClose={handleClose}
        onSuccess={handleSuccess}
      />

      {!showModal && (
        <div className="text-center py-12 bg-surface-container-lowest rounded-card shadow-ambient-1 max-w-md mx-auto mt-12">
          <h1 className="text-h2 font-semibold text-on-surface mb-2">
            Cadastro de Visitante
          </h1>
          <p className="text-body-sm text-on-surface-variant mb-6">
            O modal de cadastro foi fechado.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-btn text-button font-medium hover:bg-primary-container transition-colors shadow-ambient-1"
          >
            <PlusCircle className="w-4 h-4" />
            Abrir Cadastro Novamente
          </button>
        </div>
      )}
    </div>
  );
}

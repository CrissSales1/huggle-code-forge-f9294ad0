import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/react-app/index.css";
import App from "@/react-app/App.tsx";

// v1.8.2: Registro manual do PWA — não recarrega a página automaticamente
// Evita ciclo "novo SW → reload → novo SW" no preview do Lovable
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({
      onNeedRefresh() {
        console.log('🔔 Nova versão disponível. Recarregue manualmente quando desejar.');
      },
      onOfflineReady() {
        console.log('✅ App pronto para uso offline.');
      },
    });
  }).catch(() => {
    // virtual:pwa-register pode não estar disponível em alguns contextos — ignorar
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

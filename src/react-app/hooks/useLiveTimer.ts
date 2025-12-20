import { useState, useEffect } from 'react';

export function useLiveTimer(horaEntrada: string) {
  const [tempoDecorrido, setTempoDecorrido] = useState(0);

  useEffect(() => {
    // Função para calcular o tempo decorrido
    const calcularTempo = () => {
      const entrada = new Date(horaEntrada);
      const agora = new Date();
      const diffMs = agora.getTime() - entrada.getTime();
      const diffHoras = Math.max(0, diffMs / (1000 * 60 * 60));
      return diffHoras;
    };

    // Calcular imediatamente
    setTempoDecorrido(calcularTempo());

    // Atualizar a cada segundo
    const intervalo = setInterval(() => {
      setTempoDecorrido(calcularTempo());
    }, 1000);

    // Limpar intervalo quando o componente desmontar
    return () => clearInterval(intervalo);
  }, [horaEntrada]);

  return tempoDecorrido;
}

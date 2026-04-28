import { useState, useEffect } from 'react';

export function useDateTime() {
  const [dateTime, setDateTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setDateTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatDateShort = (date: Date) => {
    return date
      .toLocaleDateString('pt-BR', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
      .replace(/\./g, '');
  };

  /**
   * Formato: "Ter, 28 de Abril de 2026"
   */
  const formatDateLong = (date: Date) => {
    const weekdayRaw = date
      .toLocaleDateString('pt-BR', { weekday: 'short' })
      .replace(/\./g, '');
    // pt-BR retorna "ter" — pegamos as 3 primeiras letras e capitalizamos
    const weekday = cap(weekdayRaw.slice(0, 3));
    const day = date.toLocaleDateString('pt-BR', { day: '2-digit' });
    const monthRaw = date.toLocaleDateString('pt-BR', { month: 'long' });
    const month = cap(monthRaw);
    const year = date.getFullYear();
    return `${weekday}, ${day} de ${month} de ${year}`;
  };

  return {
    dateTime,
    formattedDate: formatDate(dateTime),
    formattedDateShort: formatDateShort(dateTime),
    formattedDateLong: formatDateLong(dateTime),
    formattedTime: formatTime(dateTime),
  };
}

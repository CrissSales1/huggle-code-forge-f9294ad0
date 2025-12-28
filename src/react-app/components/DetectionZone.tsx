import { useState, useRef, useCallback, useEffect } from 'react';
import { Move } from 'lucide-react';

export interface DetectionZoneRect {
  x: number; // percentual 0-100
  y: number;
  width: number;
  height: number;
}

interface DetectionZoneProps {
  zone: DetectionZoneRect;
  onZoneChange: (zone: DetectionZoneRect) => void;
  isEditing: boolean;
  containerRef: React.RefObject<HTMLElement | null>;
}

export default function DetectionZone({ zone, onZoneChange, isEditing, containerRef }: DetectionZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialZone, setInitialZone] = useState(zone);
  const zoneRef = useRef<HTMLDivElement>(null);

  // Converter coordenadas do mouse para percentual
  const getPercentCoords = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  }, [containerRef]);

  // Iniciar arraste
  const handleMouseDown = useCallback((e: React.MouseEvent, action: 'drag' | 'resize') => {
    if (!isEditing) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const coords = getPercentCoords(e.clientX, e.clientY);
    setDragStart(coords);
    setInitialZone(zone);
    
    if (action === 'drag') {
      setIsDragging(true);
    } else {
      setIsResizing(true);
    }
  }, [isEditing, getPercentCoords, zone]);

  // Mover/Redimensionar
  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const coords = getPercentCoords(e.clientX, e.clientY);
      const deltaX = coords.x - dragStart.x;
      const deltaY = coords.y - dragStart.y;

      if (isDragging) {
        // Mover zona
        let newX = initialZone.x + deltaX;
        let newY = initialZone.y + deltaY;
        
        // Limitar aos bounds
        newX = Math.max(0, Math.min(100 - initialZone.width, newX));
        newY = Math.max(0, Math.min(100 - initialZone.height, newY));
        
        onZoneChange({ ...zone, x: newX, y: newY });
      } else if (isResizing) {
        // Redimensionar zona
        let newWidth = initialZone.width + deltaX;
        let newHeight = initialZone.height + deltaY;
        
        // Limitar tamanho mínimo e máximo
        newWidth = Math.max(20, Math.min(100 - initialZone.x, newWidth));
        newHeight = Math.max(20, Math.min(100 - initialZone.y, newHeight));
        
        onZoneChange({ ...zone, width: newWidth, height: newHeight });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, dragStart, initialZone, zone, getPercentCoords, onZoneChange]);

  return (
    <div
      ref={zoneRef}
      className={`absolute border-2 transition-colors ${
        isEditing 
          ? 'border-yellow-400 bg-yellow-400/20 cursor-move' 
          : 'border-green-400 bg-green-400/10'
      }`}
      style={{
        left: `${zone.x}%`,
        top: `${zone.y}%`,
        width: `${zone.width}%`,
        height: `${zone.height}%`,
      }}
      onMouseDown={(e) => handleMouseDown(e, 'drag')}
    >
      {/* Label */}
      <div className={`absolute -top-6 left-0 text-xs px-2 py-0.5 rounded ${
        isEditing ? 'bg-yellow-400 text-yellow-900' : 'bg-green-500 text-white'
      }`}>
        Zona de Detecção
      </div>

      {/* Ícone de mover */}
      {isEditing && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-yellow-400">
          <Move className="w-8 h-8 opacity-50" />
        </div>
      )}

      {/* Handle de redimensionar */}
      {isEditing && (
        <div
          className="absolute bottom-0 right-0 w-4 h-4 bg-yellow-400 cursor-se-resize"
          onMouseDown={(e) => handleMouseDown(e, 'resize')}
        />
      )}

      {/* Corners decorativos */}
      <div className={`absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 ${isEditing ? 'border-yellow-400' : 'border-green-400'}`} />
      <div className={`absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 ${isEditing ? 'border-yellow-400' : 'border-green-400'}`} />
      <div className={`absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 ${isEditing ? 'border-yellow-400' : 'border-green-400'}`} />
      <div className={`absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 ${isEditing ? 'border-yellow-400' : 'border-green-400'}`} />
    </div>
  );
}

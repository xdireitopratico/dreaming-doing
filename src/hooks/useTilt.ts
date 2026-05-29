import { useRef, useState, type MouseEvent } from "react";

/**
 * 3D tilt — perspective transform que segue o cursor dentro do elemento.
 */
export function useTilt(intensity = 10) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });

  const onMove = (e: MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ rx: -py * intensity, ry: px * intensity });
  };

  const reset = () => setTilt({ rx: 0, ry: 0 });

  const style = {
    transform: `perspective(900px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
    transition: "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)",
    willChange: "transform",
  };

  return { ref, style, onMove, onMouseLeave: reset };
}

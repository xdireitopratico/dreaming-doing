/**
 * NodeTooltip — n8n-style tooltip for canvas nodes
 *
 * Shows on hover with 500ms delay. Hides when viewport changes (zoom/pan).
 */
import { useEffect, useRef, useState, type FC, type ReactNode } from "react";

interface NodeTooltipProps {
  content: string;
  visible?: boolean;
  delay?: number;
  children?: ReactNode;
}

export const NodeTooltip: FC<NodeTooltipProps> = ({
  content,
  visible = true,
  delay = 500,
  children,
}) => {
  const [show, setShow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible || !content) {
      setShow(false);
      return;
    }

    timerRef.current = setTimeout(() => setShow(true), delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible, content, delay]);

  // Hide on viewport change (zoom/pan) — listen for wheel/mousedown on canvas
  useEffect(() => {
    if (!show) return;
    const hide = () => setShow(false);
    window.addEventListener("wheel", hide, { passive: true, once: true });
    window.addEventListener("mousedown", hide, { passive: true, once: true });
    return () => {
      window.removeEventListener("wheel", hide);
      window.removeEventListener("mousedown", hide);
    };
  }, [show]);

  return (
    <div className="relative inline-flex">
      {children}
      {show && content && (
        <div
          className="absolute z-50 px-2 py-1 rounded text-[10px] font-medium whitespace-nowrap pointer-events-none"
          style={{
            bottom: "calc(100% + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.9)",
            color: "#e0e0e0",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
};

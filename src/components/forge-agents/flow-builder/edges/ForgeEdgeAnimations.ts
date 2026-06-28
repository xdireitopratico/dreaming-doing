/**
 * Edge animation injection — n8n-style running/waiting stroke animation
 */
export function injectEdgeStyles() {
  if (typeof document === "undefined") return;
  const id = "forge-edge-animations";
  if (document.getElementById(id)) return;

  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    @keyframes forge-edge-running {
      0% { stroke-dashoffset: 0; }
      100% { stroke-dashoffset: -24; }
    }
    @keyframes forge-edge-waiting {
      0% { stroke-dashoffset: 0; }
      100% { stroke-dashoffset: -24; }
    }

    .forge-edge-toolbar {
      animation: forge-edge-toolbar-in 0.12s ease-out;
    }
    @keyframes forge-edge-toolbar-in {
      from { opacity: 0; transform: translate(-50%, -50%) scale(0.85); }
      to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    }
  `;
  document.head.appendChild(style);
}

/**
 * SettingsIcons — n8n-style top-right indicator icons for canvas nodes
 *
 * Shows small icons indicating special settings:
 *   - alwaysOutputData / executeOnce / retryOnFail / continueOnError
 *
 * Positioned: absolute, top: 2px, right: 2px
 */
import { type FC } from "react";

interface SettingsIconsProps {
  alwaysOutputData?: boolean;
  executeOnce?: boolean;
  retryOnFail?: boolean;
  continueOnError?: boolean;
}

const dot = "w-[6px] h-[6px] rounded-full";

export const SettingsIcons: FC<SettingsIconsProps> = ({
  alwaysOutputData, executeOnce, retryOnFail, continueOnError,
}) => {
  const icons: Array<{ show?: boolean; color: string; title: string }> = [
    { show: alwaysOutputData, color: "var(--ps-accent, #5555aa)", title: "Sempre emitir dados" },
    { show: executeOnce, color: "var(--ps-accent, #3b82f6)", title: "Executar uma vez" },
    { show: retryOnFail, color: "#f59e0b", title: "Retentar em falha" },
    { show: continueOnError, color: "#ef4444", title: "Continuar em erro" },
  ];

  if (!icons.some((i) => i.show)) return null;

  return (
    <div
      className="absolute flex items-center gap-[1px]"
      style={{ top: 2, right: 2 }}
    >
      {icons
        .filter((i) => i.show)
        .map((i) => (
          <div
            key={i.title}
            className={dot}
            style={{ background: i.color }}
            title={i.title}
          />
        ))}
    </div>
  );
};

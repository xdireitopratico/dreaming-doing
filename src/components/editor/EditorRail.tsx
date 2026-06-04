import {
  FolderOpen,
  List,
  Mail,
  MoreHorizontal,
  Search,
  LayoutList,
} from "lucide-react";

export interface EditorRailProps {
  onSearch?: () => void;
  onFiles?: () => void;
  onHistory?: () => void;
  onMore?: () => void;
  filesActive?: boolean;
}

export function EditorRail({
  onSearch,
  onFiles,
  onHistory,
  onMore,
  filesActive,
}: EditorRailProps) {
  const items = [
    { icon: Search, label: "Buscar", onClick: onSearch },
    { icon: FolderOpen, label: "Arquivos", onClick: onFiles, active: filesActive },
    { icon: LayoutList, label: "Lista", onClick: onHistory },
    { icon: List, label: "Logs", onClick: onMore },
    { icon: Mail, label: "Conectores", onClick: onMore },
    { icon: MoreHorizontal, label: "Mais", onClick: onMore },
  ];

  return (
    <aside className="lovable-rail" aria-label="Ferramentas">
      {items.map(({ icon: Icon, label, onClick, active }) => (
        <button
          key={label}
          type="button"
          className="lovable-rail-btn"
          data-active={active}
          title={label}
          onClick={onClick}
        >
          <Icon className="size-4" strokeWidth={2} />
        </button>
      ))}
    </aside>
  );
}
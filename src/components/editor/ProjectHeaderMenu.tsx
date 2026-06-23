import { useNavigate } from "@tanstack/react-router";
import {
  BrainCircuit,
  ChevronDown,
  Grid3X3,
  Plug,
  Puzzle,
  Settings,
  Wrench,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ForgeEditorDropdownContent,
  ForgeEditorDropdownItem,
} from "@/components/editor/ForgeEditorDropdown";
import { projectDisplayName } from "@/lib/project-display-name";

type ProjectHeaderMenuProps = {
  projectId: string;
  projectName?: string | null;
  subLabel?: string | null;
  subLabelState?: string;
  className?: string;
};

export function ProjectHeaderMenu({
  projectId,
  projectName,
  subLabel,
  subLabelState,
  className,
}: ProjectHeaderMenuProps) {
  const navigate = useNavigate();
  const title = projectDisplayName(projectName);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" className={className ?? "forge-project-trigger"}>
          <span className="forge-project-name" title={projectName ?? "Projeto"}>
            {title}
            <ChevronDown className="size-3 shrink-0 opacity-50" />
          </span>
          {subLabel ? (
            <span
              className="forge-project-sub"
              data-testid="forge-header-state"
              data-state={subLabelState}
            >
              {subLabel}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>

      <ForgeEditorDropdownContent align="start" className="min-w-[220px]">
        <ForgeEditorDropdownItem onClick={() => void navigate({ to: "/projects" })}>
          <Grid3X3 className="mr-2 size-4" />
          Todos os projetos
        </ForgeEditorDropdownItem>
        <ForgeEditorDropdownItem onClick={() => void navigate({ to: "/settings" })}>
          <Settings className="mr-2 size-4" />
          Ajustes da conta
        </ForgeEditorDropdownItem>
        <ForgeEditorDropdownItem onClick={() => void navigate({ to: "/api-models" })}>
          <BrainCircuit className="mr-2 size-4" />
          Api & Models
        </ForgeEditorDropdownItem>
        <ForgeEditorDropdownItem onClick={() => void navigate({ to: "/connectors" })}>
          <Plug className="mr-2 size-4" />
          Conectores
        </ForgeEditorDropdownItem>
        <ForgeEditorDropdownItem onClick={() => void navigate({ to: "/skills" })}>
          <Wrench className="mr-2 size-4" />
          Skills
        </ForgeEditorDropdownItem>
        <ForgeEditorDropdownItem onClick={() => void navigate({ to: "/mcp" })}>
          <Puzzle className="mr-2 size-4" />
          MCP
        </ForgeEditorDropdownItem>
        <ForgeEditorDropdownItem onClick={() => void navigate({ to: "/projects/$projectId", params: { projectId } })}>
          <Grid3X3 className="mr-2 size-4" />
          Abrir projeto
        </ForgeEditorDropdownItem>
      </ForgeEditorDropdownContent>
    </DropdownMenu>
  );
}

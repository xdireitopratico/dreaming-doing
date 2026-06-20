import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, X } from "lucide-react";
import { CATEGORIES, type LibraryFilters as Filters } from "./types";

interface DesignLibraryFiltersProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  onClear: () => void;
}

export function DesignLibraryFilters({ filters, onChange, onClear }: DesignLibraryFiltersProps) {
  const update = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const hasActive =
    filters.domain ||
    filters.mood ||
    filters.language ||
    filters.category !== "all" ||
    filters.minQuality > 0 ||
    filters.validatedOnly ||
    filters.search;

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 border border-border rounded-lg bg-surface-1">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <Input
          placeholder="Buscar nome ou URL..."
          value={filters.search}
          onChange={(e) => update({ search: e.target.value })}
          className="pl-8 h-8 text-xs"
        />
      </div>

      <Input
        placeholder="Domínio"
        value={filters.domain}
        onChange={(e) => update({ domain: e.target.value })}
        className="w-32 h-8 text-xs"
      />

      <Input
        placeholder="Mood"
        value={filters.mood}
        onChange={(e) => update({ mood: e.target.value })}
        className="w-28 h-8 text-xs"
      />

      <Input
        placeholder="Linguagem"
        value={filters.language}
        onChange={(e) => update({ language: e.target.value })}
        className="w-32 h-8 text-xs"
      />

      <Select value={filters.category} onValueChange={(v) => update({ category: v })}>
        <SelectTrigger className="w-36 h-8 text-xs">
          <SelectValue placeholder="Categoria" />
        </SelectTrigger>
        <SelectContent>
          {CATEGORIES.map((c) => (
            <SelectItem key={c} value={c}>
              {c === "all" ? "Todas categorias" : c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={String(filters.minQuality)}
        onValueChange={(v) => update({ minQuality: Number(v) })}
      >
        <SelectTrigger className="w-32 h-8 text-xs">
          <SelectValue placeholder="Qualidade mín." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="0">Qualquer</SelectItem>
          <SelectItem value="5">≥ 5</SelectItem>
          <SelectItem value="7">≥ 7</SelectItem>
          <SelectItem value="8">≥ 8</SelectItem>
          <SelectItem value="9">≥ 9</SelectItem>
        </SelectContent>
      </Select>

      <Button
        variant={filters.validatedOnly ? "default" : "outline"}
        size="sm"
        onClick={() => update({ validatedOnly: !filters.validatedOnly })}
        className="h-8 text-xs"
      >
        {filters.validatedOnly ? "✓ Validados" : "Validados"}
      </Button>

      {hasActive && (
        <Button variant="ghost" size="sm" onClick={onClear} className="h-8 text-xs">
          <X className="size-3 mr-1" />
          Limpar
        </Button>
      )}
    </div>
  );
}

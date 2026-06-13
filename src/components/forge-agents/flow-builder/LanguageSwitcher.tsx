/**
 * LanguageSwitcher — Seletor de idioma do builder
 * Rodada 30: Multi-Language + i18n
 */
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Languages } from "lucide-react";
import { type Locale, LOCALE_LABELS, LOCALE_FLAGS } from "./i18n";

interface LanguageSwitcherProps {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}

const LOCALES: Locale[] = ["pt-BR", "en", "es"];

export function LanguageSwitcher({ locale, onLocaleChange }: LanguageSwitcherProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs px-2">
          <Languages className="h-3.5 w-3.5" />
          <span>{LOCALE_FLAGS[locale]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        {LOCALES.map((l) => (
          <DropdownMenuItem
            key={l}
            onClick={() => onLocaleChange(l)}
            className={l === locale ? "bg-accent" : ""}
          >
            <span className="mr-2">{LOCALE_FLAGS[l]}</span>
            <span className="text-sm">{LOCALE_LABELS[l]}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

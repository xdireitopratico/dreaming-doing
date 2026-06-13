/**
 * AgentLanguageConfig — Configuração de idioma por agente
 * Rodada 30: Multi-Language + i18n
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, Languages, Globe } from "lucide-react";
import { type Locale, LOCALE_LABELS, LOCALE_FLAGS } from "./i18n";

interface AgentLanguageConfigProps {
  primaryLanguage: Locale;
  supportedLanguages: Locale[];
  autoDetect: boolean;
  onPrimaryChange: (l: Locale) => void;
  onSupportedChange: (langs: Locale[]) => void;
  onAutoDetectChange: (v: boolean) => void;
  onClose: () => void;
}

const ALL_LOCALES: Locale[] = ["pt-BR", "en", "es"];

export function AgentLanguageConfig({
  primaryLanguage,
  supportedLanguages,
  autoDetect,
  onPrimaryChange,
  onSupportedChange,
  onAutoDetectChange,
  onClose,
}: AgentLanguageConfigProps) {
  const toggleSupported = (l: Locale) => {
    if (l === primaryLanguage) return; // primary always supported
    if (supportedLanguages.includes(l)) {
      onSupportedChange(supportedLanguages.filter((x) => x !== l));
    } else {
      onSupportedChange([...supportedLanguages, l]);
    }
  };

  return (
    <div className="w-[360px] border-l bg-background flex flex-col shrink-0 h-full">
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Languages className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Idioma do Agente</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Primary language */}
          <div className="space-y-2">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              Idioma principal
            </Label>
            <p className="text-[10px] text-muted-foreground">
              O agente responderá neste idioma por padrão.
            </p>
            <Select value={primaryLanguage} onValueChange={(v) => onPrimaryChange(v as Locale)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_LOCALES.map((l) => (
                  <SelectItem key={l} value={l} className="text-xs">
                    {LOCALE_FLAGS[l]} {LOCALE_LABELS[l]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Auto-detect */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" />
                Detecção automática
              </Label>
              <Switch checked={autoDetect} onCheckedChange={onAutoDetectChange} />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Detecta o idioma do usuário e responde no mesmo idioma automaticamente.
              {autoDetect && " O idioma principal será usado como fallback."}
            </p>
          </div>

          {/* Supported languages */}
          <div className="space-y-3">
            <Label className="text-xs font-medium">Idiomas suportados</Label>
            <div className="space-y-2">
              {ALL_LOCALES.map((l) => {
                const isPrimary = l === primaryLanguage;
                const isSupported = supportedLanguages.includes(l);
                return (
                  <div
                    key={l}
                    className="flex items-center justify-between rounded-lg border bg-card p-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{LOCALE_FLAGS[l]}</span>
                      <span className="text-xs font-medium">{LOCALE_LABELS[l]}</span>
                      {isPrimary && (
                        <Badge variant="secondary" className="text-[9px]">
                          Principal
                        </Badge>
                      )}
                    </div>
                    <Switch
                      checked={isSupported || isPrimary}
                      disabled={isPrimary}
                      onCheckedChange={() => toggleSupported(l)}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Instrução gerada para o system prompt
            </p>
            <p className="text-[10px] text-muted-foreground font-mono leading-relaxed">
              {autoDetect
                ? "Detect the user's language and respond in the SAME language. Supported: " +
                  supportedLanguages.map((l) => LOCALE_LABELS[l]).join(", ") +
                  ". Fallback: " + LOCALE_LABELS[primaryLanguage] + "."
                : `Always respond in ${LOCALE_LABELS[primaryLanguage]}.`}
            </p>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

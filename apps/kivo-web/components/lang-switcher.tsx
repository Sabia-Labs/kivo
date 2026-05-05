"use client";

import { Globe } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useTranslation, languages, type Language } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function LangSwitcher({ className }: { className?: string }) {
  const { lang, setLang } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("gap-1.5 text-sm font-medium", className)}
          aria-label="Switch language"
          id="lang-switcher-trigger"
        >
          <Globe className="size-4" />
          {languages.find((l) => l.code === lang)?.flag}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        {languages.map((l) => (
          <DropdownMenuItem
            key={l.code}
            id={`lang-option-${l.code}`}
            className={cn(
              "cursor-pointer gap-2",
              lang === l.code && "bg-accent font-medium"
            )}
            onClick={() => setLang(l.code as Language)}
          >
            <span>{l.flag}</span>
            <span>{l.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

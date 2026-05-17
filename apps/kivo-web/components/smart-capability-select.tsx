"use client";

import React, { useState, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface CapabilityItem {
  identifier: string;
  name: string;
  [key: string]: any;
}

export function SmartCapabilitySelect({
  value,
  onChange,
  availableCapabilities,
  translate
}: {
  value: string | null;
  onChange: (val: string | null) => void;
  availableCapabilities: CapabilityItem[];
  translate?: (key: string) => string;
}) {
  const [inputValue, setInputValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const cleanInput = inputValue.trim().toLowerCase();

  const filteredCaps = availableCapabilities.filter(c => {
    const name = c.name;
    return name.toLowerCase().includes(cleanInput) || c.identifier.toLowerCase().includes(cleanInput);
  });

  const handleAdd = (id: string) => {
    onChange(id);
    setInputValue("");
    setIsFocused(false);
  };

  const selectedCap = value ? availableCapabilities.find(c => c.identifier === value) : null;

  return (
    <div className="relative flex flex-col w-full">
      {value ? (
        <div className="flex items-center gap-2 p-2 rounded-md border bg-muted">
          <span className="flex-1 text-sm font-medium">
            {selectedCap ? selectedCap.name : value}
          </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(null); }}
            className="hover:bg-black/10 rounded-full p-1 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <div
          className={cn(
            "flex gap-1.5 p-2 w-full rounded-md border bg-transparent text-sm shadow-sm transition-colors",
            isFocused ? "border-primary ring-1 ring-primary" : "border-input"
          )}
          onClick={() => {
            inputRef.current?.focus();
            setIsFocused(true);
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            placeholder="Search existing capability..."
            className="flex-1 bg-transparent outline-none w-full text-sm placeholder:text-muted-foreground"
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {isFocused && !value && (inputValue || filteredCaps.length > 0) && (
        <div className="absolute top-full mt-1 w-full bg-card border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
          {filteredCaps.map(c => {
            const translatedName = c.name;
            return (
              <div
                key={c.identifier}
                className="px-3 py-2 text-sm hover:bg-muted cursor-pointer flex flex-col"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleAdd(c.identifier)}
              >
                <span className="font-medium">{translatedName}</span>
                <span className="text-[10px] text-muted-foreground">{c.identifier}</span>
              </div>
            );
          })}
          {filteredCaps.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground italic" onMouseDown={(e) => e.preventDefault()}>No matching capabilities.</div>
          )}
        </div>
      )}
    </div>
  );
}

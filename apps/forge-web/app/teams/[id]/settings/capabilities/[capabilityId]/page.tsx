"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, X, Plus, Save, Star } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth, API_BASE } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface Capability {
  id: string; name: string; identifier: string; instructions: string;
  inputsDescription: string | null; expectedOutputsDescription: string | null;
  suggestedNextCapabilities: string[] | null; isEnabled: boolean; scheduleConfig: Record<string, any> | null;
  assignedAgentId: string | null; assignedRole: string | null; isFavorite: boolean;
}


function SmartCapabilitySelect({ 
  value, 
  onChange, 
  availableCapabilities 
}: { 
  value: string[] | null, 
  onChange: (val: string[] | null) => void, 
  availableCapabilities: Capability[] 
}) {
  const [inputValue, setInputValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const currentValues = value || [];
  const cleanInput = inputValue.trim().toLowerCase();
  
  const filteredCaps = availableCapabilities.filter(c => 
    !currentValues.includes(c.identifier) && 
    (c.name.toLowerCase().includes(cleanInput) || c.identifier.toLowerCase().includes(cleanInput))
  );

  const handleAdd = (id: string) => {
    onChange([...currentValues, id]);
    setInputValue("");
    inputRef.current?.focus();
  };
  
  const handleRemove = (id: string) => {
    const next = currentValues.filter(v => v !== id);
    onChange(next.length > 0 ? next : null);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && cleanInput) {
      e.preventDefault();
      if (filteredCaps.length > 0) {
        handleAdd(filteredCaps[0].identifier);
      }
    } else if (e.key === 'Backspace' && !inputValue && currentValues.length > 0) {
      handleRemove(currentValues[currentValues.length - 1]);
    }
  };

  return (
    <div className="relative flex flex-col w-full">
      <div 
        className={cn(
          "flex flex-wrap gap-1.5 p-1.5 w-full rounded-md border bg-transparent min-h-[36px] text-sm shadow-sm transition-colors",
          isFocused ? "border-primary ring-1 ring-primary" : "border-input"
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {currentValues.map(v => {
          const cap = availableCapabilities.find(c => c.identifier === v);
          return (
            <span key={v} className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium cursor-default bg-muted text-foreground border">
              {cap ? cap.name : v}
              <button 
                type="button" 
                onClick={(e) => { e.stopPropagation(); handleRemove(v); }}
                className="hover:bg-black/10 rounded-full p-0.5 transition-colors"
              >
                <X className="size-3" />
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          onKeyDown={handleKeyDown}
          placeholder={currentValues.length === 0 ? "Search capabilities..." : ""}
          className="flex-1 bg-transparent outline-none min-w-[120px] px-1 text-sm placeholder:text-muted-foreground"
        />
      </div>
      
      {isFocused && (inputValue || filteredCaps.length > 0) && (
        <div className="absolute top-full mt-1 w-full bg-card border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
          {filteredCaps.map(c => (
            <div 
              key={c.identifier} 
              className="px-3 py-2 text-sm hover:bg-muted cursor-pointer flex flex-col"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleAdd(c.identifier)}
            >
              <span className="font-medium">{c.name}</span>
              <span className="text-[10px] text-muted-foreground">{c.identifier}</span>
            </div>
          ))}
          {filteredCaps.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground italic" onMouseDown={(e) => e.preventDefault()}>No matching capabilities.</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CapabilityPage() {
  const { token, isLoading: authLoading } = useAuth();
  const params = useParams();
  const router = useRouter();
  const teamId = String(params.id);
  const capabilityId = String(params.capabilityId);
  const isNew = capabilityId === "new";

  const [isLoading, setIsLoading] = useState(true);
  const [agents, setAgents] = useState<{id: string, name: string, type: string}[]>([]);
  const [allCapabilities, setAllCapabilities] = useState<Capability[]>([]);
  const [capability, setCapability] = useState<Capability>({
    id: "new", name: "", identifier: "", instructions: "", inputsDescription: "", 
    expectedOutputsDescription: "", suggestedNextCapabilities: null, isEnabled: true, scheduleConfig: null, 
    assignedAgentId: null, assignedRole: null, isFavorite: false
  });

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [agentsRes, capsRes] = await Promise.all([
        fetch(`${API_BASE}/agents?teamId=${teamId}`, { headers }),
        fetch(`${API_BASE}/teams/${teamId}/capabilities`, { headers })
      ]);

      if (agentsRes.ok) setAgents((await agentsRes.json()).data || []);
      
      let capabilitiesList: Capability[] = [];
      if (capsRes.ok) {
        capabilitiesList = (await capsRes.json()).data || [];
        setAllCapabilities(capabilitiesList);
      }

      if (!isNew) {
        const existingCap = capabilitiesList.find(c => c.id === capabilityId);
        if (existingCap) {
          setCapability(existingCap);
        } else {
          // Fallback fetch if not in the list (though the list should contain it)
          const singleRes = await fetch(`${API_BASE}/teams/${teamId}/capabilities/${capabilityId}`, { headers });
          if (singleRes.ok) {
            setCapability((await singleRes.json()).data);
          } else {
            toast.error("Capability not found.");
            router.push(`/teams/${teamId}/settings`);
          }
        }
      }
    } catch (err) { 
      toast.error("Failed to load capability data."); 
    } finally { 
      setIsLoading(false); 
    }
  }, [teamId, capabilityId, isNew, token, router]);

  useEffect(() => {
    if (!authLoading) {
      if (!token) router.replace("/login");
      else fetchData();
    }
  }, [authLoading, token, fetchData, router]);

  const saveCapability = async () => {
    if (!token) return;
    try {
      const url = isNew ? `${API_BASE}/teams/${teamId}/capabilities` : `${API_BASE}/teams/${teamId}/capabilities/${capabilityId}`;
      const method = isNew ? "POST" : "PUT";
      
      // Filter out 'id' from payload for updates if it causes issues, but backend usually ignores it.
      const payload = {
        name: capability.name,
        identifier: capability.identifier,
        instructions: capability.instructions,
        inputsDescription: capability.inputsDescription,
        expectedOutputsDescription: capability.expectedOutputsDescription,
        suggestedNextCapabilities: capability.suggestedNextCapabilities,
        isEnabled: capability.isEnabled,
        isFavorite: capability.isFavorite,
        scheduleConfig: capability.scheduleConfig,
        assignedAgentId: capability.assignedAgentId,
        assignedRole: capability.assignedRole
      };

      const res = await fetch(url, {
        method, 
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        toast.success(`Capability ${isNew ? 'created' : 'updated'}`);
        router.push(`/teams/${teamId}/settings`);
      } else {
        toast.error("Failed to save capability");
      }
    } catch (e) { 
      toast.error("Failed to save capability"); 
    }
  };

  if (authLoading || isLoading) return <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center"><Loader2 className="size-8 animate-spin text-primary" /></div>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4">
        <Link href={`/teams/${teamId}/settings`} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-fit">
          <ArrowLeft className="size-3.5" /> Back to Settings
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                {isNew ? "New Capability" : "Edit Capability"}
                <button
                  type="button"
                  onClick={() => setCapability({ ...capability, isFavorite: !capability.isFavorite })}
                  className="text-muted-foreground hover:text-amber-500 transition-colors"
                  title="Mark as favorite"
                >
                  <Star className={cn("size-6 mt-1", capability.isFavorite ? "fill-amber-500 text-amber-500" : "")} />
                </button>
              </h1>
              <div className="mt-2 space-y-1">
                <p className="text-muted-foreground text-sm">
                  A capability is a template for task execution. It defines exactly what an agent needs to do.
                </p>
                <p className="text-muted-foreground text-sm">
                  Detailing the inputs, execution instructions, and expected result (definition of done) is crucial for consistent and successful autonomous execution.
                </p>
              </div>
            </div>
          </div>
          <Button onClick={saveCapability} className="gap-2">
            <Save className="size-4" /> Save Capability
          </Button>
        </div>
      </div>

      <div className="space-y-8 pb-20">
        
        {/* 1. Name & Identifier */}
        <div className="rounded-xl border border-border bg-card shadow-sm p-6 space-y-6">
          <h2 className="text-lg font-semibold border-b pb-4">General</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input value={capability.name} onChange={e => {
                const newName = e.target.value;
                const oldSlug = capability.name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/(^-|-$)+/g, '');
                const newSlug = newName.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/(^-|-$)+/g, '');
                if (!capability.identifier || capability.identifier === oldSlug) {
                  setCapability({...capability, name: newName, identifier: newSlug});
                } else {
                  setCapability({...capability, name: newName});
                }
              }} placeholder="e.g. Write User Story" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Identifier</label>
              <Input value={capability.identifier} onChange={e => {
                const sanitized = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '');
                setCapability({...capability, identifier: sanitized});
              }} placeholder="e.g. write-user-story" />
            </div>
          </div>
        </div>

        {/* 2. Inputs */}
        <div className="rounded-xl border border-border bg-card shadow-sm p-6 space-y-6">
          <div className="flex justify-between items-center border-b pb-4">
            <h2 className="text-lg font-semibold">Inputs</h2>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground cursor-pointer flex items-center gap-2 select-none">
                <input 
                  type="checkbox" 
                  checked={capability.inputsDescription === null}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setCapability({...capability, inputsDescription: null});
                    } else {
                      setCapability({...capability, inputsDescription: ""});
                    }
                  }}
                  className="rounded border-input text-primary focus:ring-primary size-4"
                />
                No inputs needed
              </label>
            </div>
          </div>
          
          {capability.inputsDescription !== null && (
            <div className="grid grid-cols-1 gap-6 animate-in fade-in duration-200">
              <div className="space-y-2">
                <label className="text-sm font-medium">Input Requirements</label>
                <p className="text-xs text-muted-foreground mb-2">
                  Explain what information or context this capability needs to receive in order to be executed properly. This helps the orchestrator know what data to pass along.
                </p>
                <textarea 
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[80px]" 
                  value={capability.inputsDescription || ""} 
                  onChange={e => setCapability({...capability, inputsDescription: e.target.value})} 
                  placeholder="e.g., Needs a URL to scrape, or a structured JSON with user details..."
                />
              </div>
            </div>
          )}
        </div>

        {/* 3. Work to be done */}
        <div className="rounded-xl border border-border bg-card shadow-sm p-6 space-y-6">
          <h2 className="text-lg font-semibold border-b pb-4">Work to be done</h2>
          <div className="space-y-2">
            <label className="text-sm font-medium">Execution Instructions</label>
            <p className="text-xs text-muted-foreground mb-2">Describe step-by-step what the agent should do when executing this capability.</p>
            <textarea 
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[160px]" 
              value={capability.instructions} 
              onChange={e => setCapability({...capability, instructions: e.target.value})} 
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Expected Result (Definition of Done)</label>
            <p className="text-xs text-muted-foreground mb-2">What is the acceptance criteria or expected outcome? How do we know the work is complete?</p>
            <textarea 
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[80px]" 
              value={capability.expectedOutputsDescription || ""} 
              onChange={e => setCapability({...capability, expectedOutputsDescription: e.target.value})} 
            />
          </div>
        </div>

        {/* 4. Execution Rules */}
        <div className="rounded-xl border border-border bg-card shadow-sm p-6 space-y-6">
          <h2 className="text-lg font-semibold border-b pb-4">Execution Rules</h2>
          <div className="space-y-4">
            <label className="text-sm font-medium">Who can execute this?</label>
            <p className="text-xs text-muted-foreground">Select a specific role required to execute this capability, or leave as "Anyone" if any agent can do it.</p>
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCapability({...capability, assignedRole: null, assignedAgentId: null})}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium border transition-colors",
                  (!capability.assignedRole && !capability.assignedAgentId)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground hover:bg-muted border-input"
                )}
              >
                Anyone
              </button>
              {Array.from(new Set(agents.map(a => a.type))).map(role => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setCapability({...capability, assignedRole: role, assignedAgentId: null})}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium border transition-colors",
                    capability.assignedRole === role
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-foreground hover:bg-muted border-input"
                  )}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 5. Workflows */}
        <div className="rounded-xl border border-border bg-card shadow-sm p-6 space-y-6">
          <h2 className="text-lg font-semibold border-b pb-4">Workflows</h2>
          <div className="grid grid-cols-1 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium flex justify-between items-center">
                <span>Next Capabilities</span>
                <span className="text-[10px] text-muted-foreground font-normal">Sequential execution</span>
              </label>
              <p className="text-xs text-muted-foreground mb-2">
                Indicate the capabilities that should follow this one. These capabilities will be executed sequentially in the exact order they are listed here.
              </p>
              <SmartCapabilitySelect 
                value={capability.suggestedNextCapabilities || []} 
                onChange={v => setCapability({...capability, suggestedNextCapabilities: v})} 
                availableCapabilities={allCapabilities.filter(c => c.id !== capability.id)}
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

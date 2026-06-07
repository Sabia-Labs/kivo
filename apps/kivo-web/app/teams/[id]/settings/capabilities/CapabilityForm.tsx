import { useState } from "react";
import { X, Star, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface Capability {
  id?: string;
  name: string;
  identifier: string;
  instructions: string;
  inputsDescription: string | null;
  expectedOutputsDescription: string | null;
  tasksWorkflow: string[] | null;
  type: "task_template" | "workflow" | "human_approval" | "foreach";
  isEnabled: boolean;
  scheduleConfig: Record<string, any> | null;
  assignedAgentId: string | null;
  assignedRole: string | null;
  isFavorite: boolean;
  /** foreach-specific fields */
  loopOver?: string | null;
  loopItem?: string | null;
  runWorkflow?: string | null;
}

export function CapabilityForm({
  capability,
  setCapability,
  agents,
  allCapabilities,
  onSave,
  isSaving,
  isModal = false,
  onCancel
}: {
  capability: Capability;
  setCapability: (c: Capability) => void;
  agents: { id: string, name: string, roleId: string }[];
  allCapabilities: Capability[];
  onSave: () => void;
  isSaving: boolean;
  isModal?: boolean;
  onCancel?: () => void;
}) {
  return (
    <div className="space-y-8">
      {/* 1. Name & Identifier */}
      <div className={cn("rounded-xl border border-border bg-card shadow-sm p-6 space-y-6", isModal && "border-none shadow-none p-0")}>
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

      {/* 2. Capability Type Selector (only for non-workflows) */}
      {capability.type !== "workflow" && (
        <div className={cn("rounded-xl border border-border bg-card shadow-sm p-6 space-y-6", isModal && "border-none shadow-none p-0")}>
          <h2 className="text-lg font-semibold border-b pb-4">Capability Type</h2>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setCapability({ ...capability, type: "task_template" })}
              className={cn(
                "flex-1 p-4 rounded-xl border-2 transition-all text-left",
                capability.type === "task_template"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border hover:bg-muted/50 text-muted-foreground"
              )}
            >
              <h3 className="font-bold text-sm">Automated Task Template</h3>
              <p className="text-xs text-muted-foreground mt-1">Executed autonomously by an agent.</p>
            </button>
            <button
              type="button"
              onClick={() => setCapability({ ...capability, type: "human_approval", assignedRole: null, assignedAgentId: null })}
              className={cn(
                "flex-1 p-4 rounded-xl border-2 transition-all text-left",
                capability.type === "human_approval"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border hover:bg-muted/50 text-muted-foreground"
              )}
            >
              <h3 className="font-bold text-sm">Human Approval step</h3>
              <p className="text-xs text-muted-foreground mt-1">Pauses workflow execution to wait for a human operator.</p>
            </button>
          </div>
        </div>
      )}

      {/* 3. Inputs */}
      <div className={cn("rounded-xl border border-border bg-card shadow-sm p-6 space-y-6", isModal && "border-none shadow-none p-0")}>
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

      {/* 4. Work to be done */}
      <div className={cn("rounded-xl border border-border bg-card shadow-sm p-6 space-y-6", isModal && "border-none shadow-none p-0")}>
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

      {/* 5. Execution Rules */}
      {capability.type !== "human_approval" && (
        <div className={cn("rounded-xl border border-border bg-card shadow-sm p-6 space-y-6", isModal && "border-none shadow-none p-0")}>
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
              {Array.from(new Set(agents.map(a => a.roleId))).map(role => (
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
      )}

      {/* Actions for Modal */}
      {isModal && (
        <div className="flex justify-end gap-4 pt-6 border-t mt-8">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="button" onClick={onSave} disabled={isSaving}>
            {isSaving && <Loader2 className="size-4 animate-spin mr-2" />} Save Template
          </Button>
        </div>
      )}
    </div>
  );
}

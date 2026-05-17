import { useState, useRef } from "react";
import { Plus, X, ArrowDown, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Capability } from "./CapabilityForm";
import { cn } from "@/lib/utils";

import { SmartCapabilitySelect } from "@/components/smart-capability-select";

export function WorkflowBuilder({
  capability,
  setCapability,
  allCapabilities,
  onOpenNewCapabilityModal
}: {
  capability: Capability;
  setCapability: (c: Capability) => void;
  allCapabilities: Capability[];
  onOpenNewCapabilityModal: (index: number) => void;
}) {
  const tasks = capability.tasksWorkflow || [];
  
  // A node is open if it is the next empty slot in the sequence
  // If tasks has N items, the open node is index N.
  
  const handleUpdateNode = (index: number, identifier: string | null) => {
    let newTasks = [...tasks];
    if (identifier) {
      newTasks[index] = identifier;
    } else {
      // remove this node and all subsequent nodes
      newTasks = newTasks.slice(0, index);
    }
    setCapability({ ...capability, tasksWorkflow: newTasks });
  };

  const handleRemoveNode = (index: number) => {
    const newTasks = [...tasks];
    newTasks.splice(index, 1);
    setCapability({ ...capability, tasksWorkflow: newTasks });
  };

  return (
    <div className="space-y-8">
      {/* 1. Name & Identifier */}
      <div className="rounded-xl border border-border bg-card shadow-sm p-6 space-y-6">
        <h2 className="text-lg font-semibold border-b pb-4">General</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Workflow Name</label>
            <Input value={capability.name} onChange={e => {
              const newName = e.target.value;
              const oldSlug = capability.name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/(^-|-$)+/g, '');
              const newSlug = newName.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/(^-|-$)+/g, '');
              if (!capability.identifier || capability.identifier === oldSlug) {
                setCapability({ ...capability, name: newName, identifier: newSlug });
              } else {
                setCapability({ ...capability, name: newName });
              }
            }} placeholder="e.g. End-to-End Delivery" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Identifier</label>
            <Input value={capability.identifier} onChange={e => {
              const sanitized = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '');
              setCapability({ ...capability, identifier: sanitized });
            }} placeholder="e.g. e2e-delivery" />
          </div>
        </div>
      </div>

      {/* 2. Visual Builder */}
      <div className="rounded-xl border border-border bg-card shadow-sm p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Workflow Sequence</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Build your workflow by connecting task templates sequentially. The flow runs from top to bottom.
          </p>
        </div>

        <div className="flex flex-col items-center mt-8 py-4 bg-muted/20 rounded-lg border-dashed border-2 border-muted">
          {tasks.map((taskId, index) => {
            const cap = allCapabilities.find(c => c.identifier === taskId);
            return (
              <div key={`${taskId}-${index}`} className="flex flex-col items-center w-full max-w-md">
                {/* Node Box */}
                <div className="w-full bg-card border rounded-lg shadow-sm p-4 relative group transition-all hover:border-primary">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-sm">{cap ? cap.name : taskId}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5 font-mono">{taskId}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveNode(index)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-destructive/10 hover:text-destructive rounded-md transition-all"
                      title="Remove from workflow"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <div className="absolute -left-3 top-1/2 -translate-y-1/2 bg-muted text-muted-foreground text-xs font-bold rounded-full size-6 flex items-center justify-center border shadow-sm">
                    {index + 1}
                  </div>
                </div>

                {/* Arrow */}
                <div className="h-8 w-px bg-border my-1 relative">
                  <ArrowDown className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-border size-4" />
                </div>
              </div>
            );
          })}

          {/* Empty Node for Next Step */}
          <div className="flex flex-col items-center w-full max-w-md mt-4">
            <div className="w-full bg-card/50 border border-dashed rounded-lg shadow-sm p-4 relative">
              <h4 className="font-medium text-sm text-muted-foreground mb-3 flex items-center gap-2">
                Node {tasks.length + 1}
              </h4>
              
              <div className="flex flex-col gap-3">
                <SmartCapabilitySelect
                  key={`next-node-select-${tasks.length}`}
                  value={null}
                  onChange={(val) => handleUpdateNode(tasks.length, val)}
                  availableCapabilities={allCapabilities.filter(c => c.type === 'task_template')}
                />
                
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">Or</span>
                  </div>
                </div>

                <Button 
                  type="button" 
                  variant="outline" 
                  className="w-full border-dashed"
                  onClick={() => onOpenNewCapabilityModal(tasks.length)}
                >
                  <Plus className="size-4 mr-2" />
                  Add New Task Template
                </Button>
              </div>

              <div className="absolute -left-3 top-6 bg-muted/50 text-muted-foreground text-xs font-bold rounded-full size-6 flex items-center justify-center border border-dashed">
                {tasks.length + 1}
              </div>
            </div>

            {tasks.length > 0 && (
              <div className="mt-8 flex flex-col items-center opacity-50">
                <div className="h-6 w-px bg-border mb-1 relative"></div>
                <div className="px-4 py-1.5 bg-muted rounded-full text-xs font-medium border uppercase tracking-wider">
                  End of Workflow
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

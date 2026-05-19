"use client";

import { useState } from "react";
import {
  BookOpen,
  Search,
  FileText,
  FileSpreadsheet,
  FileImage,
  File,
  Download,
  FolderOpen,
  Plus
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function KnowledgePage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState<string>("");

  const mockFiles = [
    {
      id: "1",
      name: "q4_financial_report.pdf",
      size: "2.4 MB",
      type: "pdf",
      team: "Finance Squad",
      updatedAt: "2026-05-10T14:32:00.000Z"
    },
    {
      id: "2",
      name: "marketing_strategy.docx",
      size: "1.2 MB",
      type: "docx",
      team: "Marketing & Growth",
      updatedAt: "2026-05-15T09:15:00.000Z"
    },
    {
      id: "3",
      name: "kubernetes_deployment_specs.yaml",
      size: "45 KB",
      type: "yaml",
      team: "Engineering Alpha",
      updatedAt: "2026-05-18T16:40:00.000Z"
    },
    {
      id: "4",
      name: "customer_onboarding_guide.md",
      size: "12 KB",
      type: "md",
      team: "Customer Success",
      updatedAt: "2026-05-19T08:12:00.000Z"
    }
  ];

  const getFileIcon = (type: string) => {
    switch (type) {
      case "pdf":
      case "docx":
      case "md":
        return FileText;
      case "xlsx":
        return FileSpreadsheet;
      case "png":
      case "jpg":
        return FileImage;
      default:
        return File;
    }
  };

  const filteredFiles = mockFiles.filter(
    (file) =>
      file.name.toLowerCase().includes(search.toLowerCase()) ||
      file.team.toLowerCase().includes(search.toLowerCase())
  );

  const folderTabs = [
    { label: t.teamsPage.fileSystem.sharedContext, original: "Shared Context" },
    { label: t.teamsPage.fileSystem.taskArtifacts, original: "Task Artifacts" },
    { label: t.teamsPage.fileSystem.codeSpecs, original: "Code Specs" },
    { label: t.teamsPage.fileSystem.reports, original: "Reports" }
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-12 w-full flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* ── HEADER ── */}
      <header className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between border-b pb-6 border-border/40">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="size-5 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              {t.nav.knowledge}
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">
            {t.teamsPage.fileSystem.title}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t.teamsPage.fileSystem.subtitle}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={t.teamsPage.fileSystem.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 pl-9 pr-4 rounded-lg border border-border bg-card text-sm focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
          <Button onClick={() => toast.info(t.teamsPage.fileSystem.gitSyncHint)}>
            <Plus className="size-4 mr-2" />
            {t.teamsPage.fileSystem.upload}
          </Button>
        </div>
      </header>

      {/* ── FOLDERS ROW ── */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        {folderTabs.map((tab) => (
          <div
            key={tab.original}
            className="flex items-center gap-3 p-4 rounded-xl border bg-card hover:bg-accent/40 cursor-pointer transition-colors"
          >
            <FolderOpen className="size-5 text-primary shrink-0" />
            <span className="text-sm font-semibold truncate">{tab.label}</span>
          </div>
        ))}
      </div>

      {/* ── FILE SYSTEM CONTAINER ── */}
      <div className="rounded-xl border bg-card/40 overflow-hidden shadow-sm">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-border/40 bg-muted/5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <div className="col-span-6">{t.teamsPage.fileSystem.filename}</div>
          <div className="col-span-3">{t.teamsPage.fileSystem.teamContext}</div>
          <div className="col-span-3 text-right pr-4">{t.teamsPage.fileSystem.fileSize}</div>
        </div>

        {/* File Rows */}
        {filteredFiles.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            {t.teamsPage.fileSystem.noFilesFound.replace("{search}", search)}
          </div>
        ) : (
          <div className="flex flex-col w-full divide-y">
            {filteredFiles.map((file) => {
              const Icon = getFileIcon(file.type);
              return (
                <div
                  key={file.id}
                  className="grid grid-cols-12 gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors items-center group relative text-sm"
                >
                  <div className="col-span-6 flex items-center gap-3 min-w-0">
                    <Icon className="size-4.5 shrink-0 text-muted-foreground/70" />
                    <span className="font-semibold truncate text-foreground">{file.name}</span>
                  </div>
                  <div className="col-span-3 text-xs text-muted-foreground truncate font-medium">
                    {file.team}
                  </div>
                  <div className="col-span-3 text-right pr-4 flex items-center justify-end gap-2">
                    <span className="text-xs text-muted-foreground">{file.size}</span>

                    {/* Download hover button */}
                    <div className="opacity-0 group-hover:opacity-100 transition-all duration-200 absolute right-4 bg-background border px-1.5 py-1 rounded-lg shadow-sm">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-foreground hover:bg-muted"
                        title={t.teamsPage.fileSystem.download}
                        onClick={() => toast.success(`${t.teamsPage.fileSystem.download} ${file.name}...`)}
                      >
                        <Download className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

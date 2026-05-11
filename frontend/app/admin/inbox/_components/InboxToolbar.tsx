"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/app/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/app/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/components/ui/popover";
import { Checkbox } from "@/app/components/ui/checkbox";
import {
  RefreshCw,
  Globe,
  MessageCircle,
  Layers,
  Users,
  UserCheck,
  UserX,
  Bell,
  BellDot,
  SlidersHorizontal,
  ChevronDown,
  Check,
} from "lucide-react";
import {
  TABS,
  type TabKey,
  type ChannelKey,
  type DatosKey,
  type ExtraColumnKey,
} from "./inboxConfig";

interface InboxToolbarProps {
  // Tabs
  activeTab: TabKey;
  tabCounts: Record<TabKey, number>;
  onTabChange: (tab: TabKey) => void;
  // Channel
  activeChannel: ChannelKey;
  onChannelChange: (channel: ChannelKey) => void;
  // Datos
  activeDatos: DatosKey;
  onDatosChange: (datos: DatosKey) => void;
  // Solo no vistos
  onlyUnseen: boolean;
  onOnlyUnseenChange: (next: boolean) => void;
  // Column extras
  extras: Set<ExtraColumnKey>;
  onExtraToggle: (key: ExtraColumnKey) => void;
  // Refresh
  refreshing: boolean;
  onRefresh: () => void;
}

// Single dense filter row. Tabs (left) keep prominence; every secondary filter
// is a popover-trigger button that shows its current selection inline so the
// user never has to hover to discover meaning. Consistent shape across all
// three secondary filters: Canal · Datos · Extras.

type IconType = React.ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

function InboxToolbarImpl({
  activeTab,
  tabCounts,
  onTabChange,
  activeChannel,
  onChannelChange,
  activeDatos,
  onDatosChange,
  onlyUnseen,
  onOnlyUnseenChange,
  extras,
  onExtraToggle,
  refreshing,
  onRefresh,
}: InboxToolbarProps) {
  const extrasCount = extras.size;

  const channelOptions: FilterOption<ChannelKey>[] = [
    { value: "todos", label: "Todos", icon: Layers },
    { value: "web", label: "Web", icon: Globe },
    { value: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  ];
  const datosOptions: FilterOption<DatosKey>[] = [
    { value: "todos", label: "Todos", icon: Users },
    { value: "leads", label: "Con datos", icon: UserCheck },
    { value: "sin_datos", label: "Sin datos", icon: UserX },
  ];

  const channelLabel =
    channelOptions.find((o) => o.value === activeChannel)?.label ?? "Todos";
  const datosLabel =
    datosOptions.find((o) => o.value === activeDatos)?.label ?? "Todos";

  return (
    <TooltipProvider delayDuration={250} skipDelayDuration={100}>
      <div
        role="toolbar"
        aria-label="Filtros del inbox"
        className={cn(
          "flex h-11 items-center gap-2 overflow-x-auto overscroll-contain px-1",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "[&>*]:flex-none motion-reduce:[&_*]:!transition-none",
        )}
      >
        {/* ── Primary tabs ─────────────────────────────────────────────── */}
        <div
          role="tablist"
          aria-label="Filtro por estado"
          className="inline-flex h-8 items-center gap-0.5 rounded-lg border border-border/60 bg-card p-0.5"
        >
          {TABS.map((t) => {
            const isActive = activeTab === t.key;
            const count = tabCounts[t.key];
            return (
              <button
                key={t.key}
                role="tab"
                type="button"
                aria-selected={isActive}
                aria-current={isActive ? "page" : undefined}
                onClick={() => onTabChange(t.key)}
                className={cn(
                  "group relative inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 font-heading text-[11.5px] font-semibold leading-none",
                  "transition-all duration-150 ease-out",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 focus-visible:ring-offset-card",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-primary/[0.06] hover:text-foreground",
                )}
              >
                <span>{t.label}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-px font-mono text-[10px] font-bold tabular-nums transition-colors",
                    isActive
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <Divider />

        {/* ── Canal (popover) ──────────────────────────────────────────── */}
        <FilterPopover
          ariaLabel="Filtrar por canal"
          prefix="Canal"
          icon={Globe}
          options={channelOptions}
          value={activeChannel}
          onChange={onChannelChange}
          activeWhen={(v) => v !== "todos"}
          currentLabel={channelLabel}
        />

        {/* ── Datos (popover) ──────────────────────────────────────────── */}
        <FilterPopover
          ariaLabel="Filtrar por datos del lead"
          prefix="Datos"
          icon={Users}
          options={datosOptions}
          value={activeDatos}
          onChange={onDatosChange}
          activeWhen={(v) => v !== "todos"}
          currentLabel={datosLabel}
        />

        {/* ── Solo no vistos (binary toggle, labelled inline) ──────────── */}
        <button
          type="button"
          onClick={() => onOnlyUnseenChange(!onlyUnseen)}
          aria-pressed={onlyUnseen}
          aria-label={
            onlyUnseen ? "Mostrando solo no vistos" : "Mostrar solo no vistos"
          }
          className={cn(
            "relative inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5",
            "font-heading text-[11.5px] font-semibold leading-none",
            "transition-colors duration-150 ease-out",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            onlyUnseen
              ? "border-warning/40 bg-warning/[0.12] text-warning"
              : "border-border/60 bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
          )}
        >
          {onlyUnseen ? (
            <BellDot className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Bell className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span>Solo no vistos</span>
          {onlyUnseen && (
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-warning ring-2 ring-card"
            />
          )}
        </button>

        {/* Spacer pushes trailing controls to the right. */}
        <div className="flex-1" aria-hidden="true" style={{ minWidth: "0.5rem" }} />

        {/* ── Column extras (popover) ──────────────────────────────────── */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={
                extrasCount > 0
                  ? `Extras (${extrasCount} activas)`
                  : "Columnas adicionales"
              }
              aria-haspopup="dialog"
              className={cn(
                "group inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5",
                "font-heading text-[11.5px] font-semibold leading-none",
                "transition-colors duration-150 ease-out",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                "data-[state=open]:border-foreground/30",
                extrasCount > 0
                  ? "border-primary/30 bg-primary/[0.06] text-primary ring-1 ring-primary/20"
                  : "border-border/60 bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Extras</span>
              {extrasCount > 0 && (
                <span
                  aria-hidden="true"
                  className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[9px] font-bold tabular-nums leading-none text-primary-foreground"
                >
                  +{extrasCount}
                </span>
              )}
              <ChevronDown
                className="h-3 w-3 transition-transform duration-150 group-data-[state=open]:rotate-180"
                aria-hidden="true"
              />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={6} className="w-60 p-2">
            <div className="px-2 pb-2 pt-1">
              <p className="font-heading text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Columnas adicionales
              </p>
            </div>
            <ExtraOption
              checked={extras.has("sin_valor")}
              onCheckedChange={() => onExtraToggle("sin_valor")}
              label="Sin valor"
              hint="Leads descartados por el bot"
            />
            <ExtraOption
              checked={extras.has("completado")}
              onCheckedChange={() => onExtraToggle("completado")}
              label="Completado"
              hint="Conversaciones cerradas"
            />
          </PopoverContent>
        </Popover>

        {/* ── Refresh ──────────────────────────────────────────────────── */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              className="h-8 w-8 rounded-md border-border/60 p-0"
              aria-label="Actualizar"
            >
              <RefreshCw
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  refreshing && "animate-spin",
                )}
                aria-hidden="true"
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Actualizar</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function Divider() {
  return <span aria-hidden="true" className="h-5 w-px bg-border/60" />;
}

interface FilterOption<V extends string> {
  value: V;
  label: string;
  icon: IconType;
}

interface FilterPopoverProps<V extends string> {
  ariaLabel: string;
  prefix: string;
  icon: IconType;
  options: FilterOption<V>[];
  value: V;
  onChange: (next: V) => void;
  activeWhen: (value: V) => boolean;
  currentLabel: string;
}

// Single-source-of-truth popover trigger for radio-style filters.
// Trigger shows "Prefix: CurrentLabel" + chevron. Popover lists options as a
// listbox with check marks. Selecting closes the popover.
function FilterPopover<V extends string>({
  ariaLabel,
  prefix,
  icon: Icon,
  options,
  value,
  onChange,
  activeWhen,
  currentLabel,
}: FilterPopoverProps<V>) {
  const [open, setOpen] = React.useState(false);
  const isActive = activeWhen(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            "group inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5",
            "font-heading text-[11.5px] font-semibold leading-none",
            "transition-colors duration-150 ease-out",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            isActive
              ? "border-primary/30 bg-primary/[0.06] text-primary ring-1 ring-primary/20"
              : "border-border/60 bg-background text-foreground/80 hover:border-foreground/30 hover:text-foreground",
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          <span>
            <span className="text-muted-foreground">{prefix}:</span>{" "}
            <span>{currentLabel}</span>
          </span>
          <ChevronDown
            className={cn(
              "h-3 w-3 transition-transform duration-150",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-52 p-1">
        <ul role="listbox" aria-label={ariaLabel} className="flex flex-col">
          {options.map((opt) => {
            const OptIcon = opt.icon;
            const selected = value === opt.value;
            return (
              <li key={opt.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left",
                    "transition-colors duration-150",
                    "focus-visible:outline-none focus-visible:bg-muted",
                    selected
                      ? "bg-primary/[0.08] text-primary"
                      : "text-foreground hover:bg-muted",
                  )}
                >
                  <OptIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="flex-1 font-heading text-[12.5px] font-medium">
                    {opt.label}
                  </span>
                  {selected && (
                    <Check
                      className="h-3.5 w-3.5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

interface ExtraOptionProps {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  label: string;
  hint: string;
}

function ExtraOption({ checked, onCheckedChange, label, hint }: ExtraOptionProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-md px-2 py-2",
        "transition-colors duration-150",
        "hover:bg-muted",
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="font-heading text-[12.5px] font-semibold text-foreground">
          {label}
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>
      </div>
    </label>
  );
}

export const InboxToolbar = React.memo(InboxToolbarImpl);

import React from "react";
import type { TabKey, DatosKey } from "./inboxConfig";

interface EmptyStateProps {
  tab: TabKey;
  datos: DatosKey;
}

function EmptyStateImpl({ tab, datos }: EmptyStateProps) {
  // Datos filter takes precedence — it's a more specific signal than tab.
  if (datos === "sin_datos") {
    return (
      <Shell
        title="No hay conversaciones anónimas"
        hint="Todos los visitantes activos ya compartieron sus datos."
      />
    );
  }
  if (datos === "leads") {
    return (
      <Shell
        title="Sin leads capturados"
        hint="Aún no hay conversaciones con datos del lead en este filtro."
      />
    );
  }

  const messages: Record<TabKey, { title: string; hint: string }> = {
    todos: {
      title: "Sin conversaciones",
      hint: "Cuando lleguen mensajes nuevos aparecerán aquí.",
    },
    pendientes: {
      title: "Nadie esperando",
      hint: "El bot está manejando todas las conversaciones por ahora.",
    },
    mias: {
      title: "No tienes conversaciones activas",
      hint: "Cuando tomes una conversación, aparecerá aquí.",
    },
    bot: {
      title: "Sin tráfico del bot",
      hint: "El bot no tiene conversaciones activas en este momento.",
    },
  };
  const m = messages[tab];
  return <Shell title={m.title} hint={m.hint} />;
}

function Shell({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 px-6 text-center motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
      <p className="font-heading text-[14px] font-semibold text-foreground">
        {title}
      </p>
      <p className="max-w-[300px] text-[12px] text-muted-foreground">{hint}</p>
    </div>
  );
}

export const EmptyState = React.memo(EmptyStateImpl);

"use client";
import React, { useState, useCallback } from "react";
import { PlayCircle } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { toast } from "sonner";
import { previewPersonality } from "@/app/lib/services/botConfigService";

interface PersonalityPreviewCardProps {
  prompt: string;
  temperature: number;
  disabled?: boolean;
}

export function PersonalityPreviewCard({
  prompt,
  temperature,
  disabled,
}: PersonalityPreviewCardProps) {
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handlePreview = useCallback(async () => {
    if (!message.trim()) {
      toast.error("Escribe un mensaje de prueba primero.");
      return;
    }
    setLoading(true);
    setResponse(null);
    try {
      const res = await previewPersonality({
        prompt: prompt.trim() || "Eres un asistente virtual.",
        temperature,
        test_message: message.trim(),
      });
      setResponse(res.response);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Error al previsualizar",
      );
    } finally {
      setLoading(false);
    }
  }, [prompt, temperature, message]);

  return (
    <div
      className="glass rounded-xl border border-border/60 overflow-hidden"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 bg-accent-cyan/8">
        <PlayCircle
          className="w-3.5 h-3.5 text-accent-cyan flex-shrink-0"
          aria-hidden="true"
        />
        <span className="text-xs font-semibold text-foreground">
          Probar sin guardar
        </span>
      </div>
      <div className="px-4 py-4 space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading) handlePreview();
            }}
            placeholder="Escribe un mensaje de prueba…"
            maxLength={500}
            disabled={disabled || loading}
            className="flex-1 h-8 px-3 text-xs rounded-lg border border-border/70 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent-cyan/50 focus:border-accent-cyan/40 transition-colors disabled:opacity-50"
            aria-label="Mensaje de prueba para previsualización"
          />
          <Button
            type="button"
            size="sm"
            onClick={handlePreview}
            disabled={loading || !message.trim() || disabled}
            className="h-8 text-xs shrink-0 border-accent-cyan/30 text-accent-cyan hover:bg-accent-cyan/10 hover:border-accent-cyan/50"
            variant="outline"
          >
            {loading ? "…" : "Probar"}
          </Button>
        </div>
        {response !== null && (
          <div
            className="rounded-lg bg-background/80 border border-border/60 px-3 py-2.5 text-xs text-foreground leading-relaxed"
            aria-live="polite"
            aria-atomic="true"
          >
            <span className="block mb-1.5 text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-wide">
              Respuesta del bot
            </span>
            {response}
          </div>
        )}
        {!response && (
          <p className="text-[11px] text-muted-foreground">
            Prueba la personalidad con el prompt y temperatura actuales, sin
            necesidad de guardar primero.
          </p>
        )}
      </div>
    </div>
  );
}

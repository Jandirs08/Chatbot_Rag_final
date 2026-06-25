import React from "react";
import Image from "next/image";
import { User } from "lucide-react";
import type { Message } from "@/types/chat";
export type { Message };
import MarkdownRenderer from "@/app/components/ui/markdown-renderer";
import { cn } from "@/lib/utils";

const AVATAR_SIZE = 28;

const formatTime = (date?: Date) => {
  const d = date ? new Date(date) : new Date();
  // 24h estándar internacional, sin saltos por sufijo a.m./p.m.
  return d.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

function BotAvatar({ logoUrl }: { logoUrl?: string }) {
  if (logoUrl) {
    return (
      <div
        className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand ring-1 ring-black/5 shadow-[0_2px_6px_-2px_rgb(0_0_0_/_0.15)]"
        style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, minWidth: AVATAR_SIZE }}
      >
        <Image
          src={logoUrl}
          alt="bot"
          width={AVATAR_SIZE}
          height={AVATAR_SIZE}
          className="h-full w-full object-cover"
          unoptimized
        />
      </div>
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-brand ring-1 ring-black/5 shadow-[0_2px_6px_-2px_rgb(0_0_0_/_0.15)]"
      style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, minWidth: AVATAR_SIZE }}
    >
      <svg viewBox="0 0 24 24" fill="white" width="14" height="14" aria-hidden="true">
        <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7H3a7 7 0 0 1 7-7h1V5.73A2 2 0 0 1 12 2zM7.5 14a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-9 5a5 5 0 0 0 9 0H7.5z" />
      </svg>
    </div>
  );
}

function UserAvatar() {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-surface-elevated ring-1 ring-black/[0.08] shadow-[0_1px_3px_-1px_rgb(0_0_0_/_0.12)]"
      style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, minWidth: AVATAR_SIZE }}
      aria-hidden="true"
    >
      <User className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2.2} />
    </div>
  );
}

function AvatarSpacer() {
  return (
    <div
      className="shrink-0"
      style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, minWidth: AVATAR_SIZE }}
      aria-hidden="true"
    />
  );
}

export const TypingIndicator = React.memo(function TypingIndicator({ logoUrl }: { logoUrl?: string }) {
  return (
    <div className="flex items-start gap-2 animate-bubble-in">
      <BotAvatar logoUrl={logoUrl} />
      <div className="rounded-2xl rounded-bl-md bg-muted px-4 py-3 ring-1 ring-black/5 shadow-sm">
        <div
          className="typing-indicator text-muted-foreground"
          aria-label="Escribiendo"
        >
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>
  );
});

export const ChatMessageBubble = React.memo(function ChatMessageBubble(props: {
  message: Message;
  isMostRecent: boolean;
  messageCompleted: boolean;
  botName?: string;
  showTimestamp?: boolean;
  showAvatar?: boolean;
  logoUrl?: string;
  animateEntry?: boolean;
}) {
  const { role, content, createdAt } = props.message;
  const {
    showTimestamp = true,
    showAvatar = true,
    logoUrl,
    isMostRecent,
    messageCompleted,
    animateEntry = true,
  } = props;
  const isUser = role === "user";
  const showStreamingCaret = !isUser && isMostRecent && !messageCompleted;

  // Lock the entry-animation decision to first render. Sin esto, el bubble
  // re-aplica la animación cuando el prop cambia (ej. termina streaming →
  // animateEntry pasa false→true), causando un parpadeo no deseado.
  const initialAnimateRef = React.useRef(animateEntry);
  const shouldAnimate = initialAnimateRef.current;

  // Skip render: assistant message without content and not actively streaming.
  // Evita burbujas vacías por respuestas truncadas o eventos sin texto.
  if (!isUser && !showStreamingCaret && (!content || content.trim() === "")) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-start gap-2",
        shouldAnimate && "animate-bubble-in",
      )}
    >
      {!isUser && (showAvatar ? <BotAvatar logoUrl={logoUrl} /> : <AvatarSpacer />)}

      <div
        className={cn(
          "flex min-w-0 flex-col gap-1",
          isUser
            ? "items-end max-w-[78%] sm:max-w-[68%]"
            : "items-start max-w-[78%] sm:max-w-[72%]",
        )}
      >
        {isUser ? (
          <div className="rounded-2xl rounded-br-md bg-brand px-4 py-3 shadow-[0_2px_8px_-2px_hsl(var(--primary)/0.35)] transition-shadow hover:shadow-[0_4px_12px_-2px_hsl(var(--primary)/0.45)]">
            <p className="m-0 whitespace-pre-wrap break-words text-[15px] leading-[1.55] text-brand-foreground">
              {content}
            </p>
          </div>
        ) : (
          <div
            className="rounded-2xl rounded-bl-md bg-surface-elevated px-4 py-3 ring-1 ring-black/[0.06] shadow-[0_1px_3px_0_rgb(0_0_0_/_0.04)] transition-shadow hover:shadow-[0_2px_8px_-2px_rgb(0_0_0_/_0.08)]"
            aria-busy={showStreamingCaret}
          >
            {showStreamingCaret && (
              <span className="sr-only">Escribiendo…</span>
            )}
            <div
              className={cn(
                "text-[15px] leading-[1.6] text-foreground",
                showStreamingCaret && "stream-caret",
              )}
            >
              <MarkdownRenderer content={content} />
            </div>
          </div>
        )}

        {showTimestamp && createdAt && (
          <span
            className={cn(
              "whitespace-nowrap px-1 text-[11px] tabular-nums text-muted-foreground/80",
              isUser ? "text-right" : "text-left",
            )}
          >
            {formatTime(createdAt)}
          </span>
        )}
      </div>

      {isUser && (showAvatar ? <UserAvatar /> : <AvatarSpacer />)}
    </div>
  );
});

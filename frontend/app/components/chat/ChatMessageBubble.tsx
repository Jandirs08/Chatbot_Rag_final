import React from "react";
import type { Message } from "@/types/chat";
export type { Message };
import MarkdownRenderer from "@/app/components/ui/markdown-renderer";

// Hora — siempre visible, fallback a ahora
const formatTime = (date?: Date) => {
  const d = date ? new Date(date) : new Date();
  return d
    .toLocaleTimeString("es-ES", { hour: "numeric", minute: "2-digit", hour12: true })
    .toLowerCase();
};

// Avatar del bot — círculo de color con inicial/ícono
const BotAvatar = () => (
  <div
    className="flex shrink-0 items-center justify-center rounded-full bg-brand shadow-sm"
    style={{ width: 34, height: 34, minWidth: 34 }}
  >
    <svg viewBox="0 0 24 24" fill="white" width="17" height="17">
      <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7H3a7 7 0 0 1 7-7h1V5.73A2 2 0 0 1 12 2zM7.5 14a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-9 5a5 5 0 0 0 9 0H7.5z" />
    </svg>
  </div>
);

// Avatar del usuario — círculo gris neutro
const UserAvatar = () => (
  <div
    className="flex shrink-0 items-center justify-center rounded-full bg-slate-300 shadow-sm"
    style={{ width: 34, height: 34, minWidth: 34 }}
  >
    <svg viewBox="0 0 24 24" fill="white" width="17" height="17">
      <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
    </svg>
  </div>
);

// Indicador de escritura
export const TypingIndicator = React.memo(function TypingIndicator() {
  return (
    <div className="flex items-end gap-2.5 animate-bubble-in">
      <BotAvatar />
      <div className="rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-1.5">
          <div className="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <span className="text-xs italic text-slate-400 ml-1">Escribiendo...</span>
        </div>
      </div>
    </div>
  );
});

export const ChatMessageBubble = React.memo(function ChatMessageBubble(props: {
  message: Message;
  aiEmoji?: string;
  isMostRecent: boolean;
  messageCompleted: boolean;
  botName?: string;
}) {
  const { role, content, createdAt } = props.message;
  const isUser = role === "user";

  return (
    <div className={`flex items-end gap-2.5 animate-bubble-in ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar fijo abajo */}
      {isUser ? <UserAvatar /> : <BotAvatar />}

      {/* Burbuja + timestamp */}
      <div className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"} ${
        isUser ? "max-w-[62%]" : "max-w-[72%]"
      }`}>

        {isUser ? (
          /* ─── BURBUJA USUARIO: gradiente azul intenso ─── */
          <div className="rounded-2xl rounded-br-sm bg-gradient-to-br from-blue-500 to-blue-600 px-4 py-3 shadow-md shadow-blue-500/20">
            <p className="text-sm leading-relaxed text-white whitespace-pre-wrap break-words m-0">
              {content}
            </p>
          </div>
        ) : (
          /* ─── BURBUJA BOT: gris suave muy claro ─── */
          <div className="rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-3 shadow-sm">
            <div className="text-sm leading-relaxed text-slate-800">
              <MarkdownRenderer content={content} />
            </div>
          </div>
        )}

        {/* Timestamp */}
        <span className={`text-[10px] text-slate-400 px-1 ${isUser ? "text-right" : "text-left"}`}>
          {formatTime(createdAt)}
        </span>
      </div>
    </div>
  );
});

import React from "react";
import type { Message } from "@/types/chat";
export type { Message };
import MarkdownRenderer from "@/app/components/ui/markdown-renderer";
import Image from "next/image";

// Formateador de hora
const formatTime = (date?: Date) => {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleTimeString("es-ES", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).toLowerCase();
};

// Avatar del bot
const BotAvatar = ({ className = "" }: { className?: string }) => (
  <Image
    src="/avatar-chat-1.png"
    alt="Bot"
    width={32}
    height={32}
    className={`rounded-full flex-shrink-0 ${className}`}
  />
);

// Avatar del usuario
const UserAvatar = ({ className = "" }: { className?: string }) => (
  <Image
    src="/avatar-chat-2.jpg"
    alt="Usuario"
    width={32}
    height={32}
    className={`rounded-full flex-shrink-0 ${className}`}
  />
);

// Indicador de escritura con avatar
export const TypingIndicator = React.memo(function TypingIndicator() {
  return (
    <div className="flex items-end gap-2">
      <BotAvatar className="w-8 h-8 shadow-sm" />
      <div className="flex flex-col items-start">
        <div className="bg-white border border-gray-100 dark:bg-slate-800 dark:border-slate-700 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 italic">
              Escribiendo...
            </span>
          </div>
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
    <div className={`flex items-end gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar - posicionado abajo de la burbuja */}
      {isUser ? (
        <UserAvatar className="w-8 h-8 shadow-sm" />
      ) : (
        <BotAvatar className="w-8 h-8 shadow-sm" />
      )}

      {/* Contenedor de burbuja + timestamp */}
      <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} max-w-[85%] sm:max-w-[75%]`}>
        {/* Burbuja del mensaje */}
        <div
          className={`px-4 py-3 shadow-sm text-sm sm:text-base ${isUser
              ? "bg-muted border border-border text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 rounded-2xl rounded-br-none"
              : "bg-primary/10 border border-primary/30 text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 rounded-2xl rounded-bl-none"
            }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap leading-relaxed break-words">
              {content}
            </p>
          ) : (
            <MarkdownRenderer content={content} />
          )}
        </div>

        {/* Timestamp - color más sutil */}
        {createdAt && (
          <span className={`text-[10px] mt-1 px-1 ${isUser ? "text-right" : "text-left"} text-slate-400 dark:text-slate-500`}>
            {formatTime(createdAt)}
          </span>
        )}
      </div>
    </div>
  );
});

import React from "react";
import Image from "next/image";
import type { Message } from "@/types/chat";
export type { Message };
import MarkdownRenderer from "@/app/components/ui/markdown-renderer";

const AVATAR_SIZE = 32;

const formatTime = (date?: Date) => {
  const d = date ? new Date(date) : new Date();
  return d
    .toLocaleTimeString("es-ES", { hour: "numeric", minute: "2-digit", hour12: true })
    .toLowerCase();
};

function BotAvatar({ logoUrl }: { logoUrl?: string }) {
  if (logoUrl) {
    return (
      <div
        className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand"
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
      className="flex shrink-0 items-center justify-center rounded-full bg-brand"
      style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, minWidth: AVATAR_SIZE }}
    >
      <svg viewBox="0 0 24 24" fill="white" width="16" height="16" aria-hidden="true">
        <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7H3a7 7 0 0 1 7-7h1V5.73A2 2 0 0 1 12 2zM7.5 14a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-9 5a5 5 0 0 0 9 0H7.5z" />
      </svg>
    </div>
  );
}

function UserAvatar() {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-slate-300"
      style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, minWidth: AVATAR_SIZE }}
    >
      <svg viewBox="0 0 24 24" fill="white" width="16" height="16" aria-hidden="true">
        <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
      </svg>
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
    <div className="flex items-end gap-2.5 animate-bubble-in">
      <BotAvatar logoUrl={logoUrl} />
      <div className="rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-3">
        <div className="typing-indicator">
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
}) {
  const { role, content, createdAt } = props.message;
  const { showTimestamp = true, showAvatar = true, logoUrl } = props;
  const isUser = role === "user";

  return (
    <div className={`flex items-end gap-2.5 animate-bubble-in ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {showAvatar ? (
        isUser ? <UserAvatar /> : <BotAvatar logoUrl={logoUrl} />
      ) : (
        <AvatarSpacer />
      )}

      <div className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"} ${
        isUser ? "max-w-[72%]" : "max-w-[78%]"
      }`}>

        {isUser ? (
          <div className="rounded-2xl rounded-br-sm bg-brand px-4 py-2.5">
            <p className="text-[15px] leading-relaxed text-brand-foreground whitespace-pre-wrap break-words m-0">
              {content}
            </p>
          </div>
        ) : (
          <div className="rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-2.5">
            <div className="text-[15px] leading-relaxed text-slate-800">
              <MarkdownRenderer content={content} />
            </div>
          </div>
        )}

        {showTimestamp && (
          <span className={`text-[10px] tracking-wide text-slate-400 px-1 ${isUser ? "text-right" : "text-left"}`}>
            {formatTime(createdAt)}
          </span>
        )}
      </div>
    </div>
  );
});

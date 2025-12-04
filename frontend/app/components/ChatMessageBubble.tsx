import React from "react";
import type { Message } from "@/types/chat";
import MarkdownRenderer from "./ui/markdown-renderer";

export const ChatMessageBubble = React.memo(function ChatMessageBubble(props: {
  message: Message;
  aiEmoji?: string;
  isMostRecent: boolean;
  messageCompleted: boolean;
  botName?: string;
}) {
  const { role, content } = props.message;
  const isUser = role === "user";

  return (
    <div
      className={`${
        isUser
          ? "bg-orange-500 text-white"
          : "bg-gray-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 dark:border dark:border-slate-700"
      } rounded-2xl p-3 sm:p-4 shadow-sm max-w-[85%] break-words`}
    >
      {isUser ? (
        <div className="flex flex-col items-end">
          <p className="whitespace-pre-wrap leading-relaxed text-sm sm:text-base">
            {content}
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-start w-full">
          <div className="flex items-center gap-2 mb-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <span>{props.aiEmoji || "🤖"}</span>
            <span>{props.botName || "Asistente"}</span>
            {!props.messageCompleted && (
              <div className="ml-2">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            )}
          </div>
          <MarkdownRenderer content={content} />
        </div>
      )}
    </div>
  );
});

import { emojisplosion } from "emojisplosion";
import { useState, useRef } from "react";
import { SourceBubble, Source } from "./SourceBubble";
import { sendFeedback } from "../utils/sendFeedback";
import { apiBaseUrl } from "../utils/constants";
import { InlineCitation } from "./InlineCitation";
import React from "react";

export type Message = {
  id: string;
  createdAt?: Date;
  content: string;
  role: "system" | "user" | "assistant" | "function";
  runId?: string;
  name?: string;
  function_call?: { name: string };
};
export type Feedback = {
  feedback_id: string;
  run_id: string;
  key: string;
  score: number;
  comment?: string;
};

const filterSources = (sources: Source[]) => {
  const filtered: Source[] = [];
  const urlMap = new Map<string, number>();
  const indexMap = new Map<number, number>();
  sources.forEach((source, i) => {
    const { url } = source;
    const index = urlMap.get(url);
    if (index === undefined) {
      urlMap.set(url, i);
      indexMap.set(i, filtered.length);
      filtered.push(source);
    } else {
      const resolvedIndex = indexMap.get(index);
      if (resolvedIndex !== undefined) {
        indexMap.set(i, resolvedIndex);
      }
    }
  });
  return { filtered, indexMap };
};

const createAnswerElements = (
  content: string,
  filteredSources: Source[],
  sourceIndexMap: Map<number, number>,
  highlighedSourceLinkStates: boolean[],
  setHighlightedSourceLinkStates: React.Dispatch<
    React.SetStateAction<boolean[]>
  >,
) => {
  const matches = Array.from(content.matchAll(/\[\^?(\d+)\^?\]/g));
  const elements: JSX.Element[] = [];
  let prevIndex = 0;

  matches.forEach((match) => {
    const sourceNum = parseInt(match[1], 10);
    const resolvedNum = sourceIndexMap.get(sourceNum) ?? 10;
    if (match.index !== null && resolvedNum < filteredSources.length) {
      elements.push(
        <span
          key={`content:${prevIndex}`}
          dangerouslySetInnerHTML={{
            __html: content.slice(prevIndex, match.index),
          }}
        ></span>,
      );
      elements.push(
        <InlineCitation
          key={`citation:${prevIndex}`}
          source={filteredSources[resolvedNum]}
          sourceNumber={resolvedNum}
          highlighted={highlighedSourceLinkStates[resolvedNum]}
          onMouseEnter={() =>
            setHighlightedSourceLinkStates(
              filteredSources.map((_, i) => i === resolvedNum),
            )
          }
          onMouseLeave={() =>
            setHighlightedSourceLinkStates(filteredSources.map(() => false))
          }
        />,
      );
      prevIndex = (match?.index ?? 0) + match[0].length;
    }
  });
  elements.push(
    <span
      key={`content:${prevIndex}`}
      dangerouslySetInnerHTML={{ __html: content.slice(prevIndex) }}
    ></span>,
  );
  return elements;
};

export const ChatMessageBubble = React.memo(function ChatMessageBubble(props: {
  message: Message;
  aiEmoji?: string;
  isMostRecent: boolean;
  messageCompleted: boolean;
}) {
  const { role, content } = props.message;
  const isUser = role === "user";

  return (
    <div
      className={`w-full max-w-3xl mx-auto p-4 mb-4 rounded-2xl transform transition-all duration-300 ease-in-out hover:scale-[1.02] ${
        isUser
          ? "bg-gradient-to-r from-blue-500 to-blue-600 ml-auto"
          : "bg-gradient-to-r from-gray-700 to-gray-800 mr-auto"
      } ${props.isMostRecent ? "animate-fadeIn" : ""}`}
      style={{
        boxShadow: isUser
          ? "0 4px 15px rgba(59, 130, 246, 0.2)"
          : "0 4px 15px rgba(55, 65, 81, 0.2)",
        maxWidth: "85%",
        animation: props.isMostRecent
          ? "slideIn 0.3s ease-out forwards"
          : "none",
      }}
    >
      {isUser ? (
        <p className="text-white text-lg font-medium leading-relaxed">
          {content}
        </p>
      ) : (
        <div className="flex flex-col items-start space-y-3 w-full">
          <div className="flex items-center w-full border-b border-gray-600 pb-2">
            <div className="text-blue-300 font-bold flex items-center gap-2">
              <span className="text-xl">{props.aiEmoji || "🤖"}</span>
              <span>Asistente</span>
            </div>
            {!props.messageCompleted && (
              <div className="ml-3">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            )}
          </div>
          <p className="text-gray-100 whitespace-pre-wrap text-lg leading-relaxed">
            {content}
          </p>
        </div>
      )}
    </div>
  );
});

"use client";

import React, { useRef, useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { EmptyState } from "../components/EmptyState";
import { ChatMessageBubble, Message } from "../components/ChatMessageBubble";
import { AutoResizeTextarea } from "./AutoResizeTextarea";
import { marked } from "marked";
import { Renderer } from "marked";
import hljs from "highlight.js";
import "highlight.js/styles/gradient-dark.css";

import { fetchEventSource } from "@microsoft/fetch-event-source";
import { applyPatch } from "fast-json-patch";

import "react-toastify/dist/ReactToastify.css";
import {
  Heading,
  Flex,
  IconButton,
  InputGroup,
  InputRightElement,
  Spinner,
  Box,
  Text,
  Button,
} from "@chakra-ui/react";
import { ArrowUpIcon } from "@chakra-ui/icons";
import { Source } from "./SourceBubble";
import { apiBaseUrl } from "../utils/constants";

export function ChatWindow(props: {
  placeholder?: string;
  titleText?: string;
  conversationId: string;
}) {
  const messageContainerRef = useRef<HTMLDivElement | null>(null);
  const [messages, setMessages] = useState<Array<Message>>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const { placeholder, titleText = "An LLM", conversationId } = props;

  // Memoizar los mensajes para evitar re-renders innecesarios
  const memoizedMessages = React.useMemo(() => messages, [messages]);

  // Función para hacer scroll al último mensaje
  const scrollToBottom = () => {
    if (messageContainerRef.current) {
      const scrollContainer = messageContainerRef.current;
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  // Efecto para hacer scroll cuando hay nuevos mensajes
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Componente de debugging
  const DebugPanel = () => (
    <Box
      position="fixed"
      bottom="20px"
      right="20px"
      bg="gray.800"
      p={4}
      borderRadius="md"
      maxWidth="400px"
      maxHeight="300px"
      overflowY="auto"
      zIndex={1000}
    >
      <Text color="white" fontWeight="bold" mb={2}>
        Debug Info:
      </Text>
      <Text color="white" fontSize="sm" whiteSpace="pre-wrap">
        {JSON.stringify({ messages, isLoading }, null, 2)}
      </Text>
    </Box>
  );

  // Toggle para el panel de debug
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "d") {
        e.preventDefault();
        setShowDebug((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, []);

  const sendMessage = async (message?: string) => {
    if (messageContainerRef.current) {
      messageContainerRef.current.classList.add("grow");
    }
    if (isLoading) {
      return;
    }
    const messageValue = message ?? input;
    if (messageValue === "") return;
    setInput("");

    // Agregar mensaje del usuario
    const userMessage: Message = {
      id: uuidv4(),
      content: messageValue,
      role: "user" as const,
    };

    console.log("Agregando mensaje del usuario:", userMessage);
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    setIsLoading(true);

    try {
      console.log("Iniciando petición al servidor...");
      await fetchEventSource(apiBaseUrl + "/api/v1/chat/stream_log", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "Access-Control-Allow-Origin": "*",
        },
        credentials: "include",
        body: JSON.stringify({
          input: messageValue,
          conversation_id: conversationId,
        }),
        openWhenHidden: true,
        async onopen(response) {
          console.log("Estado de la conexión:", {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });

          if (response.ok) {
            console.log("Conexión exitosa");
          } else {
            console.error(
              "Error en la conexión:",
              response.status,
              response.statusText,
            );
            throw new Error(
              `Error en la conexión: ${response.status} ${response.statusText}`,
            );
          }
        },
        onerror(err) {
          console.error("Error en la conexión:", err);
          setIsLoading(false);
          throw err;
        },
        async onmessage(msg) {
          console.log("Mensaje recibido:", {
            event: msg.event,
            data: msg.data,
          });

          if (msg.data) {
            try {
              console.log("Mensaje raw recibido:", msg.data);
              const chunk = JSON.parse(msg.data);
              console.log("Chunk parseado:", chunk);

              if (chunk.streamed_output) {
                const responseText = chunk.streamed_output;
                console.log("Texto recibido:", responseText);

                // Actualizar el último mensaje del asistente o crear uno nuevo
                setMessages((prevMessages) => {
                  const lastMessage = prevMessages[prevMessages.length - 1];
                  if (lastMessage && lastMessage.role === "assistant") {
                    // Actualizar el último mensaje
                    return [
                      ...prevMessages.slice(0, -1),
                      { ...lastMessage, content: responseText },
                    ];
                  } else {
                    // Crear nuevo mensaje
                    return [
                      ...prevMessages,
                      {
                        id: uuidv4(),
                        content: responseText,
                        role: "assistant" as const,
                      },
                    ];
                  }
                });
              }
            } catch (e) {
              console.error("Error procesando mensaje:", e);
            }
          }

          if (msg.event === "end") {
            console.log("Evento end recibido");
            setIsLoading(false);
          }
        },
      });
    } catch (e) {
      console.error("Error general:", e);
      setIsLoading(false);
      setInput(messageValue);
      throw e;
    }
  };

  const sendInitialQuestion = async (question: string) => {
    await sendMessage(question);
  };

  // Limpieza de conversación eliminada: la sesión se pierde al refrescar pantalla

  return (
    <div className="flex flex-col h-full w-full bg-gradient-to-b from-gray-900 to-gray-800 p-4">
      {/* Header */}
      <Flex justifyContent="space-between" width="100%" mb={4}>
        <Heading fontSize={["3xl", "4xl", "5xl"]} fontWeight={"medium"} mb={1}>
          {/* {titleText} */}
        </Heading>
        {/* Botón de limpiar conversación eliminado, no se requiere persistencia */}
      </Flex>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto w-full" ref={messageContainerRef}>
        {memoizedMessages.length > 0 ? (
          <div className="flex flex-col gap-4 w-full">
            {memoizedMessages.map((m, i) => (
              <ChatMessageBubble
                key={m.id}
                message={m}
                aiEmoji="🔥"
                isMostRecent={i === memoizedMessages.length - 1}
                messageCompleted={!isLoading}
              />
            ))}
            {isLoading && (
              <ChatMessageBubble
                message={{
                  id: uuidv4(),
                  content: "...",
                  role: "assistant",
                }}
                isMostRecent={true}
                messageCompleted={false}
              />
            )}
          </div>
        ) : (
          <EmptyState onChoice={sendInitialQuestion} />
        )}
      </div>

      {/* Input Group */}
      <InputGroup size="md" className="w-full mt-4">
        <AutoResizeTextarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder ?? "What is your name?"}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          maxRows={5}
          pr="5rem"
          textColor="white"
        />
        <InputRightElement height="100%" right="0.5rem">
          <IconButton
            colorScheme="blue"
            aria-label="Send message"
            icon={<ArrowUpIcon />}
            onClick={() => sendMessage()}
            isDisabled={isLoading}
            width="2.5rem"
            height="2.5rem"
            borderRadius="full"
          />
        </InputRightElement>
      </InputGroup>
      {showDebug && <DebugPanel />}
    </div>
  );
}

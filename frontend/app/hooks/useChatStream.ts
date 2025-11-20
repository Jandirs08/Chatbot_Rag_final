import { useState, useCallback } from "react";
import { apiBaseUrl } from "../utils/constants";

export interface Message {
  id: string;
  content: string;
  role: "user" | "assistant" | "system" | "function";
  createdAt?: Date;
  runId?: string;
  name?: string;
  function_call?: { name: string };
}

export interface UseChatStreamReturn {
  messages: Message[];
  isLoading: boolean;
  sendMessage: (message: string) => Promise<void>;
  clearMessages: () => void;
}

export function useChatStream(conversationId: string, initialMessages?: Message[]): UseChatStreamReturn {
  const [messages, setMessages] = useState<Message[]>(initialMessages ?? []);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = useCallback(async (messageText: string) => {
    if (isLoading || !messageText.trim()) {
      return;
    }

    // Agregar mensaje del usuario
    const userMessage: Message = {
      id: (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
      content: messageText,
      role: "user",
      createdAt: new Date(),
    };

    setMessages((prevMessages) => [...prevMessages, userMessage]);
    setIsLoading(true);

    try {
      // Carga dinámica de fetchEventSource para reducir el bundle inicial
      const { fetchEventSource } = await import("@microsoft/fetch-event-source");
      
      await fetchEventSource(apiBaseUrl + "/chat/", {
        method: "POST",
        headers: {
          // Asegurar UTF-8 explícito y evitar enviar encabezados de respuesta (como ACAO)
          "Content-Type": "application/json; charset=utf-8",
          Accept: "text/event-stream",
        },
        credentials: "include",
        body: JSON.stringify({
          input: messageText,
          conversation_id: conversationId,
          // Campo opcional para rastrear el origen/embebido
          source: "embed-default",
        }),
        openWhenHidden: true,
        async onopen(response) {
          console.log("Estado de la conexión:", {
            status: response.status,
            statusText: response.statusText,
            contentType: response.headers.get("content-type"),
          });

          if (!response.ok) {
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
          if (msg.data) {
            try {
              const chunk = JSON.parse(msg.data);
              const delta: string | undefined = chunk.stream ?? chunk.streamed_output;
              if (typeof delta === "string" && delta.length > 0) {
                try {
                  console.debug("[SSE] chunk received", { len: delta.length });
                } catch {}
                setMessages((prevMessages) => {
                  const last = prevMessages[prevMessages.length - 1];
                  if (last && last.role === "assistant") {
                    return [
                      ...prevMessages.slice(0, -1),
                      { ...last, content: (last.content || "") + delta },
                    ];
                  }
                  return [
                    ...prevMessages,
                    {
                      id: (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
                      content: delta,
                      role: "assistant",
                      createdAt: new Date(),
                    },
                  ];
                });
              }
            } catch (e) {
              console.error("Error procesando mensaje:", e);
            }
          }

          // Manejo explícito de eventos del servidor
          if (msg.event === "end") {
            console.log("Evento end recibido");
            setIsLoading(false);
          } else if (msg.event === "error") {
            console.warn("Evento error recibido", msg.data);
            setIsLoading(false);
            // Mostrar mensaje de error amigable
            const errorMessage: Message = {
              id: (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
              content:
                "Lo siento, ocurrió un error procesando tu mensaje. Por favor, inténtalo nuevamente.",
              role: "assistant",
              createdAt: new Date(),
            };
            setMessages((prev) => [...prev, errorMessage]);
          }
        },
      });
    } catch (error) {
      console.error("Error general:", error);
      setIsLoading(false);
      
      // Agregar mensaje de error
      const errorMessage: Message = {
        id: (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
        content: "Lo siento, ocurrió un error al procesar tu mensaje. Por favor, inténtalo de nuevo.",
        role: "assistant",
        createdAt: new Date(),
      };
      
      setMessages((prevMessages) => [...prevMessages, errorMessage]);
    }
  }, [conversationId, isLoading]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    isLoading,
    sendMessage,
    clearMessages,
  };
}
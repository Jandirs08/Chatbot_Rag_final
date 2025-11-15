import React, { useState } from "react";
import { ChatWindow } from "./ChatWindow";
import { IconButton, Box } from "@chakra-ui/react";
import { ChatIcon, CloseIcon } from "@chakra-ui/icons";

export const FloatingChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const conversationId = (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

  return (
    <Box position="fixed" bottom="20px" right="20px" zIndex={1000}>
      {isOpen ? (
        <Box
          width="350px"
          height="500px"
          bg="gray.900"
          borderRadius="md"
          boxShadow="0 4px 12px rgba(0, 0, 0, 0.5)"
          overflow="hidden"
          position="relative"
          animation="slideInChat 0.3s ease-out forwards"
        >
          <Box position="absolute" top="5px" right="5px" zIndex={1}>
            <IconButton
              aria-label="Cerrar chat"
              icon={<CloseIcon />}
              size="sm"
              colorScheme="red"
              variant="ghost"
              onClick={() => setIsOpen(false)}
            />
          </Box>
          <Box height="100%" width="100%">
            <ChatWindow
              titleText="Gestor de Becas"
              conversationId={conversationId}
            />
          </Box>
        </Box>
      ) : (
        <IconButton
          aria-label="Abrir chat"
          icon={<ChatIcon />}
          colorScheme="blue"
          size="lg"
          borderRadius="full"
          boxShadow="0 4px 12px rgba(0, 0, 0, 0.3)"
          onClick={() => setIsOpen(true)}
        />
      )}
    </Box>
  );
};

import React from "react";
import {
  InboxConversationCard,
  type InboxConversation,
} from "./InboxConversationCard";

// Thin wrapper around InboxConversationCard. The card itself already self-
// registers as a draggable (useDraggable inside InboxConversationCard); the
// surrounding column owns the droppable. This component exists so the column
// imports KanbanCard rather than InboxConversationCard directly — keeps the
// "card vs. column" seam visible and gives us a stable swap point for future
// drag-affordance tweaks (e.g. ghost preview wrappers).

interface KanbanCardProps {
  conversation: InboxConversation;
  isActive: boolean;
  isMutating: boolean;
  agentId: string;
  onSelect: (id: string) => void;
  onTakeover: (id: string) => void;
  onRelease: (id: string) => void;
  onMarkViewed: (id: string) => void;
}

function KanbanCardImpl(props: KanbanCardProps) {
  return <InboxConversationCard {...props} />;
}

export const KanbanCard = React.memo(KanbanCardImpl);

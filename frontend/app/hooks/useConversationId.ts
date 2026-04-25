"use client";

import { useState, useEffect, useCallback } from "react";

function generateId(): string {
  return crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function safeStorageGet(key: string): string | null {
  try {
    return typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string): void {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  } catch {
    // localStorage unavailable (private mode, storage full, etc.)
  }
}

export function useConversationId(storageKey: string): [string | null, () => void] {
  const [conversationId, setConversationId] = useState<string | null>(null);

  useEffect(() => {
    const existing = safeStorageGet(storageKey);
    if (existing?.trim()) {
      setConversationId(existing);
      return;
    }
    const newId = generateId();
    safeStorageSet(storageKey, newId);
    setConversationId(newId);
  }, [storageKey]);

  const reset = useCallback(() => {
    const newId = generateId();
    safeStorageSet(storageKey, newId);
    setConversationId(newId);
  }, [storageKey]);

  return [conversationId, reset];
}

export interface Message {
  id: string;
  content: string;
  role: "user" | "assistant" | "system" | "function";
  createdAt?: Date;
  runId?: string;
  name?: string;
  function_call?: { name: string };
}


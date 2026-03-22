import { useEffect, useState } from "react";

export interface ToastMessage {
  id: number;
  text: string;
  type: "error" | "info";
}

let nextId = 0;

interface ToastProps {
  messages: ToastMessage[];
  onDismiss: (id: number) => void;
}

function ToastItem({ message, onDismiss }: { message: ToastMessage; onDismiss: () => void }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(onDismiss, 300);
    }, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      className={`toast-item toast-${message.type}${exiting ? " toast-exit" : ""}`}
      role="alert"
      onClick={() => { setExiting(true); setTimeout(onDismiss, 300); }}
    >
      {message.text}
    </div>
  );
}

export function Toast({ messages, onDismiss }: ToastProps) {
  if (messages.length === 0) return null;

  return (
    <div className="toast-container">
      {messages.map((msg) => (
        <ToastItem key={msg.id} message={msg} onDismiss={() => onDismiss(msg.id)} />
      ))}
    </div>
  );
}

export function createToast(text: string, type: "error" | "info" = "error"): ToastMessage {
  return { id: nextId++, text, type };
}

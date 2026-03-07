"use client";

import { useState, useEffect } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";

interface Message {
  id: string;
  text: string;
  sender: "user" | "agent";
  timestamp: number;
}

export default function Chat() {
  const { context, isFrameReady, setFrameReady } = useMiniKit();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [isFrameReady, setFrameReady]);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: input,
      sender: "user",
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/xmtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: input,
          userFid: context?.user?.fid,
        }),
      });
      const data = await res.json();

      const agentMessage: Message = {
        id: Date.now().toString(),
        text: data.response,
        sender: "agent",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, agentMessage]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", padding: "1rem", maxWidth: "28rem", margin: "0 auto", backgroundColor: "#fafafa" }}>
      <h1 style={{ fontSize: "1.25rem", fontWeight: "bold", marginBottom: "1rem" }}>
        🤖 XMTP Agent
      </h1>

      {context?.user?.fid && (
        <div style={{ backgroundColor: "#dbeafe", color: "#1e40af", fontSize: "0.875rem", padding: "0.5rem", borderRadius: "0.5rem", marginBottom: "1rem" }}>
          Hello, FID: {context.user.fid}!
        </div>
      )}

      <div style={{ border: "1px solid #e5e7eb", borderRadius: "0.5rem", height: "24rem", overflowY: "auto", padding: "1rem", marginBottom: "1rem", backgroundColor: "#fff" }}>
        {messages.length === 0 ? (
          <p style={{ color: "#6b7280", textAlign: "center" }}>
            Send a message to chat with the agent!
          </p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                marginBottom: "0.75rem",
                textAlign: msg.sender === "user" ? "right" : "left",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  maxWidth: "80%",
                  padding: "0.75rem 1rem",
                  borderRadius: "1rem",
                  backgroundColor: msg.sender === "user" ? "#000" : "#f3f4f6",
                  color: msg.sender === "user" ? "#fff" : "#000",
                }}
              >
                {msg.text}
              </span>
            </div>
          ))
        )}
        {isLoading && (
          <div style={{ textAlign: "left" }}>
            <span style={{ display: "inline-block", backgroundColor: "#f3f4f6", padding: "0.75rem 1rem", borderRadius: "1rem", color: "#9ca3af" }}>
              Thinking...
            </span>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Type a message..."
          style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: "9999px", padding: "0.75rem 1rem" }}
        />
        <button
          onClick={sendMessage}
          disabled={isLoading}
          style={{ backgroundColor: "#000", color: "#fff", padding: "0.75rem 1.5rem", borderRadius: "9999px", fontWeight: 500, opacity: isLoading ? 0.5 : 1 }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

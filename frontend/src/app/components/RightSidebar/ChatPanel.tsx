// SPDX-FileCopyrightText: Copyright (c) 2025 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

"use client";

import { useState } from "react";

interface ChatPanelProps {
  vgpuConfig: any;
  onSendMessage: (message: string) => void;
  chatHistory: Array<{ role: "user" | "assistant"; content: string }>;
  isLoading?: boolean;
  onCloseChat?: () => void;
}

export default function ChatPanel({
  vgpuConfig,
  onSendMessage,
  chatHistory,
  isLoading = false,
  onCloseChat,
}: ChatPanelProps) {
  const [inputMessage, setInputMessage] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMessage.trim() && !isLoading) {
      onSendMessage(inputMessage.trim());
      setInputMessage("");
    }
  };

  return (
    <div className="flex h-full flex-col border-l border-neutral-700/40">
      {/* Chat Header */}
      <div className="p-3 bg-[#252525] border-b border-neutral-700/30">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-300 uppercase tracking-wider">
            Ask Questions
          </h3>
          {onCloseChat && (
            <button
              onClick={onCloseChat}
              className="text-gray-400 hover:text-white transition-colors"
              title="Close chat"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-[#252525]">
        {chatHistory.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            <div className="mb-3 text-3xl">💬</div>
            <p className="text-sm mb-4 text-gray-400">Ask questions about your configuration</p>
            <div className="text-xs space-y-2">
              <p className="text-gray-500 font-medium">Examples:</p>
              <div className="text-left space-y-1.5 text-gray-600 max-w-[200px] mx-auto">
                <p>• Why this profile?</p>
                <p>• Can it handle 10 users?</p>
                <p>• Is there a smaller option?</p>
                <p>• RAM requirements?</p>
              </div>
            </div>
          </div>
        ) : (
          chatHistory.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-lg p-3 ${
                  msg.role === "user"
                    ? "bg-[#76b900] text-white"
                    : "bg-neutral-800/70 text-gray-200"
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-neutral-800/70 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-[#76b900]"></div>
                <span className="text-sm text-gray-400">Thinking...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-[#252525] border-t border-neutral-700/30">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Ask about your configuration..."
            disabled={isLoading}
            className="flex-1 rounded-lg bg-neutral-800/50 border border-neutral-700 px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#76b900] disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!inputMessage.trim() || isLoading}
            className="px-4 py-2 bg-[#76b900] hover:bg-[#5a8c00] text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}


// SPDX-FileCopyrightText: Copyright (c) 2025 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

"use client";

import { useState, useRef, useEffect } from "react";
import RightSidebar from "../RightSidebar/RightSidebar";
import VGPUConfigCard from "./VGPUConfigCard";
import WorkloadConfigWizard from "./WorkloadConfigWizard";
import ApplyConfigurationForm from "./ApplyConfigurationForm";
import ChatPanel from "../RightSidebar/ChatPanel";
import { v4 as uuidv4 } from "uuid";
import { API_CONFIG } from "@/app/config/api";
import { marked } from "marked";
import { useChatStream } from "../../hooks/useChatStream";
import { ChatMessage, GenerateRequest } from "@/types/chat";
import { useSettings } from "../../context/SettingsContext";
import { useSidebar } from "../../context/SidebarContext";

export default function Chat() {
  const { activePanel, toggleSidebar, setActiveCitations } = useSidebar();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [expandedConfigId, setExpandedConfigId] = useState<string | null>(null);
  const [isApplyFormOpen, setIsApplyFormOpen] = useState(false);
  const [applyFormConfig, setApplyFormConfig] = useState<any>(null);
  const [showPassthroughError, setShowPassthroughError] = useState(false);
  const [lastVGPUConfig, setLastVGPUConfig] = useState<any>(null); // Track last vGPU config for context
  const [showChatPanel, setShowChatPanel] = useState(false); // Show inline chat panel
  const [chatPanelHistory, setChatPanelHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [isChatPanelLoading, setIsChatPanelLoading] = useState(false);
  const { streamState, processStream, startStream, resetStream, stopStream } =
    useChatStream();

  const {
    temperature,
    topP,
    vdbTopK,
    rerankerTopK,
    confidenceScoreThreshold,
    useGuardrails,
    includeCitations,
  } = useSettings();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleToggleSidebar = (
    panel: "citations",
    citations?: {
      text: string;
      source: string;
      document_type: "text" | "image" | "table" | "chart";
    }[]
  ) => {
    if (panel === "citations" && citations) {
      setActiveCitations(citations);
      if (!activePanel || activePanel !== "citations") {
        toggleSidebar(panel);
      }
    } else {
      toggleSidebar(panel);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
    
    // Update citations in sidebar if panel is already open
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === "assistant" && lastMessage.citations && lastMessage.citations.length > 0) {
      // Only update citations if the panel is already open
      if (activePanel === "citations") {
        setActiveCitations(lastMessage.citations);
      }
    }
    
    // Extract vGPU config from the last message if it exists
    if (lastMessage && lastMessage.role === "assistant" && lastMessage.content) {
      try {
        const parsed = JSON.parse(lastMessage.content.trim());
        if (parsed.title === "generate_vgpu_config" && parsed.parameters) {
          setLastVGPUConfig(parsed);
        }
      } catch {
        // Not a JSON config, ignore
      }
    }
  }, [messages, activePanel, setActiveCitations]);

  const handleSubmit = async (message: string) => {
    if (!message.trim()) return;

    resetStream();
    const controller = startStream();

    const userMessage = createUserMessage(message);
    const assistantMessage = createAssistantMessage();

    setMessages((prev) => [...prev, userMessage, assistantMessage]);

    // Debug confidence score threshold being used
    console.log(`Submitting with confidence threshold: ${confidenceScoreThreshold} (value type: ${typeof confidenceScoreThreshold})`);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createRequestBody(userMessage)),
        signal: controller.signal,
      });

      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);

      await processStream(response, assistantMessage.id, setMessages, confidenceScoreThreshold);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        console.log("Stream aborted");
        return;
      }
      console.error("Error generating response:", error);
      handleError(assistantMessage.id);
    }
  };

  const isVGPUConfig = (content: string): boolean => {
    try {
      const parsed = JSON.parse(content.trim());
      return parsed.title === "generate_vgpu_config" && parsed.parameters;
    } catch {
      return false;
    }
  };

  const renderMessageContent = (content: string, isTyping: boolean, messageId: string) => {
    if (isTyping) {
      return (
        <div className="flex items-center justify-center space-x-3 py-8">
          <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-[#76b900]"></div>
          <span className="text-gray-400">Generating configuration...</span>
        </div>
      );
    }
    
    // Check if content is a vGPU configuration JSON
    if (isVGPUConfig(content)) {
      try {
        const vgpuConfig = JSON.parse(content.trim());
        const configId = messageId;
        const isExpanded = expandedConfigId === configId;
        
        // Return a preview card with inline expandable details AND chat panel
        return (
          <div className="relative w-[80%] mx-auto">
            <div className="bg-[#252525] border border-[#76b900]/30 rounded-lg p-5 relative">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-[#76b900]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
                <h3 className="text-white font-semibold text-lg">vGPU Configuration Ready</h3>
              </div>
            
              <p className="text-sm text-gray-300 mb-4">
                {vgpuConfig.description.split(/(Inference|RAG|inference|rag)/gi).map((part: string, i: number) => 
                  /^(Inference|RAG|inference|rag)$/i.test(part) ? (
                    <span key={i} className="font-bold text-[#76b900]">{part}</span>
                  ) : part
                )}
              </p>
              
              {(vgpuConfig.parameters.vgpu_profile || vgpuConfig.parameters.vGPU_profile) && (
                <div className="flex items-center gap-4 text-sm mb-4">
                  <span className="text-gray-400">Profile:</span>
                  <span className="text-[#76b900] font-medium">{vgpuConfig.parameters.vgpu_profile || vgpuConfig.parameters.vGPU_profile}</span>
                  {vgpuConfig.parameters.gpu_memory_size && (
                    <>
                      <span className="text-gray-400">•</span>
                      <span className="text-gray-400">Memory:</span>
                      <span className="text-[#76b900] font-medium">{vgpuConfig.parameters.gpu_memory_size} GB</span>
                    </>
                  )}
                </div>
              )}
              
              {/* Configuration Details Toggle Button */}
              <button
                onClick={() => {
                  setExpandedConfigId(isExpanded ? null : configId);
                  if (!isExpanded) {
                    // Reset chat history when opening
                    setChatPanelHistory([]);
                  }
                }}
                className="w-full px-4 py-2.5 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 mb-3"
              >
                <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                {isExpanded ? 'Hide' : 'Show'} Configuration Details
              </button>
              
              {/* Inline Configuration Details with Chat Panel */}
              {isExpanded && (
                <div className="mb-3 animate-in fade-in duration-200">
                  <div className="flex items-start h-full bg-[#252525] rounded-lg overflow-hidden">
                    {/* Configuration Details - 70% */}
                    <div className="w-[70%] flex flex-col">
                      <VGPUConfigCard config={vgpuConfig} />
                    </div>
                    
                    {/* Chat Panel - 30% - Always visible and full height */}
                    <div className="w-[30%] flex-shrink-0 self-stretch">
                      <ChatPanel
                        vgpuConfig={vgpuConfig}
                        onSendMessage={handleChatPanelMessage}
                        chatHistory={chatPanelHistory}
                        isLoading={isChatPanelLoading}
                      />
                    </div>
                  </div>
                </div>
              )}
              
              {/* Action Buttons - Full Width */}
              <div className="space-y-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    
                    // Check if this is a GPU passthrough configuration (vgpu_profile is null)
                    const profile = vgpuConfig.parameters?.vgpu_profile || vgpuConfig.parameters?.vGPU_profile;
                    if (!profile) {
                      setShowPassthroughError(true);
                      return;
                    }
                    
                    setApplyFormConfig(vgpuConfig);
                    setIsApplyFormOpen(true);
                  }}
                  className="w-full px-4 py-2 bg-[#76b900] hover:bg-[#5a8c00] text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Verify Configuration
                </button>
                
                {/* Size Another Configuration Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsWizardOpen(true);
                  }}
                  className="w-full px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2"
                  title="Open Workload Configuration Wizard"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                  </svg>
                  Size another vGPU Configuration
                </button>
              </div>
            </div>
          </div>
        );
      } catch (error) {
        console.error("Error parsing vGPU config:", error);
        // Fall back to regular markdown rendering
      }
    }
    
    return (
      <div
        className="prose prose-invert max-w-none text-sm"
        dangerouslySetInnerHTML={{
          __html: marked.parse(content, {
            async: false,
            breaks: true,
            gfm: true,
          }),
        }}
      />
    );
  };

  const createUserMessage = (content: string): ChatMessage => ({
    id: uuidv4(),
    role: "user",
    content,
    timestamp: new Date().toISOString(),
  });

  const createAssistantMessage = (): ChatMessage => ({
    id: uuidv4(),
    role: "assistant",
    content: "",
    timestamp: new Date().toISOString(),
  });

  const handleChatPanelMessage = async (message: string) => {
    if (!lastVGPUConfig) return;

    setIsChatPanelLoading(true);
    setChatPanelHistory((prev) => [...prev, { role: "user", content: message }]);

    try {
      const enhancedMessage = `${message}\n\n[Configuration Context: vGPU Profile: ${lastVGPUConfig.parameters?.vgpu_profile || 'N/A'}, GPU Memory: ${lastVGPUConfig.parameters?.gpu_memory_size || 'N/A'}GB]`;

      const requestBody: GenerateRequest = {
        messages: chatPanelHistory.concat([{ role: "user", content: enhancedMessage }]),
        collection_name: "vgpu_knowledge_base",
        temperature,
        top_p: topP,
        use_knowledge_base: true,
        enable_citations: false,
      };

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) throw new Error("Failed");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No body");

      let assistantMsg = "";
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.choices?.[0]?.delta?.content) {
                assistantMsg += data.choices[0].delta.content;
              }
            } catch (e) {}
          }
        }
      }

      setChatPanelHistory((prev) => [...prev, { role: "assistant", content: assistantMsg || "No response" }]);
    } catch (error) {
      setChatPanelHistory((prev) => [...prev, { role: "assistant", content: "Error occurred" }]);
    } finally {
      setIsChatPanelLoading(false);
    }
  };

  const createRequestBody = (userMessage: ChatMessage) => {
    // Create base request body - always use the vGPU knowledge base
    const requestBody: GenerateRequest = {
      messages: messages.concat(userMessage).map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      collection_name: "vgpu_knowledge_base",  // Always use the pre-loaded collection
      temperature,
      top_p: topP,
      reranker_top_k: rerankerTopK,
      vdb_top_k: vdbTopK,
      confidence_threshold: confidenceScoreThreshold,
      use_knowledge_base: true,  // Always use knowledge base
      enable_citations: includeCitations,
      enable_guardrails: useGuardrails,
    };

    // Only include model parameters if the environment variables are set
    if (process.env.NEXT_PUBLIC_MODEL_NAME) {
      requestBody.model = process.env.NEXT_PUBLIC_MODEL_NAME;
    }

    if (process.env.NEXT_PUBLIC_EMBEDDING_MODEL) {
      requestBody.embedding_model = process.env.NEXT_PUBLIC_EMBEDDING_MODEL;
    }

    if (process.env.NEXT_PUBLIC_RERANKER_MODEL) {
      requestBody.reranker_model = process.env.NEXT_PUBLIC_RERANKER_MODEL;
    }

    return requestBody;
  };

  const handleError = (messageId: string) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId
          ? {
              ...msg,
              content: "Sorry, there was an error processing your request.",
            }
          : msg
      )
    );
  };

  const handleWizardSubmit = async (generatedQuery: string) => {
    // Process query silently without showing it as a user message
    if (!generatedQuery.trim()) return;

    resetStream();
    const controller = startStream();

    // Clear previous messages and only show the new configuration
    setMessages([]);
    
    // Only create assistant message (no user message shown)
    const assistantMessage = createAssistantMessage();
    setMessages([assistantMessage]);

    // Debug confidence score threshold being used
    console.log(`Submitting wizard query with confidence threshold: ${confidenceScoreThreshold}`);

    try {
      // Create the request with the query but don't show it in chat
      const silentUserMessage = createUserMessage(generatedQuery);
      const requestBody: GenerateRequest = {
        messages: [silentUserMessage].map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        collection_name: "vgpu_knowledge_base",
        temperature,
        top_p: topP,
        reranker_top_k: rerankerTopK,
        vdb_top_k: vdbTopK,
        confidence_threshold: confidenceScoreThreshold,
        use_knowledge_base: true,
        enable_citations: includeCitations,
        enable_guardrails: useGuardrails,
      };

      // Include model parameters if set
      if (process.env.NEXT_PUBLIC_MODEL_NAME) {
        requestBody.model = process.env.NEXT_PUBLIC_MODEL_NAME;
      }
      if (process.env.NEXT_PUBLIC_EMBEDDING_MODEL) {
        requestBody.embedding_model = process.env.NEXT_PUBLIC_EMBEDDING_MODEL;
      }
      if (process.env.NEXT_PUBLIC_RERANKER_MODEL) {
        requestBody.reranker_model = process.env.NEXT_PUBLIC_RERANKER_MODEL;
      }

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);

      await processStream(response, assistantMessage.id, setMessages, confidenceScoreThreshold);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        console.log("Stream aborted");
        return;
      }
      console.error("Error generating response:", error);
      handleError(assistantMessage.id);
    }
  };

  return (
    <div className="flex h-[calc(100vh-56px)] bg-[#1a1a1a]">
      <div
        className={`flex flex-1 transition-all duration-300 ${
          !!activePanel ? "mr-[400px]" : ""
        }`}
      >
        <div className="relative flex-1">
          <RightSidebar 
            vgpuConfig={lastVGPUConfig}
            onSendChatMessage={handleChatPanelMessage}
            chatHistory={chatPanelHistory}
            isChatLoading={isChatPanelLoading}
          />
          <div className="flex h-full flex-col w-full">
            <div className="flex-1 overflow-y-auto p-4 w-full bg-[#1a1a1a]">
              {/* Show centered button when no messages */}
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <button
                    onClick={() => setIsWizardOpen(true)}
                    className="bg-gradient-to-r from-green-600 to-green-700 text-white px-16 py-8 rounded-xl shadow-2xl hover:from-green-700 hover:to-green-800 transition-all duration-200 hover:scale-[1.05] flex items-center justify-center space-x-4 min-w-[500px]"
                    title="Open Workload Configuration Wizard"
                  >
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                    </svg>
                    <span className="text-2xl font-semibold">Create vGPU Sizing Recommendation</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-6 w-full flex flex-col items-center">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex w-full ${
                        msg.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`w-full ${
                          msg.role === "user"
                            ? "text-white"
                            : "text-white"
                        }`}
                      >
                        <div className="text-sm">
                          {msg.content
                            ? renderMessageContent(msg.content, false, msg.id)
                            : msg.role === "assistant" && streamState.isTyping
                              ? renderMessageContent("", true, msg.id)
                              : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Workload Configuration Wizard */}
      <WorkloadConfigWizard
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onSubmit={handleWizardSubmit}
      />

      {/* Apply Configuration Form Modal */}
      <ApplyConfigurationForm 
        isOpen={isApplyFormOpen}
        onClose={() => setIsApplyFormOpen(false)}
        configuration={applyFormConfig}
      />

      {/* GPU Passthrough Error Modal */}
      {showPassthroughError && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 border border-yellow-500/50 rounded-xl shadow-2xl max-w-md w-full animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-yellow-600/20 to-orange-600/20 border-b border-yellow-500/30 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-500/20 rounded-lg">
                  <svg className="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-yellow-500">GPU Passthrough Required</h3>
                  <p className="text-sm text-gray-400">Local verification unavailable</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-5 space-y-4">
              <div className="space-y-3 text-gray-300">
                <p className="leading-relaxed">
                  This workload <span className="font-semibold text-white">requires direct GPU access</span> and cannot be tested with the local vLLM deployment feature.
                </p>
                <div className="bg-neutral-800/50 border border-neutral-700 rounded-lg p-4 space-y-2">
                  <p className="text-sm font-medium text-yellow-400">Why is this happening?</p>
                  <p className="text-sm text-gray-400 leading-relaxed">
                    Your workload exceeds the maximum vGPU profile capacity and requires <span className="font-medium text-white">full GPU passthrough</span> mode. This configuration must be deployed directly on hardware with GPU passthrough enabled.
                  </p>
                </div>
                <p className="text-sm text-gray-400">
                  Please deploy this configuration on your production environment with the recommended GPU passthrough setup.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-neutral-800/50 border-t border-neutral-700 flex justify-end">
              <button
                onClick={() => setShowPassthroughError(false)}
                className="px-6 py-2.5 bg-[#76b900] hover:bg-[#5a8c00] text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
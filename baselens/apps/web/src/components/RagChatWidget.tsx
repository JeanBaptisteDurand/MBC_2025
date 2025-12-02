import { useState, useRef, useEffect } from "react";
import { MessageSquare, X, Send, Loader, Bot, User } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getRagChat, sendRagMessage } from "../api/endpoints";
import { cn } from "../utils/cn";

interface RagChatWidgetProps {
  analysisId: string;
}

export default function RagChatWidget({ analysisId }: RagChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [chatId, setChatId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Fetch existing chat
  const { data: chatData } = useQuery({
    queryKey: ["ragChat", analysisId, chatId],
    queryFn: () => getRagChat(analysisId, chatId || undefined),
    enabled: isOpen && !!analysisId,
  });

  // Set chatId when chat data is loaded
  useEffect(() => {
    if (chatData?.chatId && !chatId) {
      setChatId(chatData.chatId);
    }
  }, [chatData, chatId]);

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: (question: string) =>
      sendRagMessage({ analysisId, chatId: chatId || undefined, question }),
    onSuccess: (data) => {
      setChatId(data.chatId);
      queryClient.invalidateQueries({ queryKey: ["ragChat", analysisId] });
    },
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatData?.messages, sendMutation.isPending]);

  const handleSend = () => {
    if (!input.trim() || sendMutation.isPending) return;
    sendMutation.mutate(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Chat Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="absolute bottom-4 right-4 z-20 btn btn-primary shadow-lg flex items-center gap-2 animate-pulse-slow"
        >
          <MessageSquare className="w-5 h-5" />
          Ask AI
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="absolute bottom-4 right-4 w-96 h-[500px] bg-surface-900/95 backdrop-blur-sm border border-surface-700 rounded-xl shadow-2xl z-20 flex flex-col animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-accent-400" />
              <span className="font-medium">Ask about this analysis</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded text-surface-400 hover:text-surface-100 hover:bg-surface-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatData?.messages?.length === 0 && (
              <div className="text-center text-surface-500 py-8">
                <Bot className="w-12 h-12 mx-auto mb-4 text-surface-600" />
                <p className="text-sm">Ask anything about this contract analysis</p>
                <p className="text-xs mt-2 text-surface-600">
                  e.g., "What does this contract do?" or "Is there any security risk?"
                </p>
              </div>
            )}

            {chatData?.messages?.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-3",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-lg bg-accent-900/50 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-accent-400" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[80%] rounded-xl px-4 py-2",
                    msg.role === "user"
                      ? "bg-primary-900/50 text-surface-100"
                      : "bg-surface-800 text-surface-200"
                  )}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm">{msg.content}</p>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-lg bg-primary-900/50 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-primary-400" />
                  </div>
                )}
              </div>
            ))}

            {sendMutation.isPending && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent-900/50 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-accent-400" />
                </div>
                <div className="bg-surface-800 rounded-xl px-4 py-3">
                  <Loader className="w-5 h-5 animate-spin text-accent-400" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-surface-700">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question..."
                className="input flex-1 text-sm"
                disabled={sendMutation.isPending}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sendMutation.isPending}
                className="btn btn-accent px-3"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


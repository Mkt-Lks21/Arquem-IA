import { useEffect, useMemo, useRef, useState } from "react";
import { Message } from "@/types/database";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Play, Copy, Check, User, Bot, Loader2 } from "lucide-react";
import { toast } from "sonner";
import QueryResultTable from "./QueryResultTable";
import { ParsedSqlBlock, parseAssistantContent } from "@/lib/chat/assistantContentParser";

interface ChatMessageProps {
  message: Message;
  onExecuteQuery: (query: string) => Promise<any[]>;
  disableAutoExecute?: boolean;
}

export default function ChatMessage({
  message,
  onExecuteQuery,
  disableAutoExecute = false,
}: ChatMessageProps) {
  const [executingQueries, setExecutingQueries] = useState<Record<string, boolean>>({});
  const [queryResults, setQueryResults] = useState<Record<string, any[]>>({});
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [attemptedQueries, setAttemptedQueries] = useState<Set<string>>(new Set());
  const runningQueriesRef = useRef<Set<string>>(new Set());
  const autoAttemptedRef = useRef<Set<string>>(new Set());

  const isUser = message.role === "user";
  const parsedContent = useMemo(
    () => (isUser ? null : parseAssistantContent(message.content || "")),
    [isUser, message.content],
  );

  const toBlockKey = (block: ParsedSqlBlock) => `${message.id}-${block.id}`;

  const executeSql = async (block: ParsedSqlBlock, showSuccessToast: boolean) => {
    const key = toBlockKey(block);

    if (runningQueriesRef.current.has(key)) return;

    runningQueriesRef.current.add(key);
    setAttemptedQueries((prev) => new Set(prev).add(key));
    setExecutingQueries((prev) => ({ ...prev, [key]: true }));

    try {
      const results = await onExecuteQuery(block.query);
      setQueryResults((prev) => ({ ...prev, [key]: results }));
      if (showSuccessToast) {
        toast.success("Query executada com sucesso!");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao executar query");
    } finally {
      setExecutingQueries((prev) => ({ ...prev, [key]: false }));
      runningQueriesRef.current.delete(key);
    }
  };

  useEffect(() => {
    if (isUser || disableAutoExecute || !parsedContent) return;

    for (const block of parsedContent.sqlBlocks) {
      if (!block.autoExecute) continue;

      const key = toBlockKey(block);
      if (autoAttemptedRef.current.has(key)) {
        continue;
      }

      autoAttemptedRef.current.add(key);
      void executeSql(block, false);
    }
  }, [disableAutoExecute, isUser, parsedContent]);

  const handleCopy = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success("Codigo copiado!");
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const plainAssistantText = parsedContent?.plainText || "";
  const sqlBlocks = parsedContent?.sqlBlocks || [];

  return (
    <div className={cn("flex gap-3 p-4 rounded-lg", isUser ? "bg-muted/50" : "bg-background")}>
      <div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
          isUser ? "bg-primary text-primary-foreground" : "bg-secondary",
        )}
      >
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>

      <div className="flex-1 min-w-0">
        {isUser ? (
          <p className="text-sm leading-6 whitespace-pre-wrap break-words">{message.content}</p>
        ) : sqlBlocks.length > 0 ? (
          <div className="space-y-4">
            {sqlBlocks.map((block, index) => {
              const key = toBlockKey(block);
              const isExecuting = Boolean(executingQueries[key]);
              const hasAttempted = attemptedQueries.has(key);
              const hasResults = Object.prototype.hasOwnProperty.call(queryResults, key);

              return (
                <div key={key} className="border rounded-xl bg-card overflow-hidden">
                  <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-muted-foreground">
                      SQL {index + 1} {block.autoExecute ? "(Auto)" : ""}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 text-xs"
                        onClick={() => void executeSql(block, true)}
                        disabled={isExecuting}
                      >
                        {isExecuting ? (
                          <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        ) : (
                          <Play className="w-3 h-3 mr-1" />
                        )}
                        {hasResults ? "Reexecutar" : "Executar"}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 text-xs"
                        onClick={() => void handleCopy(block.query)}
                      >
                        {copiedCode === block.query ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      </Button>
                    </div>
                  </div>

                  <SyntaxHighlighter
                    style={vscDarkPlus}
                    language="sql"
                    PreTag="div"
                    className="!m-0 !rounded-none"
                  >
                    {block.query}
                  </SyntaxHighlighter>

                  <div className="px-3 pb-3">
                    <QueryResultTable
                      results={queryResults[key]}
                      isLoading={isExecuting}
                      hasAttempted={hasAttempted}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm leading-6 whitespace-pre-wrap break-words">
            {plainAssistantText || "Sem conteudo para exibir."}
          </p>
        )}
      </div>
    </div>
  );
}

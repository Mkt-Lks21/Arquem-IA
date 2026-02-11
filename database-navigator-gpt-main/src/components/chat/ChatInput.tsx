import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Send, Database, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type DatabaseTarget = "internal" | "external";

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  selectedDatabase: DatabaseTarget;
  onDatabaseChange: (db: DatabaseTarget) => void;
  hasExternalDb: boolean;
}

export default function ChatInput({ 
  onSend, 
  isLoading, 
  selectedDatabase, 
  onDatabaseChange,
  hasExternalDb 
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSend = () => {
    if (input.trim() && !isLoading) {
      onSend(input.trim());
      setInput("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const databaseLabel = selectedDatabase === "external" ? "Banco Externo" : "Banco Local";

  return (
    <div className="border-t p-4 bg-background">
      <div className="max-w-4xl mx-auto space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte algo sobre seu banco de dados..."
              className="min-h-[44px] max-h-[200px] resize-none pr-32"
              disabled={isLoading}
            />
            <div className="absolute right-2 bottom-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-7 text-xs gap-1 bg-background"
                    disabled={isLoading}
                  >
                    <Database className="w-3 h-3" />
                    {databaseLabel}
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem 
                    onClick={() => onDatabaseChange("internal")}
                    className={selectedDatabase === "internal" ? "bg-accent" : ""}
                  >
                    <Database className="w-4 h-4 mr-2" />
                    Banco Local
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => onDatabaseChange("external")}
                    disabled={!hasExternalDb}
                    className={selectedDatabase === "external" ? "bg-accent" : ""}
                  >
                    <Database className="w-4 h-4 mr-2" />
                    Banco Externo
                    {!hasExternalDb && (
                      <span className="ml-2 text-xs text-muted-foreground">(não configurado)</span>
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            size="icon"
            className="shrink-0 h-[44px] w-[44px]"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

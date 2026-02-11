import { useChat } from "@/hooks/useChat";
import AppSidebar from "@/components/sidebar/AppSidebar";
import ChatMessages from "@/components/chat/ChatMessages";
import ChatInput, { DatabaseTarget } from "@/components/chat/ChatInput";
import { executeQuery, executeExternalQuery, fetchExternalMetadata, cacheExternalMetadata } from "@/lib/api";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function Index() {
  const {
    conversations,
    currentConversationId,
    messages,
    isLoading,
    streamingContent,
    sendMessage,
    selectConversation,
    deleteConversation,
    createNewConversation,
  } = useChat();
  
  const [hasExternalDb, setHasExternalDb] = useState(false);
  const [selectedDatabase, setSelectedDatabase] = useState<DatabaseTarget>("internal");

  // Check if external DB is configured and cache its metadata
  useEffect(() => {
    const initExternalDb = async () => {
      try {
        const data = await fetchExternalMetadata();
        if (data.length > 0) {
          setHasExternalDb(true);
          // Cache external metadata for LLM context
          await cacheExternalMetadata(data);
        }
      } catch {
        setHasExternalDb(false);
      }
    };
    initExternalDb();
  }, []);

  const handleDatabaseChange = async (db: DatabaseTarget) => {
    setSelectedDatabase(db);
    if (db === "external" && hasExternalDb) {
      toast.info("Usando banco de dados externo para consultas");
    } else {
      toast.info("Usando banco de dados local para consultas");
    }
  };

  const handleExecuteQuery = async (query: string, isExternal?: boolean) => {
    const useExternal = isExternal ?? (selectedDatabase === "external");
    if (useExternal && hasExternalDb) {
      return await executeExternalQuery(query);
    }
    return await executeQuery(query);
  };

  return (
    <div className="flex h-screen bg-background">
      <AppSidebar
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelectConversation={selectConversation}
        onDeleteConversation={deleteConversation}
        onNewConversation={createNewConversation}
      />

      <main className="flex-1 flex flex-col">
        <ChatMessages
          messages={messages}
          isLoading={isLoading}
          streamingContent={streamingContent}
          onExecuteQuery={handleExecuteQuery}
        />

        <ChatInput
          onSend={(msg) => sendMessage(msg, selectedDatabase)}
          isLoading={isLoading}
          selectedDatabase={selectedDatabase}
          onDatabaseChange={handleDatabaseChange}
          hasExternalDb={hasExternalDb}
        />
      </main>
    </div>
  );
}

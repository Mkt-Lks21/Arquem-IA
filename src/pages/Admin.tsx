import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLLMSettings } from "@/hooks/useLLMSettings";
import { useMetadata } from "@/hooks/useMetadata";
import { OPENAI_MODELS, GOOGLE_MODELS } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Save, Database, Key, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const formSchema = z.object({
  provider: z.enum(["openai", "google"]),
  model: z.string().min(1, "Selecione um modelo"),
  api_key: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function Admin() {
  const navigate = useNavigate();
  const { settings, saveSettings, isSaving } = useLLMSettings();
  const { isLoading: metadataLoading, refresh, isRefreshing, groupedMetadata } = useMetadata();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      provider: "openai",
      model: "",
      api_key: "",
    },
  });

  const selectedProvider = form.watch("provider");
  const models = selectedProvider === "openai" ? OPENAI_MODELS : GOOGLE_MODELS;
  const hasStoredApiKey = Boolean(settings?.has_api_key);

  useEffect(() => {
    if (settings) {
      form.setValue("provider", settings.provider as "openai" | "google");
      form.setValue("model", settings.model);
      form.setValue("api_key", "");
    }
  }, [settings, form]);

  useEffect(() => {
    const currentModel = form.getValues("model");
    if (currentModel && !models.includes(currentModel)) {
      form.setValue("model", "");
    }
  }, [selectedProvider, form, models]);

  const onSubmit = async (values: FormValues) => {
    const nextApiKey = values.api_key?.trim() || "";

    if (!hasStoredApiKey && !nextApiKey) {
      form.setError("api_key", {
        type: "manual",
        message: "API Key e obrigatoria na primeira configuracao",
      });
      return;
    }

    form.clearErrors("api_key");

    try {
      await saveSettings({
        provider: values.provider,
        model: values.model,
        api_key: nextApiKey || undefined,
      });
      form.setValue("api_key", "");
      toast.success("Configuracoes salvas com sucesso!");
    } catch {
      toast.error("Erro ao salvar configuracoes");
    }
  };

  const handleRefreshMetadata = async () => {
    try {
      await refresh();
      toast.success("Metadados atualizados com sucesso!");
    } catch {
      toast.error("Erro ao atualizar metadados");
    }
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto relative z-10">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4 glass-panel rounded-2xl p-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Configuracoes</h1>
            <p className="text-muted-foreground">
              Configure o provedor de LLM e gerencie os metadados do banco de dados.
            </p>
          </div>
        </div>

        <Tabs defaultValue="llm" className="space-y-4">
          <TabsList className="glass-subtle rounded-2xl p-1">
            <TabsTrigger value="llm" className="gap-2">
              <Key className="w-4 h-4" />
              LLM
            </TabsTrigger>
            <TabsTrigger value="metadata" className="gap-2">
              <Database className="w-4 h-4" />
              Metadados
            </TabsTrigger>
          </TabsList>

          <TabsContent value="llm">
            <Card>
              <CardHeader>
                <CardTitle>Configuracao do LLM</CardTitle>
                <CardDescription>Configure as credenciais do provedor de linguagem.</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="provider"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Provedor</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione o provedor" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="openai">OpenAI</SelectItem>
                              <SelectItem value="google">Google (Gemini)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="model"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Modelo</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione o modelo" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {models.map((model) => (
                                <SelectItem key={model} value={model}>
                                  {model}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="api_key"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>API Key</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder={
                                hasStoredApiKey ? "******** (deixe em branco para manter)" : "sk-..."
                              }
                              {...field}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <FormDescription>
                            {hasStoredApiKey
                              ? "Deixe em branco para manter a chave atual ou informe uma nova."
                              : "Sua chave de API do provedor selecionado."}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button type="submit" disabled={isSaving}>
                      <Save className="w-4 h-4 mr-2" />
                      {isSaving ? "Salvando..." : "Salvar"}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="metadata">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Metadados do Banco</CardTitle>
                    <CardDescription>
                      Estrutura das tabelas disponiveis para analise no projeto Supabase principal.
                    </CardDescription>
                  </div>
                  <Button variant="outline" onClick={handleRefreshMetadata} disabled={isRefreshing}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                    Atualizar
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {metadataLoading ? (
                  <p className="text-muted-foreground">Carregando metadados...</p>
                ) : Object.keys(groupedMetadata).length === 0 ? (
                  <p className="text-muted-foreground">
                    Nenhum metadado encontrado. Clique em "Atualizar" para carregar.
                  </p>
                ) : (
                  <div className="space-y-6">
                    {Object.entries(groupedMetadata).map(([schema, tables]) => (
                      <div key={schema}>
                        <h3 className="text-lg font-semibold mb-2">Schema: {schema}</h3>
                        <div className="space-y-4">
                          {Object.entries(tables).map(([table, columns]) => (
                            <div key={table} className="rounded-2xl glass-subtle p-4">
                              <h4 className="font-medium mb-2">{table}</h4>
                              <div className="flex flex-wrap gap-2">
                                {columns.map((col) => (
                                  <Badge key={col.column_name} variant="secondary" className="text-xs">
                                    {col.column_name}{" "}
                                    <span className="text-muted-foreground ml-1">({col.data_type})</span>
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

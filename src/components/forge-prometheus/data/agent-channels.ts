/**
 * Channel and integration options for PrometheusOnboarding Step 2
 * Reflects real tool_registry categories + "coming soon" tools
 */

// ═══ CHANNELS (where the agent communicates) ═══
export interface AgentChannel {
  id: string;
  emoji: string;
  label: string;
  desc: string;
}

export const AGENT_CHANNELS: AgentChannel[] = [
  { id: "web_widget", emoji: "🌐", label: "Web Widget", desc: "Chatbot embutido no site da empresa" },
  { id: "whatsapp", emoji: "📱", label: "WhatsApp", desc: "Atendimento via WhatsApp Business API" },
  { id: "telegram", emoji: "✈️", label: "Telegram", desc: "Bot no Telegram com comandos e inline" },
  { id: "instagram", emoji: "📸", label: "Instagram / Messenger", desc: "Mensagens via Instagram DM e Messenger" },
  { id: "email", emoji: "📧", label: "Email", desc: "Atendimento e notificações por email" },
  { id: "sms", emoji: "💬", label: "SMS", desc: "Mensagens de texto via Twilio" },
  { id: "voip", emoji: "📞", label: "VoIP / Telefone", desc: "Chamadas de voz com TwiML customizável" },
  { id: "api_rest", emoji: "🔗", label: "API REST", desc: "Endpoint REST para integração programática" },
];

// ═══ TOOL CATEGORIES (what the agent can do) ═══
export interface AgentTool {
  id: string;
  label: string;
  desc: string;
  comingSoon?: boolean;
}

export interface AgentToolCategory {
  id: string;
  emoji: string;
  label: string;
  desc: string;
  tools: AgentTool[];
}

export const AGENT_TOOL_CATEGORIES: AgentToolCategory[] = [
  {
    id: "communication",
    emoji: "📡",
    label: "Comunicação",
    desc: "Envio e leitura de mensagens multicanal",
    tools: [
      { id: "email_send", label: "Enviar Email", desc: "Email transacional via Resend" },
      { id: "email_batch_send", label: "Email em Lote", desc: "Até 100 emails de uma vez" },
      { id: "email_read", label: "Ler Emails", desc: "Gmail, Microsoft Graph ou IMAP" },
      { id: "email_check_status", label: "Status de Email", desc: "Verifica entrega via Resend" },
      { id: "send_sms", label: "Enviar SMS", desc: "Mensagem SMS via Twilio" },
      { id: "send_whatsapp_message", label: "Enviar WhatsApp", desc: "WhatsApp Business (Twilio)" },
      { id: "send_telegram_message", label: "Enviar Telegram", desc: "Telegram Bot API" },
      { id: "instagram_send", label: "Enviar Instagram/Messenger", desc: "Meta Graph API" },
      { id: "instagram_read", label: "Ler Instagram/Messenger", desc: "Conversas e mensagens" },
      { id: "voip_call", label: "Chamada VoIP", desc: "Twilio Voice com TwiML" },
      { id: "voip_status", label: "Status VoIP", desc: "Status de chamada em andamento" },
    ],
  },
  {
    id: "voice",
    emoji: "🎙️",
    label: "Voz & Áudio",
    desc: "Síntese, transcrição e clonagem de voz",
    tools: [
      { id: "tts_kokoro", label: "Texto para Voz (TTS)", desc: "Kokoro — vozes naturais em PT/EN" },
      { id: "stt_whisper", label: "Voz para Texto (STT)", desc: "Whisper — transcrição de áudio" },
      { id: "voice_clone", label: "Clonar Voz", desc: "Clonagem de voz customizada" },
      { id: "voice_list", label: "Listar Vozes", desc: "Vozes disponíveis por idioma" },
    ],
  },
  {
    id: "analytics",
    emoji: "📊",
    label: "Analytics & IA",
    desc: "Análise de dados, sentimento e previsões",
    tools: [
      { id: "sentiment_analyze", label: "Análise de Sentimento", desc: "Sentimento, emoções e urgência" },
      { id: "text_classify", label: "Classificação de Texto", desc: "Categorias personalizadas via IA" },
      { id: "nl_to_sql", label: "Consulta em Linguagem Natural", desc: "Pergunta → SQL seguro" },
      { id: "data_aggregate", label: "Agregação de Dados", desc: "Sumarização com agrupamento e métricas" },
      { id: "trend_analyze", label: "Análise de Tendência", desc: "Direção, sazonalidade, volatilidade" },
      { id: "time_series_forecast", label: "Previsão Temporal", desc: "Regressão linear e média móvel" },
      { id: "anomaly_detect", label: "Detecção de Anomalias", desc: "Z-score, IQR, consenso multi-método" },
    ],
  },
  {
    id: "media",
    emoji: "🎨",
    label: "Mídia & Visual",
    desc: "Geração de imagens, vídeos e apresentações",
    tools: [
      { id: "image_generate", label: "Gerar Imagem", desc: "DALL-E, Stability AI ou Together AI" },
      { id: "video_avatar", label: "Vídeo Avatar", desc: "HeyGen, D-ID ou Synthesia" },
      { id: "screenshot_take", label: "Captura de Tela", desc: "Screenshot de qualquer URL" },
      { id: "presentation_generate", label: "Gerar Apresentação", desc: "Slides em Markdown (Marp)" },
    ],
  },
  {
    id: "document",
    emoji: "📄",
    label: "Documentos",
    desc: "Geração e parsing de PDF e contratos",
    tools: [
      { id: "pdf_generate", label: "Gerar PDF", desc: "Relatórios e contratos em PDF" },
      { id: "document_parse", label: "Parser de Documentos", desc: "Extração de dados de PDFs" },
    ],
  },
  {
    id: "calendar",
    emoji: "📅",
    label: "Calendário & Tarefas",
    desc: "Google Calendar e Google Tasks",
    tools: [
      { id: "create_event", label: "Criar Evento", desc: "Novo evento no Google Calendar" },
      { id: "list_events", label: "Listar Eventos", desc: "Eventos dos próximos dias" },
      { id: "check_availability", label: "Verificar Disponibilidade", desc: "Horários livres para agendamento" },
      { id: "list_tasks", label: "Listar Tarefas", desc: "Tarefas pendentes do Google Tasks" },
    ],
  },
  {
    id: "knowledge",
    emoji: "📚",
    label: "RAG & Conhecimento",
    desc: "Base de conhecimento com busca semântica",
    tools: [
      { id: "rag_search", label: "Busca Vetorial (RAG)", desc: "Busca semântica em documentos" },
      { id: "generate_embedding", label: "Gerar Embedding", desc: "Google text-embedding-004" },
      { id: "embed_and_upsert", label: "Embed e Salvar", desc: "Embedding direto na tabela alvo" },
      { id: "search_codex", label: "Busca Codex", desc: "Templates de agentes por similaridade" },
    ],
  },
  {
    id: "data",
    emoji: "🧠",
    label: "Grafos de Conhecimento",
    desc: "Criação e consulta de grafos semânticos",
    tools: [
      { id: "kg_node_create", label: "Criar Nó", desc: "Nó no grafo do tenant" },
      { id: "kg_edge_create", label: "Criar Aresta", desc: "Relação entre nós" },
      { id: "kg_query", label: "Consultar Grafo", desc: "Busca N-hop e shortest path" },
      { id: "kg_visualize", label: "Visualizar Grafo", desc: "Exporta subgrafo para D3.js" },
    ],
  },
  {
    id: "integration",
    emoji: "🔌",
    label: "Automação & Web",
    desc: "Crawling, scraping, execução de código",
    tools: [
      { id: "firecrawl_crawl", label: "Crawl (Firecrawl)", desc: "Crawling profundo de sites" },
      { id: "firecrawl_scrape", label: "Scrape (Firecrawl)", desc: "Extração de dados estruturados" },
      { id: "browser_action", label: "Browser Automático", desc: "Automação via Browserbase" },
      { id: "code_execute", label: "Executar Código", desc: "Sandbox seguro via E2B" },
    ],
  },
  {
    id: "revenue",
    emoji: "💰",
    label: "Revenue & Vendas",
    desc: "Lead scoring, recomendação, churn e pricing",
    tools: [
      { id: "score_lead", label: "Lead Scoring", desc: "Score composto comportamental + IA" },
      { id: "recommend_items", label: "Recomendação", desc: "Itens personalizados por similaridade" },
      { id: "churn_predict", label: "Predição de Churn", desc: "Probabilidade de abandono" },
      { id: "dynamic_pricing", label: "Precificação Dinâmica", desc: "Preço otimizado por demanda" },
      { id: "recover_cart", label: "Recuperar Carrinho", desc: "Estratégia de recuperação de carrinho" },
    ],
  },
  {
    id: "visualization",
    emoji: "📈",
    label: "Visualização",
    desc: "Gráficos e QR Codes",
    tools: [
      { id: "chart_generate", label: "Gerar Gráficos", desc: "Bar, line, pie, radar via QuickChart" },
      { id: "qr_code_generate", label: "Gerar QR Code", desc: "QR Code com logo e cores customizáveis" },
    ],
  },
  {
    id: "brasil",
    emoji: "🇧🇷",
    label: "Brasil",
    desc: "Validações e cálculos brasileiros",
    tools: [
      { id: "validate_document", label: "Validar CPF/CNPJ", desc: "Verificação de dígitos" },
      { id: "lookup_cep", label: "Consultar CEP", desc: "Endereço completo via ViaCEP" },
      { id: "calc_financial", label: "Calculadora Financeira", desc: "Juros, parcelas e descontos" },
    ],
  },
  {
    id: "juridical",
    emoji: "⚖️",
    label: "Jurídico",
    desc: "Consultas processuais e prazos (verificar disponibilidade)",
    tools: [
      { id: "tribunal_consulta_cnj", label: "Consulta CNJ", desc: "Processo por número CNJ ⚠️" },
      { id: "jurisprudencia_search", label: "Jurisprudência", desc: "Busca de decisões judiciais ⚠️" },
      { id: "prazo_processual", label: "Prazos Processuais", desc: "Cálculo de prazos ⚠️" },
      { id: "diario_oficial", label: "Diário Oficial", desc: "Consulta via Querido Diário 🟡" },
    ],
  },
  // ═══ COMING SOON ═══
  {
    id: "social_media",
    emoji: "📣",
    label: "Redes Sociais",
    desc: "Publicação em redes sociais (em breve)",
    tools: [
      { id: "linkedin_post", label: "Publicar LinkedIn", desc: "Post no LinkedIn", comingSoon: true },
      { id: "twitter_post", label: "Publicar X/Twitter", desc: "Tweet automático", comingSoon: true },
    ],
  },
  {
    id: "productivity",
    emoji: "🗂️",
    label: "Produtividade",
    desc: "Planilhas, notas e mensagens (em breve)",
    tools: [
      { id: "sheets_read", label: "Ler Google Sheets", desc: "Leitura de planilhas", comingSoon: true },
      { id: "sheets_write", label: "Escrever Google Sheets", desc: "Escrita em planilhas", comingSoon: true },
      { id: "notion_read", label: "Ler Notion", desc: "Consulta de páginas Notion", comingSoon: true },
      { id: "notion_write", label: "Escrever Notion", desc: "Criar/editar páginas Notion", comingSoon: true },
      { id: "slack_send", label: "Enviar Slack", desc: "Mensagens para canais Slack", comingSoon: true },
      { id: "webhook_send", label: "Webhook Genérico", desc: "POST para qualquer URL", comingSoon: true },
      { id: "flat_html", label: "Receber HTML", desc: "Recebe e processa HTML de sites", comingSoon: true },
    ],
  },
];

// ═══ BACKWARD COMPAT — flat integrations list for Review step ═══
export interface AgentIntegration {
  id: string;
  emoji: string;
  label: string;
  desc: string;
}

export const AGENT_INTEGRATIONS: AgentIntegration[] = AGENT_TOOL_CATEGORIES.flatMap(cat =>
  cat.tools.filter(t => !t.comingSoon).map(t => ({
    id: t.id,
    emoji: cat.emoji,
    label: t.label,
    desc: t.desc,
  }))
);

-- T05: Batch seeds tool_registry (P24-P33, P35)
-- Exclui: jurídico (20260315045924), calendar (20260315043943)

-- from vibrant/20260315060117_a5c4c3ca-b2b9-41cb-bd22-3f9ca94d8cd5.sql

INSERT INTO public.tool_registry (name, display_name, description, category, executor_type, executor_config, input_schema, output_schema, is_builtin, is_active, requires_idempotency, circuit_breaker_threshold, circuit_breaker_timeout_seconds, rate_limit_per_minute, required_secrets, sandbox_level)
VALUES
  ('chart_generate', 'Gerador de Gráficos', 'Gera gráficos (bar, line, pie, doughnut, radar, polarArea) via QuickChart.io. Retorna URL pública da imagem.', 'visualization', 'builtin', '{}', 
   '{"type":"object","properties":{"type":{"type":"string","enum":["bar","line","pie","doughnut","radar","polarArea"],"default":"bar"},"labels":{"type":"array","items":{"type":"string"}},"data":{"type":"array","items":{"type":"number"}},"datasets":{"type":"array"},"title":{"type":"string"},"width":{"type":"number","default":600},"height":{"type":"number","default":400},"format":{"type":"string","default":"png"},"background_color":{"type":"string","default":"white"},"options":{"type":"object"}},"required":["labels"]}',
   '{"type":"object","properties":{"chart_url":{"type":"string"},"chart_type":{"type":"string"},"width":{"type":"number"},"height":{"type":"number"}}}',
   true, true, false, 5, 60, 120, null, 'none'),
  
  ('qr_generate', 'Gerador de QR Code', 'Gera QR codes para textos, URLs ou dados. Retorna URL pública da imagem PNG/SVG.', 'visualization', 'builtin', '{}',
   '{"type":"object","properties":{"text":{"type":"string","description":"Conteúdo do QR code (URL, texto, etc.)"},"size":{"type":"number","default":300},"margin":{"type":"number","default":4},"dark_color":{"type":"string","default":"000000"},"light_color":{"type":"string","default":"ffffff"},"format":{"type":"string","enum":["png","svg"],"default":"png"},"ec_level":{"type":"string","enum":["L","M","Q","H"],"default":"M"}},"required":["text"]}',
   '{"type":"object","properties":{"qr_url":{"type":"string"},"text":{"type":"string"},"size":{"type":"number"},"format":{"type":"string"}}}',
   true, true, true, 5, 60, 120, null, 'none')
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  input_schema = EXCLUDED.input_schema,
  output_schema = EXCLUDED.output_schema,
  is_active = true,
  updated_at = now();

-- from vibrant/20260315061027_e5edd1b1-9dcd-445c-91de-ea72a73a8f6c.sql

INSERT INTO public.tool_registry (name, display_name, description, category, executor_type, executor_config, input_schema, output_schema, is_builtin, is_active, requires_idempotency, circuit_breaker_threshold, circuit_breaker_timeout_seconds, rate_limit_per_minute, required_secrets, sandbox_level)
VALUES
  ('email_send', 'Enviar Email', 'Envia email via Resend usando a API key do próprio tenant. Suporta HTML, CC, BCC, reply-to e tags.', 'communication', 'builtin', '{}',
   '{"type":"object","properties":{"to":{"oneOf":[{"type":"string"},{"type":"array","items":{"type":"string"}}],"description":"Destinatário(s)"},"from":{"type":"string"},"subject":{"type":"string"},"html":{"type":"string"},"text":{"type":"string"},"cc":{"oneOf":[{"type":"string"},{"type":"array","items":{"type":"string"}}]},"bcc":{"oneOf":[{"type":"string"},{"type":"array","items":{"type":"string"}}]},"reply_to":{"type":"string"},"tags":{"type":"array","items":{"type":"object"}}},"required":["to","subject"]}',
   '{"type":"object","properties":{"email_id":{"type":"string"},"to":{"type":"array"},"subject":{"type":"string"},"status":{"type":"string"}}}',
   true, true, true, 5, 60, 60, ARRAY['RESEND_API_KEY'], 'standard'),

  ('email_batch_send', 'Envio em Lote', 'Envia até 100 emails de uma vez via Resend Batch API.', 'communication', 'builtin', '{}',
   '{"type":"object","properties":{"emails":{"type":"array","items":{"type":"object","properties":{"to":{"type":"string"},"subject":{"type":"string"},"html":{"type":"string"},"from":{"type":"string"}},"required":["to","subject"]}},"default_from":{"type":"string"}},"required":["emails"]}',
   '{"type":"object","properties":{"sent_count":{"type":"number"},"email_ids":{"type":"array","items":{"type":"string"}},"status":{"type":"string"}}}',
   true, true, true, 5, 60, 30, ARRAY['RESEND_API_KEY'], 'standard'),

  ('email_check_status', 'Status do Email', 'Verifica status de entrega de um email enviado via Resend.', 'communication', 'builtin', '{}',
   '{"type":"object","properties":{"email_id":{"type":"string"}},"required":["email_id"]}',
   '{"type":"object","properties":{"email_id":{"type":"string"},"status":{"type":"string"},"from":{"type":"string"},"to":{"type":"array"},"subject":{"type":"string"},"created_at":{"type":"string"},"events":{"type":"array"}}}',
   true, true, false, 5, 60, 120, ARRAY['RESEND_API_KEY'], 'none'),

  ('email_read', 'Ler Emails', 'Lê emails via Gmail API, Microsoft Graph ou IMAP.', 'communication', 'builtin', '{}',
   '{"type":"object","properties":{"folder":{"type":"string","default":"INBOX"},"limit":{"type":"number","default":10},"search":{"type":"string"},"since":{"type":"string"},"unseen_only":{"type":"boolean","default":true},"mark_as_read":{"type":"boolean","default":false}}}',
   '{"type":"object","properties":{"provider":{"type":"string"},"emails":{"type":"array"},"total":{"type":"number"}}}',
   true, true, false, 5, 60, 30, ARRAY['GMAIL_ACCESS_TOKEN','MS_GRAPH_ACCESS_TOKEN'], 'standard')
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  input_schema = EXCLUDED.input_schema,
  output_schema = EXCLUDED.output_schema,
  required_secrets = EXCLUDED.required_secrets,
  is_active = true,
  updated_at = now();

-- from vibrant/20260315062032_13b365a7-013d-456a-9486-c4607606b353.sql

-- P26: Register Analytics de Negócio tools
INSERT INTO public.tool_registry (name, display_name, description, category, executor_type, is_builtin, is_active, input_schema, output_schema, required_secrets, requires_idempotency, sandbox_level)
VALUES
  ('sentiment_analyze', 'Análise de Sentimento', 'Analisa sentimento, emoções, tom e urgência de um texto usando IA', 'analytics', 'builtin', true, true,
   '{"text": {"type": "string", "required": true}, "language": {"type": "string", "default": "pt-BR"}, "detailed": {"type": "boolean", "default": true}}',
   '{"sentiment": "string", "score": "number", "confidence": "number", "emotions": "array", "tone": "string", "urgency": "string"}',
   null, false, 'none'),
  ('text_classify', 'Classificação de Texto', 'Classifica texto em categorias personalizadas usando IA', 'analytics', 'builtin', true, true,
   '{"text": {"type": "string", "required": true}, "categories": {"type": "array", "required": true}, "multi_label": {"type": "boolean", "default": false}}',
   '{"classifications": "array", "primary_category": "string", "primary_confidence": "number"}',
   null, false, 'none'),
  ('nl_to_sql', 'Consulta em Linguagem Natural', 'Converte perguntas em linguagem natural para consultas seguras no banco de dados', 'analytics', 'builtin', true, true,
   '{"question": {"type": "string", "required": true}, "tables": {"type": "array", "required": true}, "schema_hint": {"type": "string"}, "execute": {"type": "boolean", "default": true}}',
   '{"rows": "array", "row_count": "number", "aggregation": "object", "explanation": "string"}',
   null, false, 'standard'),
  ('data_aggregate', 'Agregação de Dados', 'Agrega e sumariza dados de tabelas com agrupamento e métricas', 'analytics', 'builtin', true, true,
   '{"table": {"type": "string", "required": true}, "metrics": {"type": "array"}, "group_by": {"type": "string"}, "filters": {"type": "object"}, "limit": {"type": "number", "default": 1000}}',
   '{"groups": "array", "totals": "object", "total_rows": "number"}',
   null, true, 'standard')
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  input_schema = EXCLUDED.input_schema,
  output_schema = EXCLUDED.output_schema,
  is_active = true,
  updated_at = now();

-- from vibrant/20260315062417_8c5da79d-75e0-4f50-a458-7a497fc2dd8e.sql

-- P27: Register Multi-Canal tools (Instagram/Messenger + VoIP)
INSERT INTO public.tool_registry (name, display_name, description, category, executor_type, is_builtin, is_active, input_schema, output_schema, required_secrets, requires_idempotency, sandbox_level)
VALUES
  ('instagram_send', 'Enviar Instagram/Messenger', 'Envia mensagens via Instagram ou Messenger (Meta Graph API)', 'communication', 'builtin', true, true,
   '{"recipient_id": {"type": "string", "required": true}, "text": {"type": "string"}, "type": {"type": "string", "enum": ["text", "image", "template", "quick_replies"], "default": "text"}, "platform": {"type": "string", "enum": ["instagram", "messenger"], "default": "instagram"}, "page_id": {"type": "string"}}',
   '{"message_id": "string", "recipient_id": "string", "platform": "string", "status": "string"}',
   ARRAY['META_PAGE_ACCESS_TOKEN'], true, 'standard'),
  ('instagram_read', 'Ler Conversas Instagram/Messenger', 'Lê conversas e mensagens do Instagram ou Messenger', 'communication', 'builtin', true, true,
   '{"conversation_id": {"type": "string"}, "platform": {"type": "string", "enum": ["instagram", "messenger"], "default": "instagram"}, "limit": {"type": "number", "default": 10}, "page_id": {"type": "string"}}',
   '{"conversations": "array", "messages": "array", "conversation_count": "number"}',
   ARRAY['META_PAGE_ACCESS_TOKEN'], false, 'standard'),
  ('voip_call', 'Chamada VoIP', 'Inicia chamada de voz via Twilio Voice com TwiML customizável', 'communication', 'builtin', true, true,
   '{"to": {"type": "string", "required": true}, "action": {"type": "string", "enum": ["twiml", "connect", "record"], "default": "twiml"}, "message": {"type": "string"}, "language": {"type": "string", "default": "pt-BR"}, "twiml": {"type": "string"}, "record_call": {"type": "boolean"}}',
   '{"call_sid": "string", "to": "string", "from": "string", "status": "string", "action": "string"}',
   ARRAY['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'], true, 'standard'),
  ('voip_status', 'Status de Chamada', 'Verifica status de uma chamada VoIP em andamento ou concluída', 'communication', 'builtin', true, true,
   '{"call_sid": {"type": "string", "required": true}}',
   '{"call_sid": "string", "status": "string", "duration": "string", "price": "string"}',
   ARRAY['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'], false, 'standard'),
  ('voip_transcribe', 'Transcrever Chamada', 'Transcreve gravação de chamada usando Whisper (plataforma) ou provedor do tenant', 'communication', 'builtin', true, true,
   '{"recording_url": {"type": "string", "required": true}, "language": {"type": "string", "default": "pt"}, "prompt": {"type": "string"}}',
   '{"text": "string", "language": "string", "source": "string", "recording_url": "string"}',
   null, true, 'standard')
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  input_schema = EXCLUDED.input_schema,
  output_schema = EXCLUDED.output_schema,
  required_secrets = EXCLUDED.required_secrets,
  is_active = true,
  updated_at = now();

-- from vibrant/20260315062738_a9b2cba6-53f8-4f3e-a2dc-827ba266bead.sql

-- P28: Register Voice Cloning & TTS/STT tools
INSERT INTO public.tool_registry (name, display_name, description, category, executor_type, is_builtin, is_active, input_schema, output_schema, required_secrets, requires_idempotency, sandbox_level)
VALUES
  ('tts_synthesize', 'Sintetizar Voz (TTS)', 'Converte texto em áudio via Kokoro (gratuito) ou ElevenLabs (tenant)', 'voice', 'builtin', true, true,
   '{"text": {"type": "string", "required": true}, "voice_id": {"type": "string"}, "language": {"type": "string", "default": "pt-BR"}, "provider": {"type": "string", "enum": ["auto", "kokoro", "elevenlabs"], "default": "auto"}, "speed": {"type": "number", "default": 1.0}, "format": {"type": "string", "default": "mp3"}}',
   '{"audio_base64": "string", "format": "string", "provider": "string", "voice": "string"}',
   null, false, 'standard'),
  ('voice_clone', 'Clonar Voz', 'Clona uma voz a partir de amostras de áudio via ElevenLabs Instant Voice Cloning', 'voice', 'builtin', true, true,
   '{"name": {"type": "string", "required": true}, "audio_urls": {"type": "array"}, "audio_base64": {"type": "string"}, "description": {"type": "string"}, "labels": {"type": "object"}}',
   '{"voice_id": "string", "name": "string", "status": "string"}',
   ARRAY['ELEVENLABS_API_KEY'], true, 'standard'),
  ('voice_list', 'Listar Vozes', 'Lista vozes disponíveis nos provedores (Kokoro gratuito + ElevenLabs)', 'voice', 'builtin', true, true,
   '{"provider": {"type": "string", "enum": ["all", "kokoro", "elevenlabs"], "default": "all"}}',
   '{"voices": "array", "total": "number", "providers": "array"}',
   null, false, 'none'),
  ('stt_transcribe', 'Transcrever Áudio (STT)', 'Transcreve áudio em texto via Whisper (gratuito) ou ElevenLabs Scribe (tenant)', 'voice', 'builtin', true, true,
   '{"audio_url": {"type": "string"}, "audio_base64": {"type": "string"}, "language": {"type": "string", "default": "pt"}, "provider": {"type": "string", "enum": ["auto", "whisper", "elevenlabs"], "default": "auto"}, "diarize": {"type": "boolean", "default": false}}',
   '{"text": "string", "language": "string", "provider": "string", "words": "array"}',
   null, true, 'standard')
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  input_schema = EXCLUDED.input_schema,
  output_schema = EXCLUDED.output_schema,
  required_secrets = EXCLUDED.required_secrets,
  is_active = true,
  updated_at = now();

-- from vibrant/20260315063043_8971d824-acea-491e-bea7-ac619cf1c256.sql

-- P29: Register Visual Content tools
INSERT INTO public.tool_registry (name, display_name, description, category, executor_type, is_builtin, is_active, input_schema, output_schema, required_secrets, requires_idempotency, sandbox_level)
VALUES
  ('image_generate', 'Gerar Imagem', 'Gera imagens via DALL-E, Stability AI ou Together AI (tenant escolhe)', 'media', 'builtin', true, true,
   '{"prompt": {"type": "string", "required": true}, "provider": {"type": "string", "enum": ["auto", "openai", "stability", "together"], "default": "auto"}, "size": {"type": "string", "default": "1024x1024"}, "n": {"type": "number", "default": 1}, "quality": {"type": "string"}, "style": {"type": "string"}}',
   '{"images": "array", "count": "number", "provider": "string", "model": "string"}',
   null, false, 'standard'),
  ('image_edit', 'Editar Imagem', 'Edita ou varia uma imagem existente via OpenAI (inpainting com máscara opcional)', 'media', 'builtin', true, true,
   '{"image_url": {"type": "string", "required": true}, "prompt": {"type": "string", "required": true}, "mask_url": {"type": "string"}, "size": {"type": "string", "default": "1024x1024"}}',
   '{"images": "array", "provider": "string", "action": "string"}',
   ARRAY['OPENAI_API_KEY'], false, 'standard'),
  ('slide_generate', 'Gerar Apresentação', 'Gera slides em formato Marp (Markdown) via LLM — exportável para PDF/PPTX', 'media', 'builtin', true, true,
   '{"topic": {"type": "string", "required": true}, "slides": {"type": "number", "default": 8}, "language": {"type": "string", "default": "pt-BR"}, "style": {"type": "string", "enum": ["professional", "creative", "minimal", "academic"], "default": "professional"}, "outline": {"type": "string"}, "audience": {"type": "string"}}',
   '{"markdown": "string", "slide_count": "number", "format": "string", "topic": "string"}',
   null, false, 'none'),
  ('screenshot_capture', 'Capturar Screenshot', 'Captura screenshot de uma URL — gratuito via thum.io ou premium via tenant key', 'media', 'builtin', true, true,
   '{"url": {"type": "string", "required": true}, "width": {"type": "number", "default": 1280}, "height": {"type": "number", "default": 720}, "full_page": {"type": "boolean", "default": false}}',
   '{"screenshot_url": "string", "width": "number", "height": "number", "provider": "string"}',
   null, true, 'standard')
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  input_schema = EXCLUDED.input_schema,
  output_schema = EXCLUDED.output_schema,
  required_secrets = EXCLUDED.required_secrets,
  is_active = true,
  updated_at = now();

-- from vibrant/20260315063322_538d1847-e0ff-47d8-9b26-8fd12ea4ab90.sql

-- P30: Register Video Avatar tools
INSERT INTO public.tool_registry (name, display_name, description, category, executor_type, is_builtin, is_active, input_schema, output_schema, required_secrets, requires_idempotency, sandbox_level)
VALUES
  ('video_avatar', 'Gerar Vídeo Avatar', 'Gera vídeo com avatar falante via HeyGen, D-ID ou Synthesia (tenant escolhe)', 'media', 'builtin', true, true,
   '{"text": {"type": "string", "required": true}, "provider": {"type": "string", "enum": ["auto", "heygen", "did", "synthesia"], "default": "auto"}, "avatar_id": {"type": "string"}, "voice_id": {"type": "string"}, "language": {"type": "string", "default": "pt-BR"}, "aspect_ratio": {"type": "string", "default": "16:9"}}',
   '{"video_id": "string", "status": "string", "provider": "string"}',
   null, true, 'standard'),
  ('video_avatar_status', 'Status Vídeo Avatar', 'Verifica status de geração de vídeo avatar', 'media', 'builtin', true, true,
   '{"video_id": {"type": "string", "required": true}, "provider": {"type": "string", "enum": ["heygen", "did", "synthesia"], "default": "heygen"}}',
   '{"video_id": "string", "status": "string", "video_url": "string", "duration": "number"}',
   null, false, 'standard'),
  ('avatar_list', 'Listar Avatares', 'Lista avatares disponíveis no provedor do tenant (HeyGen ou D-ID)', 'media', 'builtin', true, true,
   '{"provider": {"type": "string", "enum": ["heygen", "did"], "default": "heygen"}}',
   '{"avatars": "array", "provider": "string"}',
   null, false, 'none')
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  input_schema = EXCLUDED.input_schema,
  output_schema = EXCLUDED.output_schema,
  required_secrets = EXCLUDED.required_secrets,
  is_active = true,
  updated_at = now();

-- from vibrant/20260315064155_e0dc6b10-a648-4733-b3b0-9ecd12605f56.sql

-- P32: Register Predictive Analytics tools
INSERT INTO public.tool_registry (name, display_name, description, category, executor_type, is_builtin, is_active, input_schema, output_schema, required_secrets, requires_idempotency, sandbox_level)
VALUES
  ('time_series_forecast', 'Previsão de Série Temporal', 'Previsão estatística com regressão linear, suavização exponencial ou média móvel + interpretação LLM', 'analytics', 'builtin', true, true,
   '{"data": {"type": "array", "required": true, "items": {"timestamp": "string", "value": "number"}}, "forecast_periods": {"type": "number", "default": 7}, "method": {"type": "string", "enum": ["auto", "linear", "exponential_smoothing", "moving_average"], "default": "auto"}, "context": {"type": "string"}, "interpret": {"type": "boolean", "default": true}, "model_id": {"type": "string"}}',
   '{"method": "string", "stats": "object", "forecast": "array", "interpretation": "string"}',
   null, false, 'standard'),
  ('anomaly_detect', 'Detecção de Anomalias', 'Detecta outliers em séries temporais via Z-score, IQR e janela móvel com consenso multi-método', 'analytics', 'builtin', true, true,
   '{"data": {"type": "array", "required": true, "items": {"timestamp": "string", "value": "number", "label": "string"}}, "sensitivity": {"type": "string", "enum": ["low", "medium", "high"], "default": "medium"}, "method": {"type": "string", "enum": ["auto", "zscore", "iqr", "moving_window"], "default": "auto"}}',
   '{"total_points": "number", "anomalies_found": "number", "anomaly_rate": "number", "anomalies": "array", "stats": "object"}',
   null, false, 'standard'),
  ('trend_analyze', 'Análise de Tendência', 'Decomposição de tendência: direção, sazonalidade, pontos de mudança e volatilidade + interpretação LLM', 'analytics', 'builtin', true, true,
   '{"data": {"type": "array", "required": true, "items": {"timestamp": "string", "value": "number"}}, "context": {"type": "string"}, "interpret": {"type": "boolean", "default": true}, "model_id": {"type": "string"}}',
   '{"trend": "object", "seasonality": "object", "change_points": "array", "volatility": "object", "interpretation": "string"}',
   null, false, 'standard')
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  input_schema = EXCLUDED.input_schema,
  output_schema = EXCLUDED.output_schema,
  is_active = true,
  updated_at = now();

-- from vibrant/20260315064518_2e0667e5-81a0-461d-8678-1ee2153c6de6.sql

-- P33: Register Advanced Automation tools (fixed array syntax)
INSERT INTO public.tool_registry (name, display_name, description, category, executor_type, is_builtin, is_active, input_schema, output_schema, required_secrets, requires_idempotency, sandbox_level)
VALUES
  ('web_scrape', 'Extrair Conteúdo Web', 'Extrai conteúdo de página web — Jina Reader (gratuito) ou Firecrawl (tenant)', 'integration', 'builtin', true, true,
   '{"url": {"type": "string", "required": true}, "mode": {"type": "string", "enum": ["read", "extract", "screenshot"], "default": "read"}, "format": {"type": "string", "enum": ["markdown", "html", "text"], "default": "markdown"}, "provider": {"type": "string", "enum": ["auto", "jina", "firecrawl"], "default": "auto"}, "only_main_content": {"type": "boolean", "default": true}, "wait_for": {"type": "number", "default": 0}}',
   '{"title": "string", "content": "string", "url": "string", "word_count": "number", "provider": "string"}',
   null, false, 'standard'),
  ('web_crawl', 'Crawl de Website', 'Navega múltiplas páginas de um domínio via Firecrawl (tenant key)', 'integration', 'builtin', true, true,
   '{"url": {"type": "string", "required": true}, "max_pages": {"type": "number", "default": 10}, "max_depth": {"type": "number", "default": 2}, "include_paths": {"type": "array"}, "exclude_paths": {"type": "array"}}',
   '{"crawl_id": "string", "status": "string", "url": "string"}',
   ARRAY['FIRECRAWL_API_KEY'], false, 'standard'),
  ('code_execute', 'Executar Código', 'Executa código em sandbox seguro — E2B (Python/JS, tenant key) ou eval inline (JS simples)', 'integration', 'builtin', true, true,
   '{"code": {"type": "string", "required": true}, "language": {"type": "string", "enum": ["javascript", "python"], "default": "javascript"}, "timeout": {"type": "number", "default": 30}}',
   '{"stdout": "string", "stderr": "string", "exit_code": "number", "provider": "string"}',
   null, false, 'strict'),
  ('browser_automate', 'Automação de Navegador', 'Automatiza ações no navegador via Browserbase ou Browserless (tenant keys)', 'integration', 'builtin', true, true,
   '{"url": {"type": "string", "required": true}, "actions": {"type": "array", "items": {"type": "string", "selector": "string", "value": "string"}}, "wait_for": {"type": "number", "default": 0}}',
   '{"session_id": "string", "content": "string", "provider": "string"}',
   null, false, 'strict')
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  input_schema = EXCLUDED.input_schema,
  output_schema = EXCLUDED.output_schema,
  required_secrets = EXCLUDED.required_secrets,
  sandbox_level = EXCLUDED.sandbox_level,
  is_active = true,
  updated_at = now();

-- from vibrant/20260315130130_09d72d7e-2686-4220-b835-608feeafae25.sql

-- P35: Revenue Tools registration in tool_registry
INSERT INTO public.tool_registry (name, display_name, description, category, executor_type, is_builtin, is_active, input_schema, output_schema, sandbox_level)
VALUES
  ('recommend_items', 'Motor de Recomendação', 'Recomendação de itens por content-based, collaborative filtering ou híbrido, com análise LLM', 'revenue', 'builtin', true, true,
   '{"type":"object","properties":{"user_id":{"type":"string","description":"ID do usuário"},"item_type":{"type":"string","default":"product","description":"Tipo: product, content, service"},"context":{"type":"object","description":"Contexto adicional (preferências, filtros)"},"limit":{"type":"integer","default":10,"maximum":50},"strategy":{"type":"string","enum":["content_based","collaborative","hybrid"],"default":"hybrid"}},"required":["user_id"]}'::jsonb,
   '{"type":"object","properties":{"recommendations":{"type":"array"},"total":{"type":"integer"},"strategy":{"type":"string"}}}'::jsonb,
   'none'),

  ('score_lead', 'Lead Scoring', 'Pontuação de leads combinando sinais comportamentais e análise qualitativa LLM', 'revenue', 'builtin', true, true,
   '{"type":"object","properties":{"lead":{"type":"object","properties":{"name":{"type":"string"},"email":{"type":"string"},"phone":{"type":"string"},"company":{"type":"string"}},"description":"Dados do lead"},"signals":{"type":"object","description":"Sinais comportamentais (page_views, email_opens, demo_requests, etc.)"},"model":{"type":"string","enum":["default","aggressive","conservative"],"default":"default"}},"required":["lead"]}'::jsonb,
   '{"type":"object","properties":{"scores":{"type":"object"},"grade":{"type":"string"},"segment":{"type":"string"},"recommended_action":{"type":"string"}}}'::jsonb,
   'none'),

  ('recover_cart', 'Recuperação de Carrinho', 'Gera mensagens personalizadas de recuperação de carrinho abandonado para email, WhatsApp ou SMS', 'revenue', 'builtin', true, true,
   '{"type":"object","properties":{"cart":{"type":"object","properties":{"items":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string"},"price":{"type":"number"},"quantity":{"type":"integer"}}}},"abandoned_at":{"type":"string"},"age_hours":{"type":"number"}},"required":["items"]},"customer":{"type":"object","properties":{"name":{"type":"string"},"email":{"type":"string"}}},"channel":{"type":"string","enum":["email","whatsapp","sms"],"default":"email"},"strategy":{"type":"string","enum":["standard","urgent","discount","social_proof"],"default":"standard"},"discount_percent":{"type":"number","default":0},"language":{"type":"string","default":"pt-BR"}},"required":["cart"]}'::jsonb,
   '{"type":"object","properties":{"recovery_message":{"type":"object"},"estimated_recovery_rate":{"type":"number"},"cart_value":{"type":"number"}}}'::jsonb,
   'none'),

  ('churn_predict', 'Preditor de Churn', 'Predição de risco de churn com análise de engajamento, fatores de risco e intervenções recomendadas', 'revenue', 'builtin', true, true,
   '{"type":"object","properties":{"customer":{"type":"object","properties":{"name":{"type":"string"},"id":{"type":"string"},"plan":{"type":"string"},"since":{"type":"string"}}},"activity":{"type":"object","description":"Métricas de engajamento (logins, feature_usage, support_tickets, etc.)"},"contract":{"type":"object","description":"Dados de contrato/assinatura"}},"required":["customer"]}'::jsonb,
   '{"type":"object","properties":{"churn_risk_score":{"type":"integer"},"risk_level":{"type":"string"},"health_score":{"type":"integer"},"recommended_interventions":{"type":"array"}}}'::jsonb,
   'none'),

  ('dynamic_pricing', 'Pricing Dinâmico', 'Análise de precificação dinâmica com recomendação de preço ótimo, elasticidade e tiers', 'revenue', 'builtin', true, true,
   '{"type":"object","properties":{"product":{"type":"object","properties":{"name":{"type":"string"},"current_price":{"type":"number"},"cost":{"type":"number"},"category":{"type":"string"}}},"market":{"type":"object","description":"Dados de mercado (competitors, demand, seasonality)"},"constraints":{"type":"object","description":"Restrições (min_price, max_price, min_margin)"},"objective":{"type":"string","enum":["maximize_revenue","maximize_volume","competitive_match"],"default":"maximize_revenue"}},"required":["product"]}'::jsonb,
   '{"type":"object","properties":{"recommended_price":{"type":"number"},"price_range":{"type":"object"},"confidence":{"type":"number"},"pricing_tiers":{"type":"array"}}}'::jsonb,
   'none')
ON CONFLICT (name) DO NOTHING;

-- P31 tool_registry INSERT (from 20260315063637, kg tables already ported)
-- Register P31 tools in tool_registry
INSERT INTO public.tool_registry (name, display_name, description, category, executor_type, is_builtin, is_active, input_schema, output_schema, required_secrets, requires_idempotency, sandbox_level)
VALUES
  ('kg_node_create', 'Criar Nó no Grafo', 'Cria um nó no grafo de conhecimento do tenant', 'data', 'builtin', true, true,
   '{"label": {"type": "string", "required": true}, "node_type": {"type": "string", "required": true}, "properties": {"type": "object"}, "graph_id": {"type": "string", "default": "default"}}',
   '{"node_id": "string", "label": "string", "node_type": "string"}',
   null, true, 'none'),
  ('kg_edge_create', 'Criar Aresta no Grafo', 'Cria uma relação entre dois nós no grafo de conhecimento', 'data', 'builtin', true, true,
   '{"source_node_id": {"type": "string", "required": true}, "target_node_id": {"type": "string", "required": true}, "relationship": {"type": "string", "required": true}, "weight": {"type": "number", "default": 1.0}, "properties": {"type": "object"}, "graph_id": {"type": "string", "default": "default"}}',
   '{"edge_id": "string", "relationship": "string"}',
   null, true, 'none'),
  ('kg_query', 'Consultar Grafo', 'Consulta o grafo de conhecimento — vizinhos, caminho mais curto, subgrafo por tipo', 'data', 'builtin', true, true,
   '{"query_type": {"type": "string", "enum": ["neighbors", "shortest_path", "subgraph", "search"], "required": true}, "node_id": {"type": "string"}, "target_node_id": {"type": "string"}, "node_type": {"type": "string"}, "relationship": {"type": "string"}, "direction": {"type": "string", "enum": ["both", "incoming", "outgoing"], "default": "both"}, "max_depth": {"type": "number", "default": 2}, "graph_id": {"type": "string", "default": "default"}, "search_text": {"type": "string"}}',
   '{"nodes": "array", "edges": "array", "path": "array"}',
   null, false, 'none'),
  ('kg_visualize', 'Exportar Grafo para Visualização', 'Exporta subgrafo em formato compatível com visualizadores (vis.js, D3, Cytoscape)', 'data', 'builtin', true, true,
   '{"graph_id": {"type": "string", "default": "default"}, "format": {"type": "string", "enum": ["visjs", "d3", "cytoscape"], "default": "visjs"}, "center_node_id": {"type": "string"}, "max_nodes": {"type": "number", "default": 50}}',
   '{"nodes": "array", "edges": "array", "format": "string", "stats": "object"}',
   null, false, 'none')
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  input_schema = EXCLUDED.input_schema,
  output_schema = EXCLUDED.output_schema,
  is_active = true,
  updated_at = now();

-- model_id UPDATEs (vibrant 20260315134424, presentation_generate -> slide_generate)

-- R4: Fix P35 tools — add model_id to input_schema and mark that these tools require an LLM key via tenant
-- Also fix P26 tools (sentiment_analyze, text_classify, nl_to_sql) and slide_generate

-- P35: recommend_items
UPDATE public.tool_registry
SET input_schema = jsonb_set(
  input_schema,
  '{properties,model_id}',
  '{"type":"string","description":"LLM model ID (e.g. groq/llama-3.1-8b-instant). Required for AI analysis."}'::jsonb
),
required_secrets = NULL
WHERE name = 'recommend_items';

UPDATE public.tool_registry
SET input_schema = jsonb_set(input_schema, '{required}', '["user_id","model_id"]'::jsonb)
WHERE name = 'recommend_items';

-- P35: score_lead
UPDATE public.tool_registry
SET input_schema = jsonb_set(
  input_schema,
  '{properties,model_id}',
  '{"type":"string","description":"LLM model ID. Required for qualitative analysis."}'::jsonb
),
required_secrets = NULL
WHERE name = 'score_lead';

UPDATE public.tool_registry
SET input_schema = jsonb_set(input_schema, '{required}', '["lead","model_id"]'::jsonb)
WHERE name = 'score_lead';

-- P35: recover_cart
UPDATE public.tool_registry
SET input_schema = jsonb_set(
  input_schema,
  '{properties,model_id}',
  '{"type":"string","description":"LLM model ID. Required for message generation."}'::jsonb
),
required_secrets = NULL
WHERE name = 'recover_cart';

UPDATE public.tool_registry
SET input_schema = jsonb_set(input_schema, '{required}', '["cart","model_id"]'::jsonb)
WHERE name = 'recover_cart';

-- P35: churn_predict
UPDATE public.tool_registry
SET input_schema = jsonb_set(
  input_schema,
  '{properties,model_id}',
  '{"type":"string","description":"LLM model ID. Required for churn analysis."}'::jsonb
),
required_secrets = NULL
WHERE name = 'churn_predict';

UPDATE public.tool_registry
SET input_schema = jsonb_set(input_schema, '{required}', '["customer","model_id"]'::jsonb)
WHERE name = 'churn_predict';

-- P35: dynamic_pricing
UPDATE public.tool_registry
SET input_schema = jsonb_set(
  input_schema,
  '{properties,model_id}',
  '{"type":"string","description":"LLM model ID. Required for pricing analysis."}'::jsonb
),
required_secrets = NULL
WHERE name = 'dynamic_pricing';

UPDATE public.tool_registry
SET input_schema = jsonb_set(input_schema, '{required}', '["product","model_id"]'::jsonb)
WHERE name = 'dynamic_pricing';

-- P26: sentiment_analyze — add model_id requirement
UPDATE public.tool_registry
SET input_schema = jsonb_set(
  COALESCE(input_schema, '{}'::jsonb),
  '{properties,model_id}',
  '{"type":"string","description":"LLM model ID. Required."}'::jsonb
)
WHERE name = 'sentiment_analyze';

-- P26: text_classify — add model_id requirement
UPDATE public.tool_registry
SET input_schema = jsonb_set(
  COALESCE(input_schema, '{}'::jsonb),
  '{properties,model_id}',
  '{"type":"string","description":"LLM model ID. Required."}'::jsonb
)
WHERE name = 'text_classify';

-- P26: nl_to_sql — add model_id requirement
UPDATE public.tool_registry
SET input_schema = jsonb_set(
  COALESCE(input_schema, '{}'::jsonb),
  '{properties,model_id}',
  '{"type":"string","description":"LLM model ID. Required."}'::jsonb
)
WHERE name = 'nl_to_sql';

-- P29: slide_generate — add model_id requirement
UPDATE public.tool_registry
SET input_schema = jsonb_set(
  COALESCE(input_schema, '{}'::jsonb),
  '{properties,model_id}',
  '{"type":"string","description":"LLM model ID. Required."}'::jsonb
)
WHERE name = 'slide_generate';

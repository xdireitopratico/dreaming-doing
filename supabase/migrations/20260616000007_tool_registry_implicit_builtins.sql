-- T27: Implicit builtins used in agent flows (llm_generate, http_request, etc.)

INSERT INTO public.tool_registry (name, display_name, description, category, executor_type, is_builtin, is_active, input_schema, output_schema, requires_idempotency, sandbox_level)
VALUES
  ('llm_generate', 'Gerar Texto (LLM)', 'Gera texto via LLM router com tenant_id do flow', 'core', 'builtin', true, true,
   '{"prompt":{"type":"string"},"messages":{"type":"array"},"model_id":{"type":"string"},"temperature":{"type":"number"}}',
   '{"response":"string","model":"string","provider":"string","tokens":"number","cost_cents":"number"}',
   false, 'standard'),
  ('http_request', 'HTTP Request', 'Chamada HTTP genérica com injeção de secrets', 'integration', 'builtin', true, true,
   '{"url":{"type":"string","required":true},"method":{"type":"string"},"headers":{"type":"object"},"body":{"type":"object"}}',
   '{"status":"number","headers":"object","body":"object"}',
   true, 'standard'),
  ('condition_eval', 'Avaliar Condição', 'Avalia expressão booleana sobre variáveis', 'logic', 'builtin', true, true,
   '{"expression":{"type":"string","required":true},"variables":{"type":"object"}}',
   '{"expression":"string","result":"boolean","branch":"string"}',
   false, 'none'),
  ('web_research', 'Pesquisa Web', 'Pesquisa web agnóstica (Serper/Tavily/Brave/Firecrawl/DuckDuckGo)', 'integration', 'builtin', true, true,
   '{"query":{"type":"string","required":true},"limit":{"type":"number"},"provider":{"type":"string"}}',
   '{"query":"string","results":"array","provider":"string","count":"number"}',
   false, 'standard'),
  ('rag_search', 'Busca RAG (tool)', 'Busca vetorial via search_rag_chunks RPC', 'data', 'builtin', true, true,
   '{"query":{"type":"string","required":true},"top_k":{"type":"number"},"match_threshold":{"type":"number"}}',
   '{"chunks":"array","query":"string","top_k":"number","source":"string"}',
   false, 'standard')
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  is_builtin = true,
  is_active = true,
  updated_at = now();
# Prompt LLM para Diagnóstico com debug-log.sh

Cole este prompt no início de qualquer conversa com LLM para diagnóstico de erro:

---

```
## Contexto
Estamos debugando um erro em produção no projeto dreaming-doing.
Stack: Next.js (App Router) + Supabase + Vercel + Inngest.

## Logs de debug
Por favor, execute imediatamente:

```bash
./scripts/debug-log.sh --hours 6 --errors-only
```

Analise a saída e identifique a causa raiz antes de sugerir qualquer alteração de código.

Se alguma fonte retornou erro, comece por ela.

## Regras
1. NUNCA sugira código antes de ver os logs
2. Se os logs estiverem limpos, investigue outras causas (cache, DNS, 
   configuração)
3. Prefira logs estruturados (JSON) para análise programática
```

# Regras para LLM neste projeto

## ⚠️ REGRA OBRIGATÓRIA: Nunca programe no escuro

**Sempre que o usuário reportar um erro, antes de sugerir ou alterar QUALQUER código, você DEVE executar:**

```bash
./scripts/debug-log.sh --hours 6 --errors-only
```

Este script coleta logs de **Supabase** (function_logs, edge_logs, postgres), **Vercel** (deploy events, build logs) e **Inngest** (runs, falhas) em formato formatado.

### Fluxo obrigatório
1. Usuário reporta erro → execute `./scripts/debug-log.sh` imediatamente
2. Analise a saída (`## SUPABASE`, `## VERCEL`, `## INNGEST`)
3. Se alguma fonte tem erro, investigue aquela primeiro
4. **Nunca** altere código antes de ver os logs

### Exceções
- Se o erro for claramente de frontend (console do browser), não precisa rodar
- Se o script não existir, peça pro usuário configurar (ver `.env.debug.example`)

### Flags úteis
| Flag | Descrição |
|------|-----------|
| `--hours 2` | Janela de 2 horas |
| `--errors-only` | Apenas erros |
| `--supabase` | Apenas Supabase |
| `--vercel` | Apenas Vercel |
| `--inngest` | Apenas Inngest |
| `--json` | Saída JSON |

### Configuração (já feita, não precisa repetir)
O arquivo `.env.debug` já está preenchido com os tokens necessários para acessar as APIs.

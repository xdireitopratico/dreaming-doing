# FORGE Chat — Expectativa do Produto

## O que é o chat do FORGE

O chat é a interface principal onde o usuário descreve o que quer construir e o agente gera código. É um assistente de programação visual — o usuário fala em linguagem natural, o agente cria o app.

---

## Experiência esperada

### 1. Enviar mensagem

O usuário digita no composer e aperta Enter. A mensagem aparece imediatamente no chat. O agente começa a trabalhar. Um indicador "Thinking... Xs" aparece enquanto o agente processa. O streaming de texto começa a aparecer em tempo real — o usuário vê o agente "digitando" a resposta.

### 2. Resposta do agente

A resposta aparece como markdown renderizado. Pode conter:
- Texto explicativo
- Cards de status do job (o que o agente tá fazendo)
- Escolhas interativas (qualify) — o agente pergunta, o usuário clica
- Planos de execução — o agente propõe um plano, o usuário aprova ou rejeita
- Indicadores de fase (Thinking, Working, Done)

### 3. Múltiplas mensagens

O usuário pode enviar várias mensagens seguidas. Cada mensagem gera uma resposta. A ordem cronológica é sempre mantida. Mensagens nunca somem, nunca duplicam, nunca reordenam.

### 4. Planos

Quando o agente precisa de aprovação antes de executar:
- Um card "Plano pronto para revisão" aparece com resumo, missão, objetivos, fases
- O usuário clica "Ver plano no preview" pra ver detalhes
- O usuário aprova ou rejeita
- Ao aprovar, o card Some e o agente começa a executar
- Ao rejeitar, o agente pergunta o que mudar

### 5. Qualify

Quando o agente precisa de mais informação:
- Uma pergunta com opções clicáveis aparece
- O usuário clica na opção desejada
- A resposta é enviada como mensagem
- O agente continua

### 6. Erros

Quando algo dá errado:
- Um card de erro aparece com mensagem clara
- Hints contextuais explicam o que aconteceu (timeout, erro de API, sandbox, etc)
- Botões de ação: "Continuar execução", "Ver detalhes no inspector"
- O usuário pode retomar de onde parou

### 7. Rollback

O usuário pode voltar o chat ao estado anterior:
- Botão de rollback em cada mensagem
- Confirmação antes de executar
- Tela bloqueada durante o rollback
- Mensagens posteriores são removidas

### 8. Copiar

Cada mensagem tem botão de copiar. Clicou, copiou, mensagem "Copiado!" por 2 segundos.

### 9. Scroll

- Auto-scroll pra baixo quando novas mensagens chegam
- Se o usuário scrollou pra cima, pill "Novas mensagens" aparece
- Clicou no pill, volta pro final

### 10. Composer

- Textarea com placeholder dinâmico
- Draft salvo automaticamente (restaura após F5)
- Enter envia, Shift+Enter quebra linha
- Botão de enviar/parar
- Modo Plan/Build
- Anexar arquivos
- Gravação de voz (mic)

---

## O que NÃO pode acontecer

| Bug | Descrição |
|-----|-----------|
| Mensagem duplicada | A mesma mensagem aparece duas vezes |
| Mensagem some | Uma mensagem desaparece do chat |
| Ordem quebra | Mensagens aparecem fora de ordem |
| Flash branco | O chat inteiro Some e volta |
| Streaming some | O texto que o agente tá digitando Some |
| Plano preso | O prompt de plano continua depois de aprovar |
| State mismatch | O UI mostra um estado diferente do backend |

---

## Métricas de sucesso

| Métrica | Target |
|---------|--------|
| Mensagens duplicadas | 0 |
| Flashs visuais | 0 |
| Tempo de primeiro chunk | < 2s |
| Scroll jump | 0 |
| Rollback sucesso | 100% |
| F5 recovery | 100% |
| Testes passando | 100% |

---

## Referência visual

O layout segue o padrão Lovable:

```
┌─────────────────────────────────────────────────┐
│  FORGE Editor                                    │
├──────────────────┬──────────────────────────────┤
│                  │                              │
│   Chat Panel     │     Code / Preview           │
│                  │                              │
│  ┌────────────┐  │  ┌────────────────────────┐  │
│  │ msg user   │  │  │                        │  │
│  └────────────┘  │  │   Editor / Preview     │  │
│  ┌────────────┐  │  │                        │  │
│  │ thinking   │  │  │                        │  │
│  │ streaming  │  │  │                        │  │
│  │ job card   │  │  │                        │  │
│  │ qualify    │  │  │                        │  │
│  └────────────┘  │  │                        │  │
│  ┌────────────┐  │  │                        │  │
│  │ msg user   │  │  │                        │  │
│  └────────────┘  │  └────────────────────────┘  │
│                  │                              │
│  ┌────────────┐  │                              │
│  │ Composer   │  │                              │
│  └────────────┘  │                              │
├──────────────────┴──────────────────────────────┤
```

---

## Resumo

O chat do FORGE deve ser:
- **Confiável** — mensagens nunca somem, nunca duplicam, nunca reordenam
- **Responsivo** — streaming em tempo real, sem flash, sem delay
- **Intuitivo** — o usuário sabe o que fazer sem explicação
- **Bonito** — design consistente com a identidade visual do FORGE
- **Robusto** — erros são tratados, rollback funciona, F5恢复

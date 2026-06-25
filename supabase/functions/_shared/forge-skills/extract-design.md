---
name: extract-design
description: Extrai DesignDNA de sites de referência (HTML, motion, tipografia, cor, componentes) via extract_design_dna, lê o resultado extraído e aplica criativamente no design do projeto — seguindo a lógica de craft do FORGE. Use quando o usuário trouxer referências visuais ou quando o projeto merecer referências reais antes de compor.
metadata:
  author: forge
  version: "1.0.0"
---

# FORGE Extract Design — Extrair, ver, aplicar

Referências reais elevam o design do genérico ao extraordinário. Esta skill orquestra o ciclo: **extrair** DesignDNA de URLs → **ver** o que foi extraído → **aplicar** criativamente no projeto, seguindo a lógica de craft (skill `design-system`).

## Comunicação e paralelismo (sem zona morta de interação)

`extract_design_dna` é **assíncrono** — enfileira o job e ** retorna na hora** (com jobId + hint). Você **NÃO fica bloqueado** esperando. Portanto:

1. **Avise o usuário imediatamente** (1 frase, antes de qualquer outra tool): "Comecei a extração de DesignDNA em background — pode levar ~30-60s (shallow) ou 1-4 min (deep). Quer seguir no brainstorm/plano enquanto roda, ou prefere aguardar?"
2. **Prossiga com trabalho útil** (a menos que o usuário queira só aguardar): chame `design_resolve` com o catálogo, estruture as seções, pesquise mais referências, esboce o gesto memorável. Mantenha o turno vivo.
3. **Quando o job concluir**, chame `read_design_library({ source_url })` para cada URL, **leia o design_dna** e aplique (seção 3 acima). Se ainda não tiver pronto, continue outra coisa e volte em seguida.

Estimativas: **shallow** ≈ 30-60s (scrape + extração por LLM). **deep** ≈ 1-4 min (Playwright no sandbox, captura motion/hover/CSS computado). O usuário pode continuar conversando normalmente durante a extração.

## Quando usar

- O usuário trouxer 1-5 URLs de sites que admira ("quero algo nesse estilo").
- O projeto merecer referências antes de compor (quase sempre, para craft alto).
- Você precisa de DNA concreto em vez de inventar do zero.

## O ciclo (3 tempos)

### 1. Extrair
Chame `extract_design_dna` com 1-5 URLs (fornecidas pelo usuário ou achadas via `web_research`).
- `depth: "shallow"` no Plan (rápido, grátis); `depth: "deep"` no Build (Playwright no sandbox — motion, hover, CSS computado) quando a referência merecer profundidade.
- A tool enfileira um job assíncrono e salva o resultado em `design_system_library` (salvamento automático).

### 2. Ver o que foi extraído
O resultado do extract é DesignDNA estruturado: **layout, color, typography, motion, interaction, component, implementation_notes**. Leia com atenção — estes são os traços da referência, não um template a copiar. Identifique:
- O **gesto** que faz a referência ser memorável.
- As **técnicas** que sustentam esse gesto.
- A **personalidade** (paleta, tipografia, ritmo) que a distingue.

### 3. Aplicar criativamente (não colar)
Use o DNA extraído como **restrição criativa**, não como molde:
- Alimente o `design_resolve` / campo `design` do `create_plan` com os `extracted_dna` ids relevantes e as `references` (url + DNA).
- **Adapte ao domínio do projeto**, não copie a referência. Uma padaria não vira um SaaS só porque a referência é SaaS — extraia a INTENÇÃO (o gesto, o contraste), traduza pro domínio.
- Combine com a skill `design-system` (composto criacional): o DNA informa a paleta (vozes × mood × técnicas), e o gesto memorável vem da interpretação, não da imitação.

## Princípios de aplicação

- **Extraia a essência, não o pixel.** O que faz a referência funcionar emocionalmente?
- **Misture, não clone.** DNA de 2-3 referências combinado > cópia de 1.
- **Justifique.** Cada traço do DNA que você adotar precisa servir ao conceito do projeto.
- **Descarte o que não serve.** Referência é ponto de partida, não prisão.

## Limites

- `extract_design_dna` custa créditos da plataforma (uso de LLM na extração) — use em referências que valem o custo, não em qualquer URL.
- Em Plan mode, máximo 2 chamadas (shallow). Deep só no Build.
- Não invente DNA — se a extração falhar/bloquear, diga ao usuário e siga com o catálogo interno.

---

**Objetivo:** referências viram DNA, DNA vira paleta, paleta vira uma peça única que ninguém — nem o site original — produziria igual. Extrair para transcendir, não para copiar.
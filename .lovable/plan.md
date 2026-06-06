## Objetivo
Corrigir 8 problemas de UX/visual no editor (`/projects/$projectId`) usando o Lovable como referência visual, sem mexer em lógica de negócio.

## Problemas e correções

### 1. Header — Preview/Code "ancorados" ao painel de preview
Hoje o `EditorWorkspaceHeader` ocupa toda a faixa do workspace e os ícones Preview/Code ficam colados no lado esquerdo do header (logo após o resize handle). No Lovable, esses ícones ficam **alinhados à borda esquerda do painel de preview** e permanecem ali ao arrastar o divisor.

- Mover o cluster `[Preview | Code] + divisor + Conectores` para começar exatamente na borda esquerda do workspace panel (já é o caso) **e travar a posição via grid do `EditorResizableLayout`** para que não "dance" com o resize.
- Garantir que o cluster fique colado na borda do preview frame, com o mesmo padding interno do conteúdo do preview.

### 2. Dropdown de Conectores com fundo branco
No print, o menu de integrações abre branco com texto cinza claro — deveria seguir o tema do header (fundo preto/grafite, texto branco).

- Ajustar `EditorIntegrationsMenu` (e/ou o `ForgeEditorDropdownContent` usado por ele) para usar tokens `--surface-panel` / `--text-strong` em vez de cores padrão do `dropdown-menu` shadcn.
- Itens com hover sutil em `--surface-hover`, separadores em `--border-subtle`.

### 3. Barra de navegação do preview centralizada
A `PreviewRouteNav` (variante `chrome`) hoje fica encostada à esquerda do header. No Lovable, a barra de URL fica **centralizada com o painel de preview** e acompanha o resize.

- Reestruturar `EditorWorkspaceHeader` / chrome para colocar a `PreviewRouteNav` em uma faixa central com `justify-self: center` e `max-width` proporcional ao preview.
- Quando o painel é estreito, encurtar a barra (mas mantê-la centralizada).

### 4. Device toggle (desktop/tablet/mobile) + Refresh no header do preview
O `PreviewViewportChrome` já existe mas não está sendo usado no header consolidado. Faltam os 3 botões de viewport e o botão de hard refresh.

- Integrar `PreviewViewportChrome` (device toggle + refresh) ao `EditorWorkspaceHeader`, à direita da `PreviewRouteNav` centralizada.
- O refresh deve disparar um hard reload do `PreviewFrame` (bump de `key` + `?t=` no src).
- Estado do device persistido em `localStorage` (`forge-preview-device`).

### 5. Dropdown Build/Plan — tema escuro + estado selecionado
O `ComposerModeSelect` abre com fundo transparente/branco e não marca a opção ativa.

- Aplicar o mesmo tratamento do item 2: fundo `--surface-panel`, borda `--border-subtle`, texto `--text-strong`.
- Renderizar check (`Check` do lucide) ao lado da opção atualmente selecionada (`Build` ou `Plan`) e destacar via `data-state=checked`.

### 6. Estado vazio do preview — onboarding útil
Quando o preview está em branco/erro, hoje só aparece "Preview has not been built yet" ou "Expected to resolve main module".

Redesenhar `PreviewEmptyGuide` (e o estado de erro do `PreviewFrame`) com:
- Mensagem clara do estado (sem sandbox / em build / erro).
- **Campo de input** "Cole o link do seu repositório GitHub" → dispara `github-import` e, se Vercel estiver conectado, encaminha para deploy.
- CTA secundário "Ou descreva sua ideia no chat" focando o composer.
- Visual centralizado, com o logo Forge e os passos mínimos.

### 7. SetupRail — expandir em tela cheia do chat e reorganizar
O `SetupRail` hoje aparece como um "tijolo" no meio do chat, misturando trilha de taste + configuração + status. Quando expandido deve **ocupar todo o chat panel** (sobrepor a thread) e ser visualmente organizado.

- Quando `expanded`, renderizar como overlay do `forge-chat-panel` (position absolute, full height) com botão de fechar.
- Reorganizar em **3 seções colapsáveis** com hierarquia clara:
  1. **Trilha** (passos do taste — checklist linear)
  2. **Modelo & API** (provider ativo, BYOK status, link para `/models`)
  3. **Integrações** (Sandbox E2B, GitHub, Vercel, MCP, Skills — com badges de status)
- Tipografia consistente, espaçamento de 16px entre blocos, sem mistura de fontes mono/sans no mesmo nível.

### 8. Colapsar o chat (full preview)
Hoje o `EditorResizableLayout` limita o chat a `MIN_CHAT_PX = 280` e não permite colapsar.

- Adicionar botão de colapso no header do chat (`EditorChatHeader`) — ícone `PanelLeftClose`/`PanelLeftOpen`.
- Estado `chatCollapsed` no `EditorResizableLayout`: quando true, ratio = 0, handle vira um botão fino no canto esquerdo do workspace que reexpande para o último ratio salvo.
- Persistir em `localStorage` (`forge-editor-chat-collapsed`).

## Arquivos afetados (apenas frontend/CSS)
- `src/components/editor/EditorResizableLayout.tsx` — colapso do chat + ancoragem do header
- `src/components/editor/EditorWorkspaceHeader.tsx` — reorganização (esquerda: Preview/Code+Conectores, centro: URL nav, direita: device+refresh+share/publish)
- `src/components/editor/EditorChatHeader.tsx` — botão colapsar
- `src/components/editor/EditorIntegrationsMenu.tsx` — tema do dropdown
- `src/components/editor/ComposerModeSelect.tsx` — tema + selected state
- `src/components/editor/ForgeEditorDropdown.tsx` — base de tokens dark
- `src/components/editor/PreviewViewportChrome.tsx` — reuso no header
- `src/components/editor/PreviewFrame.tsx` — hook de hard refresh + device width
- `src/components/editor/PreviewEmptyGuide.tsx` — redesign + input repo
- `src/components/editor/SetupRail.tsx` — overlay full-chat + 3 seções
- `src/routes/projects/$projectId/index.tsx` — fiação dos novos props
- `src/styles/editor-workspace.css` — grid do header, overlay do setup, tokens do dropdown

## Fora de escopo
- Lógica de deploy/import do GitHub além de chamar handlers existentes (`github-import`, `deploy-publish`).
- Mudanças no agente, edge functions, schema ou migrations.
- Refatorar a thread de mensagens.

## Verificação
Após implementar: abrir `/projects/$projectId`, validar via browser tools em 916px e 1440px que (a) os ícones Preview/Code ficam ancorados à borda do preview ao arrastar o divisor, (b) dropdowns abrem escuros com selected state, (c) device toggle + refresh funcionam, (d) chat colapsa/expande, (e) SetupRail expande full-chat organizado, (f) estado vazio mostra input de repo.
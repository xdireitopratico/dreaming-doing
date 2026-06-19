# Remove log panel auto-open when agent starts

## Problem
Every time `runAgent()` or `handleResumeAgent()` is called, the log panel (terminal at bottom of editor) force-opens via `setLogPanelOpen(true)`. This takes up half the screen and hides the chat.

## Fix

**File**: `src/routes/projects/$projectId/useEditorPageHandlers.ts`

### Change 1 — line 261
Remove `if (!logPanelOpen) setLogPanelOpen(true);` from `runAgent`:

```typescript
// Before:
      setLogs((prev) => [...prev, createLogEntry("info", label, "agent")]);
      if (!logPanelOpen) setLogPanelOpen(true);
      void qc.invalidateQueries({ queryKey: ["messages", conversation.id] });

// After:
      setLogs((prev) => [...prev, createLogEntry("info", label, "agent")]);
      void qc.invalidateQueries({ queryKey: ["messages", conversation.id] });
```

### Change 2 — line 340
Remove `if (!logPanelOpen) setLogPanelOpen(true);` from `handleResumeAgent`:

```typescript
// Before:
    setLogs((prev) => [
      ...prev,
      createLogEntry("info", "Continuando execução anterior", "agent"),
    ]);
    if (!logPanelOpen) setLogPanelOpen(true);
    void qc.invalidateQueries({ queryKey: ["messages", conversation.id] });

// After:
    setLogs((prev) => [
      ...prev,
      createLogEntry("info", "Continuando execução anterior", "agent"),
    ]);
    void qc.invalidateQueries({ queryKey: ["messages", conversation.id] });
```

Logs still record normally. Panel only opens when user presses `Cmd/Ctrl+J` or uses command palette "Toggle Terminal".

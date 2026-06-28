import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildThreadScrollSignature,
  CHAT_SCROLL_ANCHOR_DRIFT_PX,
  CHAT_SCROLL_MAX_STEP_PX,
  CHAT_SCROLL_PIN_THRESHOLD_PX,
  type ChatFollowMode,
  computeSmoothScrollStep,
  isNearBottom,
  resolveScrollTarget,
  shouldShowNewMessagesPill,
} from "@/lib/chat/chat-scroll-engine";
import {
  shouldAnchorNewUserMessage,
  scrollOffsetToAlignUserMessage,
} from "@/lib/chat/user-message-anchor";
import type { ThreadItem } from "@/lib/chat/types";

export type UseChatScrollOptions = {
  conversationId: string | null | undefined;
  chatLoading: boolean;
  thread: ThreadItem[];
  lastUserMessageId: string | null;
  holdUserAnchor: boolean;
};

export function useChatScroll({
  conversationId,
  chatLoading,
  thread,
  lastUserMessageId,
  holdUserAnchor,
}: UseChatScrollOptions) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const followModeRef = useRef<ChatFollowMode>("follow-bottom");
  const anchoredUserIdRef = useRef<string | null>(null);
  const initialScrollDoneRef = useRef(false);
  const previousUserMessageIdRef = useRef<string | null>(null);
  const userJustSentRef = useRef(false);
  const programmaticRef = useRef(false);
  const rafRef = useRef(0);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const signatureAtManualRef = useRef<string | null>(null);
  const threadSignature = buildThreadScrollSignature(thread);
  const [showPill, setShowPill] = useState(false);

  const applyScrollTop = useCallback((top: number) => {
    const el = scrollRef.current;
    if (!el) return;
    programmaticRef.current = true;
    el.scrollTop = top;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        programmaticRef.current = false;
      });
    });
  }, []);

  const snapToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = el.scrollHeight - el.clientHeight;
    applyScrollTop(Math.max(0, target));
  }, [applyScrollTop]);

  const snapUserBubbleToTop = useCallback((messageId: string): boolean => {
    const container = scrollRef.current;
    if (!container) return false;
    const bubble = container.querySelector<HTMLElement>(`[data-user-msg-id="${messageId}"]`);
    if (!bubble) return false;
    applyScrollTop(scrollOffsetToAlignUserMessage(container, bubble));
    anchoredUserIdRef.current = messageId;
    followModeRef.current = "follow-anchor";
    return true;
  }, [applyScrollTop]);

  const cancelAutoFollow = useCallback(() => {
    if (followModeRef.current === "manual") return;
    followModeRef.current = "manual";
    signatureAtManualRef.current = threadSignature;
    setShowPill(false);
  }, [threadSignature]);

  const notifyUserSend = useCallback(() => {
    userJustSentRef.current = true;
    followModeRef.current = "follow-anchor";
    signatureAtManualRef.current = null;
    setShowPill(false);
  }, []);

  const followToBottom = useCallback(() => {
    followModeRef.current = "follow-bottom";
    anchoredUserIdRef.current = null;
    signatureAtManualRef.current = null;
    setShowPill(false);
  }, []);

  const tick = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const mode = followModeRef.current;
    if (mode === "manual") {
      const show = shouldShowNewMessagesPill({
        mode,
        signature: threadSignature,
        signatureAtManual: signatureAtManualRef.current,
        bottomGapPx: el.scrollHeight - el.scrollTop - el.clientHeight,
        thresholdPx: 500,
      });
      setShowPill((prev) => (prev === show ? prev : show));
      return;
    }

    const target = resolveScrollTarget({
      mode,
      container: el,
      anchoredUserId: anchoredUserIdRef.current,
    });
    if (target == null) return;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = prefersReducedMotion
      ? target
      : computeSmoothScrollStep(el.scrollTop, target, CHAT_SCROLL_MAX_STEP_PX);

    if (Math.abs(next - el.scrollTop) > 0.5) {
      applyScrollTop(next);
    }
  }, [applyScrollTop, threadSignature, thread.length]);

  const handleScroll = useCallback(() => {
    if (programmaticRef.current) return;
    const el = scrollRef.current;
    if (!el) return;

    const mode = followModeRef.current;
    if (mode === "manual") return;

    if (mode === "follow-bottom") {
      if (
        !isNearBottom(
          el.scrollTop,
          el.scrollHeight,
          el.clientHeight,
          CHAT_SCROLL_PIN_THRESHOLD_PX,
        )
      ) {
        cancelAutoFollow();
      }
      return;
    }

    if (mode === "follow-anchor" && anchoredUserIdRef.current) {
      const bubble = el.querySelector<HTMLElement>(
        `[data-user-msg-id="${anchoredUserIdRef.current}"]`,
      );
      if (!bubble) return;
      const anchorTop = scrollOffsetToAlignUserMessage(el, bubble);
      if (Math.abs(el.scrollTop - anchorTop) > CHAT_SCROLL_ANCHOR_DRIFT_PX) {
        cancelAutoFollow();
      }
    }
  }, [cancelAutoFollow]);

  useEffect(() => {
    initialScrollDoneRef.current = false;
    previousUserMessageIdRef.current = null;
    userJustSentRef.current = false;
    anchoredUserIdRef.current = null;
    signatureAtManualRef.current = null;
    followModeRef.current = "follow-bottom";
    setShowPill(false);
  }, [conversationId]);

  useEffect(() => {
    if (chatLoading) return;
    if (initialScrollDoneRef.current) return;
    initialScrollDoneRef.current = true;
    previousUserMessageIdRef.current = lastUserMessageId;
    followModeRef.current = "follow-bottom";
    const raf = requestAnimationFrame(() => snapToBottom());
    return () => cancelAnimationFrame(raf);
  }, [chatLoading, lastUserMessageId, snapToBottom]);

  useEffect(() => {
    const prevUserMessageId = previousUserMessageIdRef.current;
    previousUserMessageIdRef.current = lastUserMessageId;

    if (
      !shouldAnchorNewUserMessage(
        prevUserMessageId,
        lastUserMessageId,
        initialScrollDoneRef.current,
      )
    ) {
      return;
    }

    followModeRef.current = "follow-anchor";
    if (userJustSentRef.current) {
      userJustSentRef.current = false;
      signatureAtManualRef.current = null;
    }

    const id = lastUserMessageId;
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (id) snapUserBubbleToTop(id);
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [lastUserMessageId, snapUserBubbleToTop]);

  useEffect(() => {
    if (holdUserAnchor) return;
    if (followModeRef.current === "manual") return;
    if (followModeRef.current !== "follow-anchor") return;
    followModeRef.current = "follow-bottom";
    anchoredUserIdRef.current = null;
  }, [holdUserAnchor]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onWheel = (event: WheelEvent) => {
      if (event.deltaY !== 0) cancelAutoFollow();
    };
    const onTouchMove = () => cancelAutoFollow();
    const onKeyDown = (event: KeyboardEvent) => {
      const keys = ["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown", " "];
      if (keys.includes(event.key)) cancelAutoFollow();
    };

    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("keydown", onKeyDown);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("keydown", onKeyDown);
    };
  }, [cancelAutoFollow, chatLoading, thread.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const stream = el.querySelector(".forge-chat-stream");
    if (!stream) return;

    resizeObserverRef.current?.disconnect();
    const observer = new ResizeObserver(() => {
      tick();
    });
    observer.observe(stream);
    resizeObserverRef.current = observer;
    return () => observer.disconnect();
  }, [tick, chatLoading, thread.length]);

  useEffect(() => {
    const loop = () => {
      tick();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [tick]);

  useEffect(() => {
    tick();
  }, [threadSignature, holdUserAnchor, tick]);

  return {
    scrollRef,
    handleScroll,
    notifyUserSend,
    showPill,
    followToBottom,
  };
}

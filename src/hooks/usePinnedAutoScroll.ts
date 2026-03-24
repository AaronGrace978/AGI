import { useCallback, useEffect, useRef } from 'react';
import type { DependencyList, MutableRefObject, RefObject } from 'react';

type Options = {
  /**
   * How close to the bottom (in px) we consider "pinned".
   * If the user scrolls up beyond this threshold, auto-scroll stops.
   */
  bottomThresholdPx?: number;
  /**
   * Scroll behavior when auto-scrolling due to incoming content.
   * Default is 'auto' to avoid jitter during streaming updates.
   */
  behavior?: ScrollBehavior;
  /**
   * Disable auto-scroll (still tracks pinned state).
   */
  enabled?: boolean;
};

function isNearBottom(el: HTMLElement, thresholdPx: number): boolean {
  const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  return distanceFromBottom <= thresholdPx;
}

function scrollToBottom(el: HTMLElement, behavior: ScrollBehavior) {
  // Prefer scrollTo when available so we can pass behavior.
  if (typeof (el as any).scrollTo === 'function') {
    (el as any).scrollTo({ top: el.scrollHeight, behavior });
  } else {
    el.scrollTop = el.scrollHeight;
  }
}

/**
 * Auto-scrolls a container to the bottom only while the user is "pinned" there.
 * This avoids fighting manual scroll when content is streaming in.
 */
export function usePinnedAutoScroll<T extends HTMLElement>(
  containerRef: RefObject<T>,
  deps: DependencyList,
  options: Options = {},
): { isPinnedToBottomRef: MutableRefObject<boolean>; scrollToBottomNow: () => void } {
  const { bottomThresholdPx = 48, behavior = 'auto', enabled = true } = options;

  const isPinnedToBottomRef = useRef(true);

  const updatePinnedState = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    isPinnedToBottomRef.current = isNearBottom(el, bottomThresholdPx);
  }, [bottomThresholdPx, containerRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Initialize pinned state based on initial scroll position.
    updatePinnedState();

    const onScroll = () => updatePinnedState();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [containerRef, updatePinnedState]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // When a log is pinned to bottom, incoming content will keep pulling it down.
    // That can feel like "scroll is broken" during active runs. If the user wheels
    // upward even a little, treat it as intent to browse history and unpin.
    const onWheel = (e: WheelEvent) => {
      if (!isPinnedToBottomRef.current) return;
      if (typeof e.deltaY === 'number' && e.deltaY < 0) {
        isPinnedToBottomRef.current = false;
      }
    };

    el.addEventListener('wheel', onWheel, { passive: true });
    return () => el.removeEventListener('wheel', onWheel);
  }, [containerRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!enabled || !el) return;
    if (!isPinnedToBottomRef.current) return;

    // Defer until after DOM paint so scrollHeight is up to date.
    const raf = requestAnimationFrame(() => {
      const latest = containerRef.current;
      if (!latest) return;
      scrollToBottom(latest, behavior);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const scrollToBottomNow = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    scrollToBottom(el, behavior);
  }, [behavior, containerRef]);

  return { isPinnedToBottomRef, scrollToBottomNow };
}

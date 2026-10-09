"use client";

import { createPortal } from "react-dom";
import { CircleCheck, CircleAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type ToastType = "success" | "error";
type ToastMessage = { type: ToastType; message: string };
const ToastContext = createContext<(toast: ToastMessage) => void>(() => {});

/** The single viewport stack, shared by public and admin pages. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const nextId = useRef(0);
  const stackRef = useRef<HTMLDivElement>(null);
  const [dialogTarget, setDialogTarget] = useState<HTMLDialogElement | null>(null);
  useEffect(() => {
    const update = () => {
      const dialogs = Array.from(document.querySelectorAll<HTMLDialogElement>("dialog[open]"));
      setDialogTarget(dialogs.filter((dialog) => dialog.matches(":modal")).at(-1) ?? null);
      const nav = document.querySelector(".site-nav");
      const bottom = Math.max(0, nav?.getBoundingClientRect().bottom ?? 0);
      document.documentElement.style.setProperty("--toast-header-bottom", `${bottom}px`);
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
    const resize = new ResizeObserver(update);
    const nav = document.querySelector(".site-nav");
    if (nav) resize.observe(nav);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { observer.disconnect(); resize.disconnect(); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, []);
  const [messages, setMessages] = useState<Array<ToastMessage & { id: number; expiresAt?: number }>>([]);
  const show = useCallback((toast: ToastMessage) => {
    const id = ++nextId.current;
    setMessages((current) => [...current, { ...toast, id, expiresAt: toast.type === "success" ? Date.now() + 5000 : undefined }]);
  }, []);
  const remove = useCallback((id: number) => setMessages((current) => current.filter((toast) => toast.id !== id)), []);
  useEffect(() => {
    const stack = stackRef.current;
    if (messages.length && stack && !stack.matches(":popover-open")) stack.showPopover();
  }, [messages.length, dialogTarget]);
  const stack = <div ref={stackRef} popover="manual" className="toast-stack" aria-label="Actiemeldingen">
      {messages.map((toast) => <Toast key={toast.id} type={toast.type} message={toast.message} expiresAt={toast.expiresAt} onDismiss={() => remove(toast.id)} />)}
    </div>;
  return <ToastContext.Provider value={show}>{children}{dialogTarget ? createPortal(stack, dialogTarget) : stack}</ToastContext.Provider>;
}

export function useToast() { return useContext(ToastContext); }

/** Consume only this message's query key; native history preserves mounted forms and tabs. */
export function consumeToastFeedback(key: string): boolean {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(key)) return false;
  url.searchParams.delete(key);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  return true;
}

export function FlashToast({ type, message, feedbackKey }: ToastMessage & { feedbackKey?: string }) {
  const show = useToast();
  const lastLocalMessage = useRef<string | null>(null);
  // Check the current URL on every render, including repeated identical action redirects.
  // Once consumed, a local tab change or Strict Mode effect replay cannot show it again.
  useEffect(() => {
    if (feedbackKey) {
      if (!consumeToastFeedback(feedbackKey)) return;
    } else {
      const signature = `${type}:${message}`;
      if (lastLocalMessage.current === signature) return;
      lastLocalMessage.current = signature;
    }
    show({ type, message });
  });
  return null;
}

export function Toast({ type, message, expiresAt, onDismiss }: ToastMessage & { onDismiss: () => void; expiresAt?: number }) {
  const [closing, setClosing] = useState(false);
  const dismiss = useCallback(() => setClosing(true), []);
  useEffect(() => {
    if (type !== "success") return;
    const timer = window.setTimeout(dismiss, expiresAt === undefined ? 5000 : Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [type, dismiss, expiresAt]);
  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(onDismiss, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 160);
    return () => window.clearTimeout(timer);
  }, [closing, onDismiss]);
  const Icon = type === "success" ? CircleCheck : CircleAlert;
  return <div className={`toast toast-${type}${closing ? " toast-closing" : ""}`} role={type === "success" ? "status" : "alert"} aria-atomic="true">
    <Icon className="toast-icon" size={20} aria-hidden />
    <span className="toast-message">{message}</span>
    <button type="button" className="toast-close" aria-label="Melding sluiten" onClick={dismiss}><X size={18} aria-hidden /></button>
  </div>;
}

/** Note actions keep their existing destination and anchor after saving. */
export function ExerciseNoteFeedback() {
  const show = useToast();
  useEffect(() => {
    const value = new URL(window.location.href).searchParams.get("noteFeedback");
    if ((value === "saved" || value === "deleted") && consumeToastFeedback("noteFeedback")) {
      show({ type: "success", message: value === "saved" ? "Oefennotitie opgeslagen." : "Oefennotitie verwijderd." });
    }
  });
  return null;
}

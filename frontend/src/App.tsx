import { Component, useEffect, type ReactNode } from "react";
import { AppLayout } from "@/components/layout/AppLayout";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: string }
> {
  state = { hasError: false, error: "" };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-[var(--surface-0)] text-[var(--text-normal)] gap-4 p-8">
          <div className="text-lg font-medium">界面渲染出错</div>
          <div className="text-sm text-[var(--text-muted)] max-w-md text-center">
            {this.state.error}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: "" })}
            className="px-4 py-2 bg-[var(--state-info)] text-white rounded-md text-sm hover:bg-[var(--state-info)]/80"
          >
            重新加载界面
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  useEffect(() => {
    const applyNoSuggestAttrs = (el: HTMLInputElement | HTMLTextAreaElement) => {
      el.setAttribute("autocomplete", "off");
      el.setAttribute("autocorrect", "off");
      el.setAttribute("autocapitalize", "off");
      el.setAttribute("spellcheck", "false");
      el.setAttribute("data-form-type", "other");
      el.setAttribute("data-lpignore", "true");
    };

    // One-time pass for current DOM.
    document
      .querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")
      .forEach(applyNoSuggestAttrs);

    // Lightweight lazy patch for dynamically created inputs.
    const onFocusIn = (ev: FocusEvent) => {
      const target = ev.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        applyNoSuggestAttrs(target);
      }
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  return (
    <ErrorBoundary>
      <AppLayout />
    </ErrorBoundary>
  );
}

export default App;

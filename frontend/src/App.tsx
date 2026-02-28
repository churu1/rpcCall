import { Component, type ReactNode } from "react";
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
        <div className="flex flex-col items-center justify-center h-screen bg-[var(--color-background)] text-[var(--color-foreground)] gap-4 p-8">
          <div className="text-lg font-medium">界面渲染出错</div>
          <div className="text-sm text-[var(--color-muted-foreground)] max-w-md text-center">
            {this.state.error}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: "" })}
            className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-md text-sm hover:bg-[var(--color-primary)]/80"
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
  return (
    <ErrorBoundary>
      <AppLayout />
    </ErrorBoundary>
  );
}

export default App;

import { useCallback, useMemo } from "react";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-json";

export interface JsonEditorDiagnostic {
  line: number;
  message: string;
}

function highlightJson(code: string): string {
  try {
    return Prism.highlight(code, Prism.languages.json, "json");
  } catch {
    return code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
}

interface JsonEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  diagnostics?: JsonEditorDiagnostic[];
}

export function JsonEditor({ value, onChange, placeholder, readOnly, onKeyDown, diagnostics }: JsonEditorProps) {
  const handleHighlight = useCallback((code: string) => highlightJson(code), []);
  const diagnosticByLine = useMemo(() => {
    const byLine = new Map<number, string>();
    for (const diagnostic of diagnostics || []) {
      if (diagnostic.line > 0 && !byLine.has(diagnostic.line)) {
        byLine.set(diagnostic.line, diagnostic.message);
      }
    }
    return byLine;
  }, [diagnostics]);
  const lineCount = Math.max(1, value.split("\n").length);

  return (
    <div className="json-editor-with-gutter">
      <div className="json-editor-gutter" aria-hidden="true">
        {Array.from({ length: lineCount }, (_, index) => {
          const line = index + 1;
          const message = diagnosticByLine.get(line);
          return (
            <span
              key={line}
              className={`json-editor-gutter-line${message ? " json-editor-gutter-line-error" : ""}`}
              title={message}
            >
              {message ? `× ${line}` : line}
            </span>
          );
        })}
      </div>
      <div className="json-editor-code">
        <Editor
          value={value}
          onValueChange={readOnly ? () => {} : onChange}
          onKeyDown={onKeyDown as never}
          highlight={handleHighlight}
          padding={12}
          tabSize={2}
          insertSpaces={true}
          placeholder={placeholder}
          className="json-editor"
          textareaClassName="json-editor-textarea"
          preClassName="json-editor-pre"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--rpccall-json-font-size)',
            lineHeight: '1.6',
            minHeight: '100%',
          }}
        />
      </div>
    </div>
  );
}

export function highlightJsonHtml(code: string): string {
  return highlightJson(code);
}

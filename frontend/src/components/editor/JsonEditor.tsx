import { useCallback } from "react";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-json";

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
}

export function JsonEditor({ value, onChange, placeholder, readOnly }: JsonEditorProps) {
  const handleHighlight = useCallback((code: string) => highlightJson(code), []);

  return (
    <Editor
      value={value}
      onValueChange={readOnly ? () => {} : onChange}
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
        fontSize: 13,
        lineHeight: '1.6',
        minHeight: '100%',
      }}
    />
  );
}

export function highlightJsonHtml(code: string): string {
  return highlightJson(code);
}

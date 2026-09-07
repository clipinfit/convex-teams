"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

const examples = {
  mount: `// convex/convex.config.ts\nimport { defineApp } from "convex/server";\nimport teams from "@clipin/convex-teams/convex.config.js";\n\nconst app = defineApp();\napp.use(teams);\n\nexport default app;`,
  create: `// Inside an authenticated host mutation\nconst identity = await ctx.auth.getUserIdentity();\nif (!identity) throw new Error("Not authorized.");\n\nconst team = await teams.createTeam(\n  ctx,\n  identity.subject,\n  "Studio workspace",\n);`,
};
export function CodeExample() {
  const [tab, setTab] = useState<keyof typeof examples>("mount");
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(examples[tab]);
      setCopied(true);
      setFailed(false);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
    }
  }
  return (
    <div className="code-example">
      <div className="code-toolbar">
        <fieldset aria-label="Code examples">
          {(["mount", "create"] satisfies (keyof typeof examples)[]).map(
            (key) => (
              <button
                type="button"
                key={key}
                id={`tab-${key}`}
                aria-pressed={tab === key}
                aria-controls="code-panel"
                onClick={() => {
                  setTab(key);
                  setCopied(false);
                  setFailed(false);
                }}
              >
                {key === "mount" ? "01 / Mount" : "02 / Create"}
              </button>
            ),
          )}
        </fieldset>
        <button
          type="button"
          className="copy"
          onClick={copy}
          aria-label="Copy code"
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </div>
      <pre id="code-panel">
        <code>{examples[tab]}</code>
      </pre>
      <div className="code-caption">
        <span>TypeScript · Development API</span>
        <span role="status">
          {failed
            ? "Select the code to copy it."
            : copied
              ? "Copied"
              : "Convex 1.43+"}
        </span>
      </div>
    </div>
  );
}

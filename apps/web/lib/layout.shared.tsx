import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { Users } from "lucide-react";
export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="brand">
          <span className="brand-icon">
            <Users size={18} />
          </span>
          convex-teams
        </span>
      ),
    },
    links: [
      { text: "Documentation", url: "/docs", active: "nested-url" },
      { text: "Release status", url: "/docs/release-status" },
    ],
    githubUrl: "https://github.com/clipinfit/convex-teams",
  };
}

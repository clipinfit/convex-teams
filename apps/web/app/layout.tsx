import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";
import "./global.css";
export const metadata: Metadata = {
  title: {
    default: "convex-teams · Workspaces for Convex",
    template: "%s · convex-teams",
  },
  description:
    "Workspace membership, ownership, and invitations for Convex. Open source under Apache-2.0.",
};
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}

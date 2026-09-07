import {
  ArrowRight,
  ArrowUpRight,
  Check,
  GitBranch,
  Users,
} from "lucide-react";
import Link from "next/link";
import { CodeExample } from "@/components/code-example";

const github = "https://github.com/clipinfit/convex-teams";
export default function Home() {
  return (
    <div className="site">
      <header className="site-header">
        <Link href="/" className="brand">
          <span className="brand-icon">
            <Users size={18} />
          </span>
          convex-teams
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/docs">Docs</Link>
          <Link href="/docs/release-status" className="nav-status">
            Release status
          </Link>
          <a href={github}>
            GitHub <ArrowUpRight size={14} />
          </a>
        </nav>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <Link href="/docs/release-status" className="release-pill">
              <span />
              Building toward the first release <ArrowRight size={13} />
            </Link>
            <p className="eyebrow">OPEN SOURCE / CONVEX COMPONENT</p>
            <h1>
              A place for
              <br />
              every <em>team.</em>
            </h1>
            <p className="hero-description">
              Add shared workspaces to your Convex app. Give each team its
              members, roles, and invitations. Keep your product’s rules in your
              app.
            </p>
            <div className="hero-actions">
              <Link href="/docs" className="button primary">
                Read the docs <ArrowRight size={17} />
              </Link>
              <a href={github} className="button secondary">
                Explore the source <ArrowUpRight size={16} />
              </a>
            </div>
            <p className="availability">
              Development preview. The npm package currently contains a
              name-claim notice only.
            </p>
          </div>
          <div
            className="workspace-illustration"
            role="img"
            aria-label="Example workspace with an owner, admin, member, and pending invitation"
          >
            <div className="preview-label">
              WORKSPACE MODEL <span>ILLUSTRATION</span>
            </div>
            <div className="workspace-card">
              <div className="workspace-title">
                <span className="workspace-avatar">S</span>
                <div>
                  <strong>Studio workspace</strong>
                  <small>One workspace. Shared access.</small>
                </div>
                <span className="live-dot" />
              </div>
              <div className="member-head">
                <span>MEMBERS</span>
                <span>ROLE</span>
              </div>
              {[
                { initials: "AC", name: "Alex Chen", role: "Owner" },
                { initials: "JR", name: "Jamie Rivera", role: "Admin" },
                { initials: "SP", name: "Sam Park", role: "Member" },
              ].map((m) => (
                <div key={m.role} className="member-row">
                  <span className={`avatar ${m.role.toLowerCase()}`}>
                    {m.initials}
                  </span>
                  <span>{m.name}</span>
                  <span className="role">{m.role}</span>
                </div>
              ))}
              <div className="invite-row">
                <span className="invite-symbol">+</span>
                <span>
                  taylor@example.com<small>Invitation pending</small>
                </span>
                <span className="pending">Invited</span>
              </div>
              <div className="workspace-footer">
                <Check size={14} /> Membership checked on every protected
                operation
              </div>
            </div>
            <div className="integration-line">
              <span className="connector" />
              <span>
                Invitations powered by <strong>convex-invite</strong>
              </span>
              <GitBranch size={16} />
            </div>
          </div>
        </section>
        <div className="principles-strip">
          <span>Apache-2.0</span>
          <span>Typed host API</span>
          <span>Atomic membership grants</span>
          <span>Bring your own auth</span>
        </div>
        <section className="build-section" id="integration">
          <div>
            <p className="eyebrow">SMALL COMPONENT. CLEAR RESPONSIBILITIES.</p>
            <h2>
              Workspace logic,
              <br />
              in one place.
            </h2>
            <p>
              Mount teams once. The invitation component mounts with it. Use
              typed methods from your authenticated Convex functions.
            </p>
            <Link href="/docs/getting-started" className="text-link">
              Try the local example <ArrowRight size={16} />
            </Link>
          </div>
          <CodeExample />
        </section>
        <section className="responsibilities">
          <div className="section-heading">
            <p className="eyebrow">BUILT TO WORK TOGETHER</p>
            <h2>Each part has a job.</h2>
          </div>
          <div className="responsibility-grid">
            <article>
              <span className="number">01</span>
              <h3>Teams</h3>
              <p>
                Workspace identity, membership, roles, and ownership. Active and
                default preferences stay separate from access.
              </p>
              <Link href="/docs/workspaces">
                Workspace model <ArrowRight size={15} />
              </Link>
            </article>
            <article>
              <span className="number">02</span>
              <h3>Invitations</h3>
              <p>
                Tokens, expiry, resend, and revocation come from convex-invite.
                Acceptance and membership grants share one transaction.
              </p>
              <Link href="/docs/invitations">
                Invitation lifecycle <ArrowRight size={15} />
              </Link>
            </article>
            <article>
              <span className="number">03</span>
              <h3>Your application</h3>
              <p>
                You control authentication, verified email, delivery, billing,
                and content access. Pass the current seat policy with each
                grant.
              </p>
              <Link href="/docs/host-contract">
                Host responsibilities <ArrowRight size={15} />
              </Link>
            </article>
          </div>
        </section>
        <section className="release-section">
          <div>
            <p className="eyebrow">DEVELOPED IN THE OPEN</p>
            <h2>Follow the first release.</h2>
            <p>
              The development API is available in source. Track the remaining
              dependency, migration, and consumer checks before using it in
              production.
            </p>
          </div>
          <Link href="/docs/release-status" className="button primary">
            View release status <ArrowRight size={17} />
          </Link>
        </section>
      </main>
      <footer>
        <Link href="/" className="brand">
          <Users size={19} /> convex-teams
        </Link>
        <span>By CLIPIN · Apache-2.0</span>
        <a href={github}>
          Contribute on GitHub <ArrowUpRight size={14} />
        </a>
      </footer>
    </div>
  );
}

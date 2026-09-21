import Link from "next/link";
import { ArrowRight, CalendarDays, Check, MessageCircle } from "lucide-react";

const samples = [
  {
    name: "Backlog",
    count: 2,
    cards: [
      { title: "Map the onboarding flow", tag: "Planning", accent: "orange" },
      {
        title: "Audit workspace permissions",
        tag: "Security",
        accent: "green",
      },
    ],
  },
  {
    name: "In progress",
    count: 2,
    cards: [
      { title: "Build the team dashboard", tag: "Design", accent: "green" },
      {
        title: "Review invitation emails",
        tag: "Operations",
        accent: "orange",
      },
    ],
  },
  {
    name: "Done",
    count: 1,
    cards: [
      { title: "Set up project board", tag: "Complete", accent: "green" },
    ],
  },
];
export default function Home() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <Link href="/" className="brand">
          <span className="brand-mark">✳</span> TaskFlow
          <span className="brand-dot">.</span>
        </Link>
        <nav>
          <a href="#features">Features</a>
          <Link href="/login">Log in</Link>
          <Link href="/signup" className="nav-cta">
            Get started <ArrowRight size={16} />
          </Link>
        </nav>
      </header>
      <main>
        <section className="hero">
          <div className="eyebrow">
            <span /> A calmer way to collaborate
          </div>
          <h1>
            Keep work <em>moving.</em>
          </h1>
          <p>
            Plan projects, assign work, and keep your team in sync from one
            shared workspace. Clear boards. Real progress. Less noise.
          </p>
          <div className="hero-actions">
            <Link href="/signup" className="button primary">
              Start your workspace <ArrowRight size={17} />
            </Link>
            <a href="#preview" className="button secondary">
              Explore the board
            </a>
          </div>
          <div className="hero-note">
            <span className="note-check">
              <Check size={13} />
            </span>{" "}
            Built for teams that like to get things done.
          </div>
        </section>
        <section id="preview" className="preview-wrap">
          <div className="preview-heading">
            <div>
              <span className="section-kicker">A LOOK INSIDE</span>
              <h2>Everything in its place.</h2>
            </div>
            <p>
              A board that shows what matters, who owns it, and what moves next.
            </p>
          </div>
          <div className="preview-app">
            <div className="preview-side">
              <div className="preview-brand">✳</div>
              <div className="preview-line active" />
              <div className="preview-line" />
              <div className="preview-line short" />
            </div>
            <div className="preview-content">
              <div className="preview-top">
                <div>
                  <span className="preview-breadcrumb">
                    ACME STUDIO / PRODUCT
                  </span>
                  <h3>
                    Website refresh <span>↗</span>
                  </h3>
                </div>
                <div className="preview-avatars">
                  <b>AM</b>
                  <b>SK</b>
                  <b>JD</b>
                  <span>+2</span>
                </div>
              </div>
              <div className="preview-columns">
                {samples.map((col) => (
                  <div className="preview-column" key={col.name}>
                    <div className="preview-column-head">
                      <span>{col.name}</span>
                      <small>{col.count}</small>
                    </div>
                    {col.cards.map((card) => (
                      <div className="preview-card" key={card.title}>
                        <span className={`preview-tag ${card.accent}`}>
                          {card.tag}
                        </span>
                        <strong>{card.title}</strong>
                        <div className="preview-card-foot">
                          <span>
                            <CalendarDays size={13} /> Sep 24
                          </span>
                          <span>
                            <MessageCircle size={13} /> 2
                          </span>
                          <b>AM</b>
                        </div>
                      </div>
                    ))}
                    <div className="preview-add">+ Add a task</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
        <section id="features" className="feature-strip">
          <div>
            <span>01</span>
            <h3>See the whole picture</h3>
            <p>Move from a workspace overview to the details of every task.</p>
          </div>
          <div>
            <span>02</span>
            <h3>Work together, naturally</h3>
            <p>
              Assign teammates, leave context in comments, and stay in sync.
            </p>
          </div>
          <div>
            <span>03</span>
            <h3>Make progress visible</h3>
            <p>Drag work forward and see updates appear across your team.</p>
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <span>✳ TaskFlow</span>
        <span>Collaborative project management, kept simple.</span>
      </footer>
    </div>
  );
}

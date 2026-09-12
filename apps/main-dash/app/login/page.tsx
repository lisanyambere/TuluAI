import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>Tulu</span>
        </div>
        <p className="eyebrow">Demo workspace</p>
        <h1 id="login-title">A calmer way to coordinate care access.</h1>
        <p className="auth-copy">
          Authentication is intentionally paused while we build the request-review workflow. Open the synthetic facility workspace to continue.
        </p>
        <Link className="button button--primary button--full" href="/dashboard">
          Open demo workspace
        </Link>
        <p className="auth-note">
          Auth0 will be wired in after the dashboard workflow and agent API contract are settled. Development data is synthetic.
        </p>
        <Link className="text-link" href="/">
          Return to Tulu
        </Link>
      </section>
    </main>
  );
}

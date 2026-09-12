"use client";

export default function DashboardError({ reset }: { reset: () => void }) {
  return (
    <div className="error-state" role="alert">
      <p className="eyebrow">Something went wrong</p>
      <h1>The workspace needs another try.</h1>
      <p>We could not load this part of the facility workspace. No caller outcome has been changed.</p>
      <button className="button button--primary" type="button" onClick={() => reset()}>Try again</button>
    </div>
  );
}

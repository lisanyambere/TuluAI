export default function DashboardLoading() {
  return (
    <div className="page-stack" aria-label="Loading dashboard" aria-busy="true">
      <div className="skeleton" style={{ height: 150 }} />
      <div className="loading-grid">
        <div className="skeleton" />
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
    </div>
  );
}

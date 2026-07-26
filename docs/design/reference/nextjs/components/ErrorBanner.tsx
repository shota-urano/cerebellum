export default function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="banner" role="alert" style={{ marginBottom: 12 }}>
      <span className="mono banner__tag">ERR</span>
      <span className="banner__text">{message}</span>
    </div>
  );
}

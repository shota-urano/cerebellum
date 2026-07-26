export default function EmptyState({ message, style }: { message: string; style?: React.CSSProperties }) {
  return <div className="empty" style={style}>{message}</div>;
}

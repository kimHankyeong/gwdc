/** 버튼·상태 배지에 쓰는 최소 크기 로딩 스피너. 진행 중임을 즉시 알리는 용도. */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="처리 중"
      className={`inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

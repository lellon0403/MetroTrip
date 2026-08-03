/**
 * Material Symbols 아이콘.
 * 폰트는 index.html에서 로드한다. name은 아이콘 이름(예: "search", "map").
 * filled=true 면 채워진 형태로 표시한다.
 */
type IconProps = {
  name: string;
  className?: string;
  filled?: boolean;
};

export function Icon({ name, className, filled = false }: IconProps) {
  return (
    <span
      className={`material-symbols-outlined${className ? ` ${className}` : ''}`}
      style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

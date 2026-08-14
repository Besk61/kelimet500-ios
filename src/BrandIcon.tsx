type Props = {
  className?: string;
};

/** The tiny 2×2 K500 mark used in the game header and launch splash. */
export function BrandIcon({ className = '' }: Props) {
  return (
    <div className={`brand-icon ${className}`.trim()} aria-hidden="true">
      <span>K</span><span className="icon-green">5</span>
      <span className="icon-yellow">0</span><span className="icon-red">0</span>
    </div>
  );
}

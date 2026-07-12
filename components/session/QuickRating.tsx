'use client'

// 와인 카드에서 바로 별점만 기록하는 퀵 레이팅.
// 키워드/메모는 기존 '시음평 쓰기' 화면에서 이어서 작성.
export default function QuickRating({
  rating,
  onRate,
  disabled,
}: {
  rating: number | null
  onRate: (n: number) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onClick={() => onRate(n)}
          disabled={disabled}
          aria-label={`${n}점`}
          className={`text-xl leading-none px-0.5 transition-opacity ${
            rating !== null && n <= rating ? 'text-amber-400 opacity-100' : 'text-amber-400 opacity-25'
          } ${disabled ? 'cursor-wait' : 'active:scale-110'}`}
        >
          ★
        </button>
      ))}
      {rating !== null && <span className="text-xs text-muted-foreground ml-1">{rating}점</span>}
    </div>
  )
}

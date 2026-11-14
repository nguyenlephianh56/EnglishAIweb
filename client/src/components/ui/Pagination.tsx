import { ChevronLeft, ChevronRight } from "lucide-react";
import Button from "./Button";

interface PaginationProps {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}

/** Phân trang: ≤ 7 trang hiện từng số, nhiều hơn thì hiện "Trang x/y". */
export default function Pagination({ page, pageCount, onChange }: PaginationProps) {
  if (pageCount <= 1) return null;
  const numbers = pageCount <= 7 ? Array.from({ length: pageCount }, (_, i) => i + 1) : null;
  return (
    <nav className="mt-8 flex flex-wrap items-center justify-center gap-2" aria-label="Phân trang">
      <Button variant="outline" size="sm" leftIcon={<ChevronLeft />} disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Trước
      </Button>
      {numbers ? (
        numbers.map((n) => (
          <Button key={n} size="sm" variant={n === page ? "primary" : "outline"} aria-current={n === page ? "page" : undefined} aria-label={`Trang ${n}`} onClick={() => onChange(n)}>
            {n}
          </Button>
        ))
      ) : (
        <span className="px-2 text-sm font-semibold text-slate-600">
          Trang {page}/{pageCount}
        </span>
      )}
      <Button variant="outline" size="sm" rightIcon={<ChevronRight />} disabled={page >= pageCount} onClick={() => onChange(page + 1)}>
        Sau
      </Button>
    </nav>
  );
}

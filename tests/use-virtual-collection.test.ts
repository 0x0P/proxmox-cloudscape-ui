import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVirtualCollection } from "@/app/lib/use-virtual-collection";

describe("useVirtualCollection", () => {
  const items = Array.from({ length: 120 }, (_, i) => ({ id: i }));

  it("returns first page of items with default page size", () => {
    const { result } = renderHook(() => useVirtualCollection({ items, pageSize: 50 }));

    expect(result.current.currentPageItems).toHaveLength(50);
    expect(result.current.currentPageItems[0]).toEqual({ id: 0 });
    expect(result.current.totalPages).toBe(3);
    expect(result.current.currentPage).toBe(1);
  });

  it("navigates to second page", () => {
    const { result } = renderHook(() => useVirtualCollection({ items, pageSize: 50 }));

    act(() => {
      result.current.setCurrentPage(2);
    });

    expect(result.current.currentPageItems[0]).toEqual({ id: 50 });
    expect(result.current.currentPageItems).toHaveLength(50);
  });

  it("handles last page with fewer items", () => {
    const { result } = renderHook(() => useVirtualCollection({ items, pageSize: 50 }));

    act(() => {
      result.current.setCurrentPage(3);
    });

    expect(result.current.currentPageItems).toHaveLength(20);
    expect(result.current.currentPageItems[0]).toEqual({ id: 100 });
  });

  it("paginationProps onChange updates page", () => {
    const { result } = renderHook(() => useVirtualCollection({ items, pageSize: 50 }));

    act(() => {
      result.current.paginationProps.onChange({ detail: { currentPageIndex: 2 } });
    });

    expect(result.current.currentPage).toBe(2);
    expect(result.current.paginationProps.currentPageIndex).toBe(2);
  });

  it("handles empty items", () => {
    const { result } = renderHook(() => useVirtualCollection({ items: [], pageSize: 50 }));

    expect(result.current.currentPageItems).toHaveLength(0);
    expect(result.current.totalPages).toBe(1);
  });
});

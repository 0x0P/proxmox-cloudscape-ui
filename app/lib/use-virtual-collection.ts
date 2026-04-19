"use client";

import { useMemo, useState, useCallback } from "react";

interface UseVirtualCollectionOptions<T> {
  items: T[];
  pageSize?: number;
}

interface UseVirtualCollectionResult<T> {
  currentPageItems: T[];
  totalPages: number;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  paginationProps: {
    currentPageIndex: number;
    pagesCount: number;
    onChange: (event: { detail: { currentPageIndex: number } }) => void;
  };
}

export function useVirtualCollection<T>({
  items,
  pageSize = 50,
}: UseVirtualCollectionOptions<T>): UseVirtualCollectionResult<T> {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(items.length / pageSize)),
    [items.length, pageSize],
  );

  const currentPageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, currentPage, pageSize]);

  const handlePageChange = useCallback(
    (event: { detail: { currentPageIndex: number } }) => {
      setCurrentPage(event.detail.currentPageIndex);
    },
    [],
  );

  const paginationProps = useMemo(
    () => ({
      currentPageIndex: currentPage,
      pagesCount: totalPages,
      onChange: handlePageChange,
    }),
    [currentPage, totalPages, handlePageChange],
  );

  return {
    currentPageItems,
    totalPages,
    currentPage,
    setCurrentPage,
    paginationProps,
  };
}

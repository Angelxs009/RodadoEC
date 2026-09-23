import { createContext, useContext, useState, type ReactNode } from 'react';
import type { CarDetailsResult, CarSearchRequest, CarSearchResponse } from '../types/autos';

interface BookingState {
  searchRequest: CarSearchRequest | null;
  searchResponse: CarSearchResponse | null;
  setSearch: (req: CarSearchRequest, res: CarSearchResponse) => void;
  detailsById: Record<string, CarDetailsResult>;
  setDetailsById: (details: Record<string, CarDetailsResult>) => void;
  holdId: string | null;
  setHoldId: (id: string | null) => void;
  previewId: string | null;
  previewTotal: number | null;
  setPreview: (id: string, total: number) => void;
  reset: () => void;
}

const BookingContext = createContext<BookingState | null>(null);

export function BookingProvider({ children }: { children: ReactNode }) {
  const [searchRequest, setSearchRequest] = useState<CarSearchRequest | null>(null);
  const [searchResponse, setSearchResponse] = useState<CarSearchResponse | null>(null);
  const [detailsById, setDetailsById] = useState<Record<string, CarDetailsResult>>({});
  const [holdId, setHoldId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewTotal, setPreviewTotal] = useState<number | null>(null);

  const value: BookingState = {
    searchRequest,
    searchResponse,
    setSearch: (req, res) => {
      setSearchRequest(req);
      setSearchResponse(res);
    },
    detailsById,
    setDetailsById,
    holdId,
    setHoldId,
    previewId,
    previewTotal,
    setPreview: (id, total) => {
      setPreviewId(id);
      setPreviewTotal(total);
    },
    reset: () => {
      setSearchRequest(null);
      setSearchResponse(null);
      setHoldId(null);
      setPreviewId(null);
      setPreviewTotal(null);
    },
  };

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBooking(): BookingState {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error('useBooking debe usarse dentro de <BookingProvider>');
  return ctx;
}

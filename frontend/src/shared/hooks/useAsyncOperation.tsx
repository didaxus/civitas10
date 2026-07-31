import { useCallback, useState, useEffect } from "react";

/**
 * Estado estandarizado para operaciones asíncronas.
 */
export type AsyncState<T = unknown> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

/**
 * Resultado del hook useAsyncOperation.
 */
export type UseAsyncOperationResult<T> = AsyncState<T> & {
  execute: (operation: () => Promise<T>) => Promise<T | null>;
  reset: () => void;
  setData: (data: T | null) => void;
  setError: (error: string | null) => void;
};

/**
 * Hook centralizado para gestión de estados de carga/error en operaciones asíncronas.
 */
export function useAsyncOperation<T>(initialValue?: T | null): UseAsyncOperationResult<T> {
  const [state, setState] = useState<AsyncState<T>>({
    data: initialValue ?? null,
    loading: false,
    error: null,
  });

  const execute = useCallback(async (operation: () => Promise<T>): Promise<T | null> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const result = await operation();
      setState((prev) => ({ ...prev, data: result, loading: false }));
      return result;
    } catch (caught) {
      const errorMessage = caught instanceof Error ? caught.message : "Operation failed.";
      setState((prev) => ({ ...prev, error: errorMessage, loading: false }));
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setState({
      data: initialValue ?? null,
      loading: false,
      error: null,
    });
  }, [initialValue]);

  const setData = useCallback((data: T | null) => {
    setState((prev) => ({ ...prev, data }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, error }));
  }, []);

  return {
    ...state,
    execute,
    reset,
    setData,
    setError,
  };
}

/**
 * Componente UI simple para estados de carga/error sin dependencias externas.
 */
export const AsyncStateRenderer = ({
  loading,
  error,
  children,
  emptyMessage = "No hay datos disponibles",
  loadingMessage = "Cargando...",
  errorTitle = "Error al cargar",
}: {
  loading: boolean;
  error: string | null;
  children: React.ReactNode;
  emptyMessage?: string;
  loadingMessage?: string;
  errorTitle?: string;
}) => {
  if (loading) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-gray-500">{loadingMessage}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border border-red-200 bg-red-50 rounded-md">
        <h3 className="text-sm font-semibold text-red-800">{errorTitle}</h3>
        <p className="mt-1 text-sm text-red-700">{error}</p>
        <p className="mt-2 text-xs text-red-600">Verifica tu conexión o intenta nuevamente.</p>
      </div>
    );
  }

  return <>{children}</>;
};

/**
 * Hook especializado para operaciones que se ejecutan automáticamente al montar.
 */
export function useAutoFetch<T>(
  fetchFn: () => Promise<T>,
  dependencies: React.DependencyList
): AsyncState<T> {
  const { data, loading, error, execute } = useAsyncOperation<T>();

  useEffect(() => {
    execute(fetchFn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  return { data, loading, error };
}

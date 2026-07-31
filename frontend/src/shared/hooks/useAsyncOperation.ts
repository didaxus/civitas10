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
  /** Función para ejecutar la operación */
  execute: (operation: () => Promise<T>) => Promise<T | null>;
  /** Función para resetear el estado a valores iniciales */
  reset: () => void;
  /** Función para actualizar datos sin cambiar loading/error */
  setData: (data: T | null) => void;
  /** Función para establecer error manualmente */
  setError: (error: string | null) => void;
};

/**
 * Hook centralizado para gestión de estados de carga/error en operaciones asíncronas.
 * Reemplaza el patrón repetido de useState para loading, error y data en cada módulo.
 * 
 * @template T - Tipo de dato esperado
 * @param initialValue - Valor inicial para data (opcional, default: null)
 * @returns Objeto con estado estandarizado y funciones de control
 * 
 * @example
 * ```tsx
 * const { data, loading, error, execute } = useAsyncOperation<GovernanceReadModel>();
 * 
 * useEffect(() => {
 *   execute(() => governanceApi.getOwnerGovernance(organizationId));
 * }, [organizationId]);
 * 
 * if (loading) return <StateRegion><p>Loading...</p></StateRegion>;
 * if (error) return <SectionCard title="Error" description={error} />;
 * if (!data) return <EmptyState />;
 * 
 * return <GovernanceModules model={data} />;
 * ```
 */
export function useAsyncOperation<T>(initialValue?: T | null): UseAsyncOperationResult<T> {
  const [state, setState] = useState<AsyncState<T>>({
    data: initialValue ?? null,
    loading: false,
    error: null,
  });

  /**
   * Ejecuta una operación asíncrona actualizando automáticamente los estados.
   */
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

  /**
   * Resetea el estado a valores iniciales.
   */
  const reset = useCallback(() => {
    setState({
      data: initialValue ?? null,
      loading: false,
      error: null,
    });
  }, [initialValue]);

  /**
   * Actualiza data sin afectar loading o error.
   */
  const setData = useCallback((data: T | null) => {
    setState((prev) => ({ ...prev, data }));
  }, []);

  /**
   * Establece error manualmente.
   */
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
 * Componente UI estandarizado para mostrar estados de carga/error.
 * Se usa junto con useAsyncOperation para renderizar el estado apropiado.
 * 
 * @example
 * ```tsx
 * const { data, loading, error } = useAsyncOperation<GovernanceReadModel>();
 * 
 * return (
 *   <AsyncStateRenderer
 *     loading={loading}
 *     error={error}
 *     emptyMessage="No hay datos disponibles"
 *     loadingMessage="Cargando datos de governance..."
 *   >
 *     {data && <GovernanceModules model={data} />}
 *   </AsyncStateRenderer>
 * );
 * ```
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
  // Importación lazy para evitar circular dependencies
  const { StateRegion, SectionCard } = require("./../ui") as {
    StateRegion: React.ComponentType<{ children: React.ReactNode }>;
    SectionCard: React.ComponentType<{ title: string; description?: string; children: React.ReactNode }>;
  };

  if (loading) {
    return (
      <StateRegion>
        <p className="text-sm text-muted-strong">{loadingMessage}</p>
      </StateRegion>
    );
  }

  if (error) {
    return (
      <SectionCard title={errorTitle} description={error}>
        <p className="text-xs text-muted">Verifica tu conexión o intenta nuevamente.</p>
      </SectionCard>
    );
  }

  return <>{children}</>;
};

/**
 * Hook especializado para operaciones que se ejecutan automáticamente al montar.
 * Útil para fetch de datos iniciales.
 * 
 * @example
 * ```tsx
 * const { data, loading, error } = useAutoFetch(
 *   () => governanceApi.getOwnerGovernance(organizationId),
 *   [organizationId]
 * );
 * ```
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

import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";

/**
 * Hook centralizado para gestión de estado en URL.
 * Reemplaza el uso directo de URLSearchParams, window.location y globalThis.
 * 
 * @template T - Tipo del objeto de estado (Record<string, string>)
 * @param defaults - Valores por defecto para las keys del estado
 * @param options - Opciones configurables
 * @param options.debounceMs - Tiempo de debounce en ms para escritura (opcional)
 * @param options.encode - Si true, codifica valores con encodeURIComponent (default: false)
 * @returns Tupla [estadoActual, funcionActualizacion]
 * 
 * @example
 * ```tsx
 * const [filters, setFilters] = useUrlState({ page: "1", sort: "name" });
 * // Lee ?page=1&sort=name de la URL
 * 
 * setFilters({ page: "2" }); 
 * // Actualiza URL a ?page=2&sort=name
 * ```
 */
export function useUrlState<T extends Record<string, string>>(
  defaults: T,
  options?: {
    debounceMs?: number;
    encode?: boolean;
  }
): [T, (updates: Partial<T>) => void] {
  const location = useLocation();
  const navigate = useNavigate();
  const { debounceMs = 0, encode = false } = options ?? {};

  // Parsear estado actual desde URL
  const parseUrlState = useCallback((): T => {
    const params = new URLSearchParams(location.search);
    const state = { ...defaults };

    for (const key of Object.keys(defaults)) {
      const value = params.get(key);
      if (value !== null) {
        state[key as keyof T] = value as T[keyof T];
      }
    }

    return state;
  }, [location.search, defaults]);

  const [state, setState] = useState<T>(parseUrlState);

  // Actualizar estado cuando cambia la URL
  useEffect(() => {
    setState(parseUrlState());
  }, [parseUrlState]);

  // Función de actualización con debounce opcional
  const updateState = useCallback(
    (updates: Partial<T>) => {
      const newState = { ...state, ...updates };

      // Limpiar valores que coinciden con defaults
      const nonDefaultUpdates: Partial<T> = {};
      for (const key of Object.keys(newState) as Array<keyof T>) {
        if (newState[key] !== defaults[key]) {
          nonDefaultUpdates[key] = newState[key];
        }
      }

      // Construir nuevos query params
      const params = new URLSearchParams(location.search);
      
      // Remover keys que volvieron al default
      for (const key of Object.keys(defaults) as Array<keyof T>) {
        if (!(key in nonDefaultUpdates)) {
          params.delete(key as string);
        }
      }

      // Agregar/actualizar keys con nuevos valores
      for (const [key, value] of Object.entries(nonDefaultUpdates)) {
        if (value !== undefined && value !== null) {
          params.set(key, encode ? encodeURIComponent(value) : value);
        }
      }

      const search = params.toString();
      const newSearch = search ? `?${search}` : "";

      // Aplicar debounce si está configurado
      if (debounceMs > 0) {
        const timeoutId = setTimeout(() => {
          navigate({ search: newSearch }, { replace: true });
        }, debounceMs);

        return () => clearTimeout(timeoutId);
      }

      // Navegación inmediata
      navigate({ search: newSearch }, { replace: true });
    },
    [state, defaults, location.search, navigate, debounceMs, encode]
  );

  return [state, updateState];
}

/**
 * Hook simplificado para solo lectura de URL state sin escritura.
 * Útil para componentes que solo necesitan leer parámetros.
 * 
 * @example
 * ```tsx
 * const section = useUrlParam("section");
 * ```
 */
export function useUrlParam(key: string): string | null {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  return params.get(key);
}

/**
 * Hook para leer todos los query params como objeto.
 * 
 * @example
 * ```tsx
 * const allParams = useAllUrlParams();
 * // { section: "roles", filter: "active" }
 * ```
 */
export function useAllUrlParams(): Record<string, string> {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const result: Record<string, string> = {};

  for (const [key, value] of params.entries()) {
    result[key] = value;
  }

  return result;
}

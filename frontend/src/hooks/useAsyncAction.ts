import { useState, useCallback } from 'react';

/**
 * Hook para proteger ações assíncronas contra múltiplos cliques
 * @param action - Função assíncrona a ser executada
 * @param options - Opções de configuração
 * @returns Objeto com função executora e estado de loading
 */
export function useAsyncAction<T extends (...args: any[]) => Promise<any>>(
  action: T,
  options?: {
    onSuccess?: (result: Awaited<ReturnType<T>>) => void | Promise<void>;
    onError?: (error: any) => void;
    successMessage?: string;
    errorMessage?: string;
  }
) {
  const [isLoading, setIsLoading] = useState(false);

  const execute = useCallback(
    async (...args: Parameters<T>) => {
      // Prevenir múltiplas execuções simultâneas
      if (isLoading) return;

      try {
        setIsLoading(true);
        const result = await action(...args);
        
        if (options?.onSuccess) {
          await options.onSuccess(result);
        }
        
        return result;
      } catch (error) {
        if (options?.onError) {
          options.onError(error);
        }
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [action, isLoading, options]
  );

  return {
    execute,
    isLoading,
  };
}


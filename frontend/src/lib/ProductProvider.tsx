import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, getToken } from '@/lib/api';
import { isAdminRole } from '@/lib/projectLinePermissionKeys';
import {
  type ProductId,
  canAccessMetalsProduct,
  isHubOnlyPath,
  isMetalsOnlyPath,
  readStoredProduct,
  writeStoredProduct,
} from '@/lib/productScope';

type ProductContextValue = {
  product: ProductId;
  setProduct: (next: ProductId) => void;
  canAccessMetals: boolean;
  switchProduct: () => void;
};

const ProductContext = createContext<ProductContextValue | null>(null);

export function ProductProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const hasToken = !!getToken();
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<any>('GET', '/auth/me'),
    staleTime: 60_000,
    enabled: hasToken,
  });

  const isAdmin = isAdminRole(me?.roles);
  const canAccessMetals = canAccessMetalsProduct(isAdmin, me?.permissions);

  const [product, setProductState] = useState<ProductId>(() => readStoredProduct());

  // Force hub if user cannot access metals
  useEffect(() => {
    if (me == null) return;
    if (!canAccessMetals && product === 'metals') {
      setProductState('hub');
      writeStoredProduct('hub');
    }
  }, [me, canAccessMetals, product]);

  const setProduct = useCallback(
    (next: ProductId) => {
      if (next === 'metals' && !canAccessMetals) return;
      setProductState(next);
      writeStoredProduct(next);
    },
    [canAccessMetals],
  );

  const switchProduct = useCallback(() => {
    const next: ProductId = product === 'hub' ? 'metals' : 'hub';
    if (next === 'metals' && !canAccessMetals) return;
    setProductState(next);
    writeStoredProduct(next);
    navigate('/home', { replace: true });
  }, [product, canAccessMetals, navigate]);

  // Route guards
  useEffect(() => {
    if (me == null) return;
    const path = location.pathname;
    if (product === 'metals' && isHubOnlyPath(path)) {
      navigate('/home', { replace: true });
      return;
    }
    if (product === 'hub' && isMetalsOnlyPath(path)) {
      navigate('/home', { replace: true });
      return;
    }
    if (!canAccessMetals && isMetalsOnlyPath(path)) {
      navigate('/home', { replace: true });
    }
  }, [product, location.pathname, me, canAccessMetals, navigate]);

  const value = useMemo(
    () => ({ product, setProduct, canAccessMetals, switchProduct }),
    [product, setProduct, canAccessMetals, switchProduct],
  );

  return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
}

export function useProduct(): ProductContextValue {
  const ctx = useContext(ProductContext);
  if (!ctx) {
    throw new Error('useProduct must be used within ProductProvider');
  }
  return ctx;
}

/** Safe hook when outside provider (tests) — defaults to hub. */
export function useProductOptional(): ProductContextValue | null {
  return useContext(ProductContext);
}

import type { Product } from '@stocknify/shared'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'

import { apiFetch, toQueryString } from './client'

export interface DefaultVariant {
  id: string
  sku: string
  barcode: string | null
}

export interface ProductWithCount extends Product {
  _count: { variants: number }
  variants: DefaultVariant[] // first variant only — `take: 1` in backend
}

export interface ProductFilters {
  search?: string
  page?: number
  perPage?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}

export function useProducts(filters: ProductFilters = {}): UseQueryResult<ProductWithCount[]> {
  const query = toQueryString({ ...filters })
  return useQuery<ProductWithCount[]>({
    queryKey: ['products', filters],
    queryFn: () => apiFetch<ProductWithCount[]>(`/products${query}`),
  })
}

export interface ProductDetailVariant {
  id: string
  sku: string
  name: string | null
  barcode: string | null
  attributes: Record<string, unknown>
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface ProductDetail extends Product {
  variants: ProductDetailVariant[]
}

export function useProduct(id: string | null): UseQueryResult<ProductDetail> {
  return useQuery<ProductDetail>({
    queryKey: ['products', id],
    queryFn: () => apiFetch<ProductDetail>(`/products/${id as string}`),
    enabled: Boolean(id),
  })
}

export interface CreateProductInput {
  name: string
  sku: string
  barcode?: string
  unit?: string
  batchTracking?: boolean
  description?: string
  metadata?: Record<string, unknown>
}

export function useCreateProduct(): UseMutationResult<Product, Error, CreateProductInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateProductInput) =>
      apiFetch<Product>('/products', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['products'] })
    },
  })
}

export interface UpdateProductInput {
  id: string
  name?: string
  description?: string
  category?: string
  unit?: string
  batchTracking?: boolean
  barcode?: string
}

export function useUpdateProduct(): UseMutationResult<Product, Error, UpdateProductInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateProductInput) =>
      apiFetch<Product>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ['products'] })
      void qc.invalidateQueries({ queryKey: ['products', variables.id] })
    },
  })
}

export function useDeleteProduct(): UseMutationResult<unknown, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<unknown>(`/products/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['products'] })
    },
  })
}

// No bulk-delete backend endpoint yet — fan out sequential DELETE calls so
// the existing per-id soft-delete transaction runs for each selection.
export function useDeleteProducts(): UseMutationResult<void, Error, string[]> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        await apiFetch<unknown>(`/products/${id}`, { method: 'DELETE' })
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['products'] })
    },
  })
}

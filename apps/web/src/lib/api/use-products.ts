import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { Product } from '@stocknify/shared'

import { apiFetch, toQueryString } from './client'

export interface ProductWithCount extends Product {
  _count: { variants: number }
}

export interface ProductFilters {
  search?: string
  page?: number
  perPage?: number
}

export function useProducts(filters: ProductFilters = {}) {
  const query = toQueryString({ ...filters })
  return useQuery<ProductWithCount[]>({
    queryKey: ['products', filters],
    queryFn: () => apiFetch<ProductWithCount[]>(`/products${query}`),
  })
}

export function useProduct(id: string | null) {
  return useQuery<ProductWithCount>({
    queryKey: ['products', id],
    queryFn: () => apiFetch<ProductWithCount>(`/products/${id as string}`),
    enabled: Boolean(id),
  })
}

export interface CreateProductInput {
  name: string
  sku: string
  unit?: string
  batchTracking?: boolean
  description?: string
}

export function useCreateProduct() {
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
}

export function useUpdateProduct() {
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

export function useDeleteProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<unknown>(`/products/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['products'] })
    },
  })
}

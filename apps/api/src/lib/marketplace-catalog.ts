export type MarketplaceCategory = 'shop' | 'erp' | 'warehouse' | 'fulfiller'

export interface MarketplaceFixedTemplate {
  name: string
  direction: 'import' | 'export'
  resourceType: 'products' | 'stock' | 'locations'
  delimiter: string
  encoding: string
  hasHeaderRow: boolean
  columnMappings: Array<{
    csvColumn: string | null
    field: string
    required: boolean
    defaultValue?: string
  }>
  defaultValues: Record<string, string>
}

export interface MarketplaceIntegration {
  key: string
  name: string
  description: string
  category: MarketplaceCategory
  logoUrl: string
  fixedTemplates?: MarketplaceFixedTemplate[]
}

export const MARKETPLACE_CATALOG: MarketplaceIntegration[] = [
  {
    key: 'shopify',
    name: 'Shopify',
    description: 'Sync products and inventory with your Shopify store.',
    category: 'shop',
    logoUrl: '/integrations/logos/shopify.svg',
  },
  {
    key: 'woocommerce',
    name: 'WooCommerce',
    description: 'Connect your WooCommerce store for real-time inventory sync.',
    category: 'shop',
    logoUrl: '/integrations/logos/woocommerce.svg',
  },
  {
    key: 'xentral',
    name: 'Xentral',
    description: 'ERP integration for product data and order management.',
    category: 'erp',
    logoUrl: '/integrations/logos/xentral.svg',
  },
  {
    key: 'hive',
    name: 'Hive',
    description: 'Connect Hive fulfillment for real-time warehouse stock levels.',
    category: 'fulfiller',
    logoUrl: '/integrations/logos/hive.svg',
  },
  {
    key: 'byrd',
    name: 'Byrd',
    description: 'Sync inventory with Byrd fulfillment centers.',
    category: 'fulfiller',
    logoUrl: '/integrations/logos/byrd.svg',
  },
  {
    key: 'zenfulfillment',
    name: 'Zenfulfillment',
    description: 'Inventory sync with Zenfulfillment warehouse operations.',
    category: 'fulfiller',
    logoUrl: '/integrations/logos/zenfulfillment.svg',
  },
]

export function getCatalogEntry(key: string): MarketplaceIntegration | undefined {
  return MARKETPLACE_CATALOG.find((i) => i.key === key)
}

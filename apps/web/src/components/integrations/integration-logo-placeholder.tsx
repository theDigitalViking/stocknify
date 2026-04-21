interface IntegrationLogoPlaceholderProps {
  name: string
  size?: number
}

export function IntegrationLogoPlaceholder({
  name,
  size = 32,
}: IntegrationLogoPlaceholderProps): JSX.Element {
  return (
    <img
      src="/integrations/logos/placeholder.svg"
      alt={name}
      width={size}
      height={size}
      className="object-contain opacity-60"
    />
  )
}

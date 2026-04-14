// Onboarding wizard — Phase 2 implementation
// Users land here after email confirmation to set up their first integration
export default function OnboardingPage(): JSX.Element {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-border p-8">
      <h2 className="text-2xl font-semibold mb-2">Welcome to Stocknify</h2>
      <p className="text-muted-foreground mb-6">
        Let&apos;s connect your first integration to start monitoring your inventory.
      </p>
      <div className="rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">
        Onboarding wizard coming in Phase 2.
      </div>
    </div>
  )
}

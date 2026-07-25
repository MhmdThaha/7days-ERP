'use client';

import Link from 'next/link';
import { User } from 'lucide-react';

import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';

function SettingsField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

export function SettingsPage() {
  const { user, isLoading } = useAuth();

  const displayName = user?.displayName?.trim() || 'Signed-in user';
  const email = user?.email ?? 'Not available';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Account details and workspace preferences for BakeryOS."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="size-5" aria-hidden="true" />
            Account
          </CardTitle>
          <CardDescription>Your signed-in profile for this bakery workspace.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <SettingsField label="Name" value={isLoading ? 'Loading…' : displayName} />
          <SettingsField label="Email" value={isLoading ? 'Loading…' : email} />
          <SettingsField
            label="Email verified"
            value={isLoading ? 'Loading…' : user?.emailVerified ? 'Yes' : 'No'}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>
            Organization-wide settings such as categories, tax rules, and team roles will be managed
            here in a future update.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button nativeButton={false} variant="outline" render={<Link href="/products" />}>
            Manage Products
          </Button>
          <Button nativeButton={false} variant="outline" render={<Link href="/raw-materials" />}>
            Manage Ingredients
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

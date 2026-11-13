'use client'

import type { PostHog } from 'posthog-js'

// Analytics is not needed to draw anything, and the library is one of the
// largest scripts in the app. It loads once the browser is idle instead of
// with the first paint; events fired before then wait on the same promise.
let client: Promise<PostHog | null> | null = null

export function getPostHog(): Promise<PostHog | null> {
  if (typeof window === 'undefined' || !process.env.NEXT_PUBLIC_POSTHOG_KEY) return Promise.resolve(null)
  if (!client) {
    client = new Promise<void>(resolve => {
      const idle = (window as any).requestIdleCallback as ((cb: () => void, opts?: { timeout: number }) => void) | undefined
      if (idle) idle(() => resolve(), { timeout: 4000 })
      else setTimeout(resolve, 2500)
    })
      .then(() => import('posthog-js'))
      .then(({ default: posthog }) => {
        posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
          api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
          person_profiles: 'identified_only',
          capture_pageview: false,
          capture_pageleave: true,
        })
        return posthog
      })
      .catch(() => null) // blocked by an ad blocker or offline: the app carries on without analytics
  }
  return client
}

export function PHProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

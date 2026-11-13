'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { getPostHog } from '../providers'

export default function PostHogPageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!pathname) return
    let url = window.location.origin + pathname
    if (searchParams.toString()) {
      url += `?${searchParams.toString()}`
    }
    getPostHog().then(posthog => posthog?.capture('$pageview', { $current_url: url }))
  }, [pathname, searchParams])

  return null
}

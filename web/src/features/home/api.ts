/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { getPricing } from '@/features/pricing/api'
import type { PricingData } from '@/features/pricing/types'
import { api } from '@/lib/api'

import type { HomePageContentResponse } from './types'

const silentBackgroundRequest = {
  skipBusinessError: true,
  skipErrorHandler: true,
} as const

// ============================================================================
// Home Page APIs
// ============================================================================

/**
 * Get custom home page content
 * Returns Markdown/HTML content or iframe URL
 */
export async function getHomePageContent(): Promise<HomePageContentResponse> {
  const res = await api.get('/api/home_page_content', {
    ...silentBackgroundRequest,
    headers: { 'Cache-Control': null },
  })
  return res.data
}

// ============================================================================
// Home Stats
// ============================================================================

export interface HomeStats {
  /** Number of enabled models exposed by /api/pricing */
  models: number
  /** Number of distinct providers/vendors exposed by /api/pricing */
  providers: number
  /** Average service uptime/success rate (percentage), best-effort */
  uptimePct: number
}

const DEFAULT_UPTIME_PCT = 99.9

export async function getHomePricing(): Promise<PricingData> {
  return getPricing(silentBackgroundRequest)
}

/**
 * Aggregate the landing-page stat counters. Models/providers come from live
 * /api/pricing; the Uptime SLA is the fixed advertised figure (99.9%).
 */
export async function getHomeStats(): Promise<HomeStats> {
  const pricing = await getHomePricing()
  if (!pricing.success) {
    throw new Error(
      `getHomeStats: /api/pricing returned success=false${
        pricing.message ? `: ${pricing.message}` : ''
      }`
    )
  }
  const models = Array.isArray(pricing.data) ? pricing.data.length : 0
  const providers = Array.isArray(pricing.vendors) ? pricing.vendors.length : 0

  return { models, providers, uptimePct: DEFAULT_UPTIME_PCT }
}

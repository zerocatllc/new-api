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
import type { SystemStatus } from '@/features/auth/types'

export interface ApiEndpoint {
  id: string
  url: string
  route: string
  color: string
}

function getStatusValue(status: SystemStatus | null, key: string): unknown {
  if (!status) return undefined
  return status[key] ?? status.data?.[key]
}

function parseApiInfo(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []

  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null

  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

    return url.href.replace(/\/$/, '')
  } catch {
    return null
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function routeLabel(value: unknown, url: string): string {
  const route = stringValue(value)
  if (!route || /https?:\/\//i.test(route)) return new URL(url).hostname
  return route
}

function fallbackEndpoint(
  status: SystemStatus | null,
  fallbackOrigin: string
): ApiEndpoint[] {
  const configuredAddress =
    getStatusValue(status, 'server_address') ??
    getStatusValue(status, 'serverAddress')
  const url =
    normalizeHttpUrl(configuredAddress) ?? normalizeHttpUrl(fallbackOrigin)

  if (!url) return []

  return [
    {
      id: url,
      url,
      route: 'API Base URL',
      color: 'blue',
    },
  ]
}

export function resolveApiEndpoints(
  status: SystemStatus | null,
  fallbackOrigin: string
): ApiEndpoint[] {
  if (getStatusValue(status, 'api_info_enabled') === false) {
    return fallbackEndpoint(status, fallbackOrigin)
  }

  const seen = new Set<string>()
  const endpoints: ApiEndpoint[] = []

  for (const value of parseApiInfo(getStatusValue(status, 'api_info'))) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue

    const item = value as Record<string, unknown>
    const url = normalizeHttpUrl(item.url)
    if (!url || seen.has(url)) continue

    seen.add(url)
    endpoints.push({
      id: stringValue(item.id) || url,
      url,
      route: routeLabel(item.route, url),
      color: stringValue(item.color) || 'blue',
    })
  }

  return endpoints.length ? endpoints : fallbackEndpoint(status, fallbackOrigin)
}

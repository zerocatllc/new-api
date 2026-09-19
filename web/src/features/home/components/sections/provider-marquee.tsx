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
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { getLobeIcon } from '@/lib/lobe-icon'

import { getHomePricing } from '../../api'

interface VendorItem {
  id: string | number
  name: string
  icon?: string
}

export function ProviderMarquee() {
  const { t } = useTranslation()
  const { data } = useQuery({
    queryKey: ['home-pricing'],
    queryFn: getHomePricing,
    staleTime: 5 * 60 * 1000,
  })

  const vendors = useMemo<VendorItem[]>(() => {
    if (
      !data?.success ||
      !Array.isArray(data.vendors) ||
      !Array.isArray(data.data)
    ) {
      return []
    }

    const activeVendorIds = new Set(
      data.data
        .map((model) => model.vendor_id)
        .filter((id): id is number => id !== undefined)
    )

    return data.vendors
      .filter(
        (vendor) =>
          vendor.name.trim().length > 0 && activeVendorIds.has(vendor.id)
      )
      .map((vendor) => ({
        id: vendor.id,
        name: vendor.name,
        icon: vendor.icon,
      }))
  }, [data])

  if (vendors.length === 0) return null

  return (
    <section
      aria-labelledby='home-provider-heading'
      className='border-border/70 bg-background border-y py-10 md:py-12'
    >
      <h2
        id='home-provider-heading'
        className='text-muted-foreground px-6 text-center text-xs font-semibold tracking-[0.18em] uppercase'
      >
        {t("Bringing together the world's leading AI providers")}
      </h2>

      <div className='marquee-container mt-8 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]'>
        <div className='animate-marquee-x flex w-max'>
          {[0, 1].map((group) => (
            <div
              key={group}
              aria-hidden={group === 1 || undefined}
              className='flex shrink-0 items-center gap-10 px-5 md:gap-16 md:px-8'
            >
              {vendors.map((vendor) => (
                <div
                  key={vendor.id}
                  className='text-muted-foreground flex shrink-0 items-center gap-2.5 opacity-70 transition-opacity duration-150 hover:opacity-100'
                >
                  <span
                    aria-hidden='true'
                    className='flex size-7 shrink-0 items-center justify-center'
                  >
                    {getLobeIcon(vendor.icon || vendor.name, 26)}
                  </span>
                  <span className='text-sm font-medium whitespace-nowrap'>
                    {vendor.name}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

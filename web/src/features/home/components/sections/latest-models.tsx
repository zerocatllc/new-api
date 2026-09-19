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
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'
import { Button } from '@/components/ui/button'
import { DEFAULT_TOKEN_UNIT } from '@/features/pricing/constants'
import { isTokenBasedModel } from '@/features/pricing/lib/model-helpers'
import { formatPrice, formatRequestPrice } from '@/features/pricing/lib/price'

import { getHomePricing } from '../../api'

/**
 * "Latest Models" section (Kimi reference): the first three models returned
 * by /api/pricing, in the order the backend already ranks them — no local
 * sorting or hardcoded fallback list. A failed or empty fetch simply hides
 * the whole section rather than showing placeholder data.
 */
export function LatestModels() {
  const { t } = useTranslation()
  const { data } = useQuery({
    queryKey: ['home-latest-models'],
    queryFn: getHomePricing,
    staleTime: 5 * 60 * 1000,
  })

  if (!data?.success || !Array.isArray(data.data) || data.data.length === 0) {
    return null
  }

  const groupRatio = data.group_ratio ?? {}
  const models = data.data
    .slice(0, 3)
    .map((model) => ({ ...model, group_ratio: groupRatio }))

  return (
    <section>
      <div className='mx-auto w-full max-w-[1440px] px-6 py-16 md:px-8 md:py-24'>
        <div className='flex flex-wrap items-end justify-between gap-4'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight md:text-3xl'>
              {t('Latest Models')}
            </h2>
            <p className='text-muted-foreground mt-2 max-w-xl text-sm md:text-base'>
              {t(
                'A snapshot of the newest models available through the gateway.'
              )}
            </p>
          </div>
          <Button variant='outline' size='sm' render={<Link to='/pricing' />}>
            {t('View Pricing')}
          </Button>
        </div>

        <div className='mt-10 grid grid-cols-1 gap-6 md:grid-cols-3'>
          {models.map((model, i) => {
            const tokenBased = isTokenBasedModel(model)
            return (
              <AnimateInView
                key={model.id}
                delay={i * 100}
                animation='fade-up'
                className='border-border overflow-hidden rounded-xl border'
              >
                {/* Decorative card head: canvas-dot texture on a secondary
                    panel, centered mono model name — no image asset. */}
                <div className='bg-secondary flex h-24 items-center justify-center bg-[radial-gradient(var(--canvas-dot)_1.5px,transparent_1.5px)] bg-[size:16px_16px] px-4'>
                  <span className='text-foreground truncate font-mono text-sm font-semibold'>
                    {model.model_name}
                  </span>
                </div>
                <div className='divide-border divide-y px-5'>
                  {tokenBased ? (
                    <>
                      <div className='flex items-center justify-between py-3 text-sm'>
                        <span className='text-muted-foreground'>
                          {t('Input')}
                        </span>
                        <span className='text-foreground font-mono text-sm tabular-nums'>
                          {formatPrice(model, 'input', DEFAULT_TOKEN_UNIT)}
                        </span>
                      </div>
                      <div className='flex items-center justify-between py-3 text-sm'>
                        <span className='text-muted-foreground'>
                          {t('Output')}
                        </span>
                        <span className='text-foreground font-mono text-sm tabular-nums'>
                          {formatPrice(model, 'output', DEFAULT_TOKEN_UNIT)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className='flex items-center justify-between py-3 text-sm'>
                      <span className='text-muted-foreground'>
                        {t('Price')}
                      </span>
                      <span className='text-foreground font-mono text-sm tabular-nums'>
                        {formatRequestPrice(model)} / {t('request')}
                      </span>
                    </div>
                  )}
                </div>
              </AnimateInView>
            )
          })}
        </div>
      </div>
    </section>
  )
}

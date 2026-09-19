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
import { Quote } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const TESTIMONIALS = [
  {
    quote:
      'After switching, our API success rate jumped from 97% to 99.8%. The intelligent failover handles channel instability automatically — no more managing multiple keys manually.',
    name: 'Zhang Wei',
    role: 'Backend Lead @ AI Startup',
  },
  {
    quote:
      'We used to maintain three separate SDKs. Now everything goes through one endpoint. Just changed base_url and we were done — saved weeks of duplicated code.',
    name: 'Li Ming',
    role: 'Independent Developer',
  },
  {
    quote:
      'The billing system is exactly what our multi-tenant SaaS needed. Per-model, per-group quotas out of the box. No need to build it ourselves.',
    name: 'Wang Jun',
    role: 'CTO @ B2B SaaS Platform',
  },
]

export function Testimonials() {
  const { t } = useTranslation()

  return (
    <section className='w-full px-6 py-16 md:px-8 md:py-24'>
      <div className='mb-12 text-center'>
        <h2 className='text-2xl font-bold tracking-tight md:text-3xl'>
          {t('Trusted by Developers')}
        </h2>
        <p className='text-muted-foreground mt-2 text-sm md:text-base'>
          {t('What our users are saying')}
        </p>
      </div>

      <div className='grid grid-cols-1 gap-6 md:grid-cols-3'>
        {TESTIMONIALS.map((item) => (
          <figure
            key={item.name}
            className='border-border/60 bg-card flex flex-col rounded-xl border p-6'
          >
            <Quote className='text-brand/30 size-7' />
            <blockquote className='text-muted-foreground mt-4 flex-1 text-sm leading-relaxed'>
              {t(item.quote)}
            </blockquote>
            <figcaption className='mt-6 flex items-center gap-3'>
              <span className='bg-brand/10 text-brand flex size-9 items-center justify-center rounded-full text-sm font-semibold'>
                {item.name.charAt(0)}
              </span>
              <div>
                <div className='text-foreground text-sm font-semibold'>
                  {item.name}
                </div>
                <div className='text-muted-foreground text-xs'>
                  {t(item.role)}
                </div>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}

/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useTranslation } from 'react-i18next'

import { ProviderLogoRail } from './provider-logos'

export function LandingFoundation() {
  const { t } = useTranslation()

  return (
    <section className='border-border bg-background border-b'>
      <div className='mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12 xl:px-16'>
        <p className='text-muted-foreground py-5 text-center text-[10px] font-semibold tracking-[0.2em] uppercase'>
          {t('Compatible interfaces')}
        </p>
        <ProviderLogoRail />
      </div>
    </section>
  )
}

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
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

type LandingActionsProps = {
  isAuthenticated: boolean
}

export function LandingActions(props: LandingActionsProps) {
  const { t } = useTranslation()
  const primaryClassName = 'bg-[#ed5b20] text-[#141413] hover:bg-[#f06b37]'

  return (
    <div className='flex flex-col gap-3 sm:flex-row'>
      {props.isAuthenticated ? (
        <Button
          size='lg'
          className={`${primaryClassName} transition-[color,background-color,transform] active:scale-[0.96]`}
          render={<Link to='/dashboard' />}
        >
          {t('Go to Dashboard')}
          <ArrowRight aria-hidden='true' />
        </Button>
      ) : (
        <Button
          size='lg'
          className={`${primaryClassName} transition-[color,background-color,transform] active:scale-[0.96]`}
          render={<Link to='/sign-up' />}
        >
          {t('Get Started')}
          <ArrowRight aria-hidden='true' />
        </Button>
      )}
      <Button
        size='lg'
        variant='outline'
        className='bg-background/75 backdrop-blur-sm transition-[color,background-color,transform] active:scale-[0.96]'
        render={<Link to='/pricing' />}
      >
        {t('Browse Models')}
      </Button>
    </div>
  )
}

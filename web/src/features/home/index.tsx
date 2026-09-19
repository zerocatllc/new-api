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
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { Footer } from '@/components/layout/components/footer'
import { LoadingState } from '@/components/loading-state'
import { Markdown } from '@/components/ui/markdown'
import { useAuthStore } from '@/stores/auth-store'

import {
  AnnouncementBanner,
  CodeShowcase,
  ProviderMarquee,
  WhyChooseUs,
} from './components'
import { LandingExperience } from './components/landing/landing-experience'
import { useHomePageContent } from './hooks'
import { useHomeSections } from './hooks/use-home-sections'

export function Home() {
  const { t } = useTranslation()
  const { auth } = useAuthStore()
  const isAuthenticated = !!auth.user
  const { content, isLoaded, isUrl } = useHomePageContent()
  const { banner } = useHomeSections()

  // Landing announcement strip (rendered inside the sticky header): only a
  // real backend banner shows one; without it the header stays a single row.
  const landingAnnouncement = banner
    ? {
        content: banner.content,
        linkText: banner.linkText,
        linkUrl: banner.linkUrl,
      }
    : undefined

  if (!isLoaded) {
    return (
      <PublicLayout showMainContainer={false}>
        {/* Cold cache: the splash retires once the router is idle, so a slow
            content fetch needs its own brand loading state or the page sits
            blank under the header. */}
        <main aria-busy='true' className='min-h-screen'>
          <LoadingState size='lg' className='min-h-[60vh]' />
        </main>
      </PublicLayout>
    )
  }

  // Admin-authored custom home content (Markdown or iframe URL) takes over the
  // whole page when present, matching rixapi's homepage_content behavior.
  if (content) {
    return (
      <PublicLayout showMainContainer={false}>
        <AnnouncementBanner />
        <main className='overflow-x-hidden'>
          {isUrl ? (
            <iframe
              src={content}
              className='h-screen w-full border-none'
              title={t('Custom Home Page')}
              sandbox='allow-forms allow-popups allow-popups-to-escape-sandbox allow-scripts'
            />
          ) : (
            <div className='container mx-auto py-8'>
              <Markdown className='custom-home-content'>{content}</Markdown>
            </div>
          )}
        </main>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout
      showMainContainer={false}
      headerProps={{
        variant: 'landing',
        announcement: landingAnnouncement,
        // Logo, site name and nav links all come from the backend
        // (systemLogo / systemName / useTopNavLinks) — nothing hardcoded here.
      }}
    >
      <main data-landing-variant='signal' className='overflow-x-clip'>
        <LandingExperience isAuthenticated={isAuthenticated} />
        <div className='divide-border divide-y'>
          <ProviderMarquee />
          <WhyChooseUs />
          <CodeShowcase isAuthenticated={isAuthenticated} />
        </div>
      </main>
      <Footer />
    </PublicLayout>
  )
}

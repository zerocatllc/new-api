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
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { LanguageSwitcher } from '@/components/language-switcher'
import { NotificationPopover } from '@/components/notification-popover'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SystemUpdateAction } from '@/features/system-update/system-update-action'
import { useNotifications } from '@/hooks/use-notifications'
import { useSystemConfig } from '@/hooks/use-system-config'
import { useTopNavLinks } from '@/hooks/use-top-nav-links'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { defaultTopNavLinks } from '../config/top-nav.config'
import type { TopNavLink } from '../types'
import { HeaderLogo } from './header-logo'

const AUTH_PROMPT_SECONDS = 5
const ANNOUNCEMENT_COLLAPSE_SCROLL_Y = 80
const ANNOUNCEMENT_EXPAND_SCROLL_Y = 8

type AuthPromptTarget = {
  title: string
  href: string
}

export interface PublicHeaderProps {
  navLinks?: TopNavLink[]
  mobileLinks?: TopNavLink[]
  navContent?: React.ReactNode
  showThemeSwitch?: boolean
  showLanguageSwitcher?: boolean
  logo?: React.ReactNode
  siteName?: string
  homeUrl?: string
  leftContent?: React.ReactNode
  rightContent?: React.ReactNode
  showNavigation?: boolean
  showAuthButtons?: boolean
  showNotifications?: boolean
  /**
   * `app` (default) is the product chrome: centered command search, nav links
   * + currency on the right. `landing` is the marketing header matching
   * landing-test: left-aligned nav after the logo, no center search, hairline
   * bottom border, and outline/ink auth pills on the right. Scoped to the home
   * page so other public pages keep search and currency.
   */
  variant?: 'app' | 'landing'
  /**
   * Slim marketing strip rendered above the nav row in the landing header
   * (matches landing-test). Only used when variant is `landing`.
   */
  announcement?: { content: string; linkText?: string; linkUrl?: string }
  className?: string
}

function renderHeaderBrandLogo({
  loading,
  customLogo,
  systemLogo,
  logoLoaded,
}: {
  loading: boolean
  customLogo?: React.ReactNode
  systemLogo: string
  logoLoaded: boolean
}) {
  if (loading) {
    return <Skeleton className='size-full rounded-lg' />
  }
  if (customLogo) {
    return customLogo
  }
  return (
    <HeaderLogo
      src={systemLogo}
      loading={loading}
      logoLoaded={logoLoaded}
      className='size-full object-contain'
    />
  )
}

function renderHeaderAuthAction({
  loading,
  isAuthenticated,
  isLanding,
  t,
}: {
  loading: boolean
  isAuthenticated: boolean
  isLanding: boolean
  t: (key: string) => string
}) {
  if (loading) {
    return <Skeleton className='h-8 w-20 rounded-lg' />
  }
  if (isAuthenticated) {
    return <ProfileDropdown />
  }
  if (isLanding) {
    // Landing keeps a single auth entry (Sign in) in the header; the
    // primary "Get Started" call-to-action lives in the Hero so the
    // two are not duplicated.
    return (
      <div className='hidden items-center gap-2 lg:flex'>
        <Button
          variant='outline'
          size='sm'
          className='h-8 rounded-md'
          render={<Link to='/sign-in' />}
        >
          {t('Sign in')}
        </Button>
      </div>
    )
  }
  return (
    <Link
      to='/sign-in'
      className='text-foreground/80 hover:text-foreground hidden px-2 py-1.5 text-[13px] font-medium transition-colors duration-200 lg:inline-block'
    >
      {t('Sign in')}
    </Link>
  )
}

export function PublicHeader(props: PublicHeaderProps) {
  const {
    navLinks = defaultTopNavLinks,
    showThemeSwitch = true,
    showLanguageSwitcher = true,
    logo: customLogo,
    siteName: customSiteName,
    homeUrl = '/',
    showAuthButtons = true,
    showNotifications = true,
    variant = 'app',
    announcement,
  } = props
  const isLanding = variant === 'landing'

  const { t } = useTranslation()
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [authPromptTarget, setAuthPromptTarget] =
    useState<AuthPromptTarget | null>(null)
  const [authPromptSecondsLeft, setAuthPromptSecondsLeft] =
    useState(AUTH_PROMPT_SECONDS)
  const { auth } = useAuthStore()
  const {
    systemName,
    logo: systemLogo,
    loading,
    logoLoaded,
  } = useSystemConfig()
  const dynamicLinks = useTopNavLinks()
  const routerState = useRouterState()
  const pathname = routerState.location.pathname
  // The hairline frame + marketing strip belong to the home page only; other
  // landing pages (rankings, pricing, about) get a clean solid header.
  const isHome = isLanding && pathname === '/'
  const hasCollapsibleAnnouncement = isHome && Boolean(announcement)
  const notifications = useNotifications()
  const headerRef = useRef<HTMLElement>(null)
  const [headerHeight, setHeaderHeight] = useState(64)

  const user = auth.user
  const isAuthenticated = !!user
  const displaySiteName = customSiteName || systemName
  // Both the app and landing headers use the backend's nav (useTopNavLinks);
  // the prop navLinks is only a fallback for when the backend returns none.
  const links = dynamicLinks.length > 0 ? dynamicLinks : navLinks

  useEffect(() => {
    const onScroll = () => {
      if (!hasCollapsibleAnnouncement) {
        setScrolled(window.scrollY > 20)
        return
      }

      setScrolled((isCollapsed) => {
        if (isCollapsed) {
          return window.scrollY > ANNOUNCEMENT_EXPAND_SCROLL_Y
        }
        return window.scrollY > ANNOUNCEMENT_COLLAPSE_SCROLL_Y
      })
    }

    setScrolled(
      window.scrollY >
        (hasCollapsibleAnnouncement ? ANNOUNCEMENT_COLLAPSE_SCROLL_Y : 20)
    )
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [hasCollapsibleAnnouncement])

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  useEffect(() => {
    if (!mobileOpen) return

    const header = headerRef.current
    if (!header) return

    const updateHeaderHeight = () => {
      setHeaderHeight(header.getBoundingClientRect().height)
    }

    updateHeaderHeight()
    const observer = new ResizeObserver(updateHeaderHeight)
    observer.observe(header)
    return () => observer.disconnect()
  }, [mobileOpen])

  const toggleMobileMenu = useCallback(() => {
    if (!mobileOpen && headerRef.current) {
      setHeaderHeight(headerRef.current.getBoundingClientRect().height)
    }
    setMobileOpen((isOpen) => !isOpen)
  }, [mobileOpen])

  useEffect(() => {
    if (!authPromptTarget) return

    const intervalId = window.setInterval(() => {
      setAuthPromptSecondsLeft((seconds) => Math.max(seconds - 1, 0))
    }, 1000)

    const timeoutId = window.setTimeout(() => {
      const redirect = authPromptTarget.href
      setAuthPromptTarget(null)
      navigate({ to: '/sign-in', search: { redirect } })
    }, AUTH_PROMPT_SECONDS * 1000)

    return () => {
      window.clearInterval(intervalId)
      window.clearTimeout(timeoutId)
    }
  }, [authPromptTarget, navigate])

  const closeAuthPrompt = useCallback(() => {
    setAuthPromptTarget(null)
    setAuthPromptSecondsLeft(AUTH_PROMPT_SECONDS)
  }, [])

  const navigateToSignIn = useCallback(() => {
    const redirect = authPromptTarget?.href || '/'
    setAuthPromptTarget(null)
    navigate({ to: '/sign-in', search: { redirect } })
  }, [authPromptTarget?.href, navigate])

  const handleNavLinkClick = useCallback(
    (
      event: React.MouseEvent<HTMLAnchorElement>,
      link: TopNavLink,
      closeMobile = false
    ) => {
      if (link.disabled) {
        event.preventDefault()
        return
      }

      if (link.requiresAuth) {
        event.preventDefault()
        if (closeMobile) {
          setMobileOpen(false)
        }
        setAuthPromptSecondsLeft(AUTH_PROMPT_SECONDS)
        setAuthPromptTarget({
          title: link.title,
          href: link.href,
        })
        return
      }

      if (closeMobile) {
        setMobileOpen(false)
      }
    },
    []
  )

  // Desktop nav links — rendered on the right for the app header, or inline
  // after the logo for the landing header.
  const navLinksEl = (
    <div className='hidden items-center gap-0.5 lg:flex'>
      {links.map((link) => {
        const isActive = pathname === link.href
        if (link.external) {
          return (
            <a
              key={link.href}
              href={link.href}
              target='_blank'
              rel='noopener noreferrer'
              aria-disabled={link.disabled}
              tabIndex={link.disabled ? -1 : undefined}
              onClick={(event) => handleNavLinkClick(event, link)}
              className={cn(
                'text-muted-foreground hover:text-foreground inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors duration-200',
                link.disabled && 'pointer-events-none opacity-50'
              )}
            >
              {link.title}
            </a>
          )
        }
        return (
          <Link
            key={link.href}
            to={link.href}
            disabled={link.disabled}
            onClick={(event) => handleNavLinkClick(event, link)}
            className={cn(
              'inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors duration-200',
              isActive
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground',
              link.disabled && 'pointer-events-none opacity-50'
            )}
          >
            {link.title}
          </Link>
        )
      })}
    </div>
  )

  return (
    <>
      <header
        ref={headerRef}
        className={cn(
          'bg-background/95 z-50 backdrop-blur-md transition-shadow',
          isLanding
            ? 'sticky top-0'
            : 'border-border fixed inset-x-0 top-0 h-16 border-b',
          // App header gets a subtle shadow on scroll; the landing header relies
          // on its hairline border-b alone (matching the Kimi reference, which
          // has no shadow — a shadow reads as a second line under the border).
          !isLanding && scrolled && 'shadow-sm'
        )}
      >
        {/* Landing header spans the full viewport like the page body (Kimi
            reference: no width cap); the nav row's own padding provides the
            gutters. App header stays a plain full-width bar — the wrappers
            are no-ops. */}
        <div className={cn(isLanding && 'w-full')}>
          <div
            className={cn(
              // Solid hairline under the header, mirroring the Kimi reference
              // (no side rails, no dashed blueprint lines).
              isLanding && 'border-border border-b'
            )}
          >
            <div
              className={cn(
                'relative flex h-16 items-center gap-3 sm:gap-4',
                // Landing fills the framed rail width with the same inset as the
                // body sections (px-6 md:px-8), so the logo lines up with the page
                // content edge instead of sitting in a centered max-w-6xl gutter.
                isLanding
                  ? 'mx-auto w-full max-w-[1440px] px-6 md:px-8'
                  : 'px-4'
              )}
            >
              {/* Left: logo + divider */}
              <div className='@container/system-brand flex items-center gap-2'>
                <Link
                  to={homeUrl}
                  className={cn(
                    'flex shrink-0 items-center gap-2 transition-opacity hover:opacity-80',
                    // Landing: no left padding so the logo glyph sits flush at the
                    // content edge (x≈150), aligning with the footer brand and the
                    // section content. App header keeps symmetric px-2.
                    isLanding ? 'pr-2' : 'px-2'
                  )}
                >
                  <div className='flex size-8 shrink-0 items-center justify-center'>
                    {renderHeaderBrandLogo({
                      loading,
                      customLogo,
                      systemLogo,
                      logoLoaded,
                    })}
                  </div>
                  <span
                    className={cn(
                      'tracking-tight',
                      isLanding
                        ? 'font-serif text-lg font-medium'
                        : 'text-sm font-semibold'
                    )}
                  >
                    {loading ? (
                      <Skeleton className='h-4 w-16' />
                    ) : (
                      displaySiteName
                    )}
                  </span>
                </Link>
                <SystemUpdateAction presentation='version' />
                {!isLanding && (
                  <div className='bg-border mr-2 hidden h-4 w-px md:block' />
                )}
              </div>

              {/* Center: spacer. The command palette is console-only and this
              header also renders for signed-out visitors, so it must not reach
              the search context at all. */}
              <div className='flex-1' />

              {/* Right: nav links + currency + language + theme + notifications + profile */}
              <div className='ml-auto flex shrink-0 items-center gap-1'>
                {/* Both variants keep nav on the right (Kimi order: logo alone
                on the left, nav + auth clustered right); landing drops currency
                for a cleaner marketing bar. */}
                {navLinksEl}
                {isLanding && (
                  <div className='bg-border/60 mx-2 hidden h-4 w-px lg:block' />
                )}

                {!isLanding && (
                  <div className='bg-border/40 mx-1 hidden h-4 w-px lg:block' />
                )}

                {showLanguageSwitcher && <LanguageSwitcher />}
                {showThemeSwitch && <ThemeSwitch />}
                {showNotifications && (
                  <NotificationPopover
                    open={notifications.popoverOpen}
                    onOpenChange={notifications.setPopoverOpen}
                    unreadCount={notifications.unreadCount}
                    activeTab={notifications.activeTab}
                    onTabChange={notifications.setActiveTab}
                    notice={notifications.notice}
                    announcements={notifications.announcements}
                    loading={notifications.loading}
                  />
                )}

                {showAuthButtons &&
                  renderHeaderAuthAction({
                    loading,
                    isAuthenticated,
                    isLanding,
                    t,
                  })}

                {/* Mobile hamburger */}
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='size-9 lg:hidden'
                  onClick={toggleMobileMenu}
                  aria-label={t('Toggle navigation menu')}
                >
                  <div className='relative size-4'>
                    <span
                      className={cn(
                        'absolute inset-x-0 block h-[1.5px] origin-center rounded-full bg-current transition-all duration-300',
                        mobileOpen ? 'top-[7px] rotate-45' : 'top-[3px]'
                      )}
                    />
                    <span
                      className={cn(
                        'absolute inset-x-0 top-[7px] block h-[1.5px] rounded-full bg-current transition-all duration-300',
                        mobileOpen ? 'scale-x-0 opacity-0' : 'opacity-100'
                      )}
                    />
                    <span
                      className={cn(
                        'absolute inset-x-0 block h-[1.5px] origin-center rounded-full bg-current transition-all duration-300',
                        mobileOpen ? 'top-[7px] -rotate-45' : 'top-[11px]'
                      )}
                    />
                  </div>
                </Button>
              </div>
            </div>
            {/* Landing: slim marketing strip BELOW the nav row (Kimi order:
                header first, announcement second). Collapses away on scroll so
                only the nav row stays stuck. */}
            {isHome && announcement && (
              <div
                className={cn(
                  'overflow-hidden transition-all duration-300 ease-out',
                  scrolled ? 'max-h-0 opacity-0' : 'max-h-16 opacity-100'
                )}
              >
                <div className='border-border text-muted-foreground border-t px-4 py-2.5 text-center text-sm'>
                  <div className='mx-auto flex max-w-6xl items-center justify-center gap-2'>
                    <span className='leading-relaxed'>
                      {announcement.content}
                    </span>
                    {announcement.linkUrl && (
                      <a
                        href={announcement.linkUrl}
                        className='font-medium text-[var(--brand)] underline-offset-2 hover:underline'
                      >
                        {announcement.linkText || announcement.linkUrl}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile full-screen overlay */}
      <div
        className={cn(
          'bg-background/98 fixed inset-0 z-40 backdrop-blur-2xl transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] lg:pointer-events-none lg:hidden',
          mobileOpen
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0'
        )}
      >
        <div
          className='flex h-full flex-col justify-between px-8 pb-10'
          style={{ paddingTop: isLanding ? headerHeight : '5rem' }}
        >
          <nav className='flex flex-col gap-1'>
            {links.map((link, i) => {
              const isActive = pathname === link.href
              const linkClassName = cn(
                'flex items-center gap-3 py-3 text-base font-medium tracking-tight transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
                mobileOpen
                  ? 'translate-y-0 opacity-100'
                  : 'translate-y-4 opacity-0',
                isActive ? 'text-foreground' : 'text-muted-foreground',
                link.disabled && 'pointer-events-none opacity-50'
              )
              const transitionStyle = {
                transitionDelay: mobileOpen ? `${100 + i * 50}ms` : '0ms',
              }
              if (link.external) {
                return (
                  <a
                    key={link.href}
                    href={link.href}
                    target='_blank'
                    rel='noopener noreferrer'
                    aria-disabled={link.disabled}
                    tabIndex={link.disabled ? -1 : undefined}
                    onClick={(event) => handleNavLinkClick(event, link, true)}
                    className={linkClassName}
                    style={transitionStyle}
                  >
                    {link.title}
                  </a>
                )
              }
              return (
                <Link
                  key={link.href}
                  to={link.href}
                  disabled={link.disabled}
                  onClick={(event) => handleNavLinkClick(event, link, true)}
                  className={linkClassName}
                  style={transitionStyle}
                >
                  {link.title}
                </Link>
              )
            })}
          </nav>

          <div
            className={cn(
              'flex flex-col gap-3 transition-all duration-500',
              mobileOpen
                ? 'translate-y-0 opacity-100'
                : 'translate-y-4 opacity-0'
            )}
            style={{ transitionDelay: mobileOpen ? '250ms' : '0ms' }}
          >
            {showAuthButtons && (
              <Link
                to={isAuthenticated ? '/dashboard' : '/sign-in'}
                onClick={() => setMobileOpen(false)}
                className='bg-foreground text-background inline-flex h-10 items-center justify-center rounded-lg text-sm font-medium transition-opacity hover:opacity-90 active:opacity-80'
              >
                {isAuthenticated ? t('Go to Dashboard') : t('Sign in')}
              </Link>
            )}
          </div>
        </div>
      </div>

      <Dialog
        open={!!authPromptTarget}
        onOpenChange={(open) => {
          if (!open) {
            closeAuthPrompt()
          }
        }}
        title={t('Sign in required')}
        description={t('Please sign in to view {{module}}.', {
          module: authPromptTarget?.title || '',
        })}
        contentClassName='sm:max-w-md'
        contentHeight='auto'
        footer={
          <>
            <Button variant='outline' onClick={closeAuthPrompt}>
              {t('Cancel')}
            </Button>
            <Button onClick={navigateToSignIn}>{t('Sign in now')}</Button>
          </>
        }
      >
        <div className='bg-muted/40 text-muted-foreground rounded-lg px-3 py-2 text-sm'>
          {t('Redirecting to sign in in {{seconds}} seconds.', {
            seconds: authPromptSecondsLeft,
          })}
        </div>
      </Dialog>
    </>
  )
}

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
import i18next from 'i18next'
import { useMemo } from 'react'

import { useStatus } from '@/hooks/use-status'

/**
 * Home page sections are driven by the backend `/api/status` payload, so
 * nothing on the landing page is hardcoded:
 *  - `banner`             -> dismissible announcement bar
 *  - `homepage_slideshow` -> hero promo carousel
 *
 * Field names are read defensively and bilingual variants (`*_en` / `*En`)
 * are selected by the active i18n language.
 */

export type BannerTheme = 'default' | 'info' | 'success' | 'warning' | 'error'

export interface AnnouncementBanner {
  content: string
  icon: string
  linkText: string
  linkUrl: string
  theme: BannerTheme
  closable: boolean
}

export interface HeroSlide {
  id: string
  title: string
  description: string
  image: string
  video: string
  buttonLabel: string
  buttonUrl: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Pick a localized string, preferring the English variant when active. */
function localized(
  record: Record<string, unknown>,
  base: string,
  isEn: boolean
): string {
  const enKeys = [`${base}_en`, `${base}En`]
  if (isEn) {
    for (const key of enKeys) {
      const v = str(record[key])
      if (v) return v
    }
  }
  return str(record[base])
}

function parseBanner(raw: unknown, isEn: boolean): AnnouncementBanner | null {
  const record = asRecord(raw)
  if (record.enabled !== true) return null

  const content = localized(record, 'content', isEn)
  if (!content) return null

  const theme = str(record.theme) as BannerTheme
  return {
    content,
    icon: str(record.icon),
    linkText: localized(record, 'link_text', isEn),
    linkUrl: str(record.link_url),
    theme: (
      ['default', 'info', 'success', 'warning', 'error'] as const
    ).includes(theme as BannerTheme)
      ? theme
      : 'default',
    closable: record.closable === true,
  }
}

function parseSlides(raw: unknown, isEn: boolean): HeroSlide[] {
  if (!Array.isArray(raw)) return []

  return raw
    .map(asRecord)
    .filter((slide) => slide.enabled !== false)
    .map((slide, index) => {
      const media = str(slide.media)
      const mediaType = str(slide.mediaType) || str(slide.media_type)
      const legacyImage =
        str(slide.image) || str(slide.image_url) || str(slide.imageUrl)
      const legacyVideo =
        str(slide.video) || str(slide.video_url) || str(slide.videoUrl)
      return {
        id: str(slide.id) || String(index),
        title: localized(slide, 'title', isEn),
        description: localized(slide, 'description', isEn),
        image: mediaType === 'image' && media ? media : legacyImage,
        video: mediaType === 'video' && media ? media : legacyVideo,
        buttonLabel:
          localized(slide, 'button_label', isEn) ||
          localized(slide, 'buttonLabel', isEn),
        buttonUrl: str(slide.button_url) || str(slide.buttonUrl),
      }
    })
    .filter((slide) => slide.image || slide.video || slide.title)
}

export function useHomeSections(): {
  banner: AnnouncementBanner | null
  slides: HeroSlide[]
} {
  const { status } = useStatus()
  const language = i18next.language

  return useMemo(() => {
    const record = asRecord(status)
    const isEn = (language || '').toLowerCase().startsWith('en')
    return {
      banner: parseBanner(record.banner, isEn),
      slides: parseSlides(record.homepage_slideshow, isEn),
    }
  }, [status, language])
}

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
import i18n, { type BackendModule, type ReadCallback } from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import { convertDetectedLanguage, toIntlLocale } from './languages'
import en from './locales/en.json'
import zhCN from './locales/zh.json'

// Only the primary locales are bundled into the entry chunk. The other five
// (~2 MB raw JSON) previously shipped in the first-paint bundle even though
// `load: 'currentOnly'` activates just one — they now load on demand.
export const resources = {
  en,
  zhCN,
} as const

type LocaleModule = { default: { translation: Record<string, string> } }

const lazyLocales: Record<string, () => Promise<LocaleModule>> = {
  fr: () => import('./locales/fr.json'),
  ru: () => import('./locales/ru.json'),
  ja: () => import('./locales/ja.json'),
  vi: () => import('./locales/vi.json'),
  zhTW: () => import('./locales/zh-TW.json'),
}

// Custom backend: pulls non-bundled locales via dynamic import. With
// `partialBundledLanguages`, i18next serves en/zhCN from the bundle and routes
// the rest through this backend, so every `changeLanguage` call site (switcher,
// profile, auth redirect) and the initial language detection transparently wait
// for the locale chunk — no per-call-site changes needed.
const lazyBackend: BackendModule = {
  type: 'backend',
  init: () => {},
  read: async (
    language: string,
    _namespace: string,
    callback: ReadCallback
  ) => {
    const loader = lazyLocales[language]
    if (!loader) {
      callback(null, {})
      return
    }
    try {
      const mod = await loader()
      callback(null, mod.default.translation)
    } catch (error) {
      callback(error as Error, null)
    }
  },
}

// Keep the document language in sync for screen readers and spell checkers;
// index.html only ships a static lang="en".
i18n.on('languageChanged', (language) => {
  if (typeof document === 'undefined') return
  document.documentElement.lang = toIntlLocale(language) ?? 'en'
})

export const i18nReady = i18n
  .use(lazyBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    partialBundledLanguages: true,
    fallbackLng: 'en',
    supportedLngs: ['en', 'zhCN', 'fr', 'ru', 'ja', 'vi', 'zhTW'],
    load: 'currentOnly',
    nsSeparator: false, // Allow literal colons in keys (e.g., URLs, labels)
    debug: import.meta.env.DEV,
    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      // Browsers report `zh-CN`/`zh-TW`/`zh`; map them onto our `zhCN`/`zhTW`
      // codes (non-Chinese codes pass through for normal supportedLngs matching).
      convertDetectedLanguage,
    },
  })

export default i18n

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
/* Single source of truth for the theme cookie name. Imported by the theme
 * provider at runtime AND by rsbuild.config.ts at build time, which injects
 * it into index.html's pre-paint theme script — keep this module free of
 * browser/React imports so the node-side config can load it. */
export const THEME_COOKIE_NAME = 'vite-ui-theme'

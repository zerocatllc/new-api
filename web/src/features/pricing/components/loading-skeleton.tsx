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
import { LoadingState } from '@/components/loading-state'

import type { ViewMode } from '../constants'

export interface LoadingSkeletonProps {
  viewMode?: ViewMode
}

/* Page-level load for the pricing catalog. The real page is a hero +
 * sidebar/content split that a mock skeleton kept drifting away from, so it
 * shows the brand loading treatment instead of a shape imitation. */
export function LoadingSkeleton(_props: LoadingSkeletonProps) {
  return <LoadingState size='lg' className='min-h-[60vh]' />
}

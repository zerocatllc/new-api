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
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import { formatLocalCurrencyAmount } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import { DEFAULT_DISCOUNT_RATE } from '../../constants'
import { getPaymentIcon } from '../../lib'
import type { PaymentMethod } from '../../types'

interface PaymentConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  topupAmount: number
  paymentAmount: number
  paymentMethod: PaymentMethod | undefined
  paymentMethods?: PaymentMethod[]
  onSelectMethod?: (method: PaymentMethod) => void
  calculating: boolean
  processing: boolean
  discountRate?: number
}

export function PaymentConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  topupAmount,
  paymentAmount,
  paymentMethod,
  paymentMethods,
  onSelectMethod,
  calculating,
  processing,
  discountRate = DEFAULT_DISCOUNT_RATE,
}: PaymentConfirmDialogProps) {
  const { t } = useTranslation()
  const hasDiscount = discountRate > 0 && discountRate < 1 && paymentAmount > 0
  // "You save" = the pre-discount price minus what you actually pay, both in the
  // payment currency. The backend computes payMoney = credit * price *
  // groupRatio * discountRate, so paymentAmount already has the discount baked
  // in and the pre-discount price is paymentAmount / discountRate. (Subtracting
  // topupAmount here would be wrong: it is in credit/quota units, not the
  // payment currency, so the two are not comparable.)
  const discountAmount = hasDiscount
    ? paymentAmount / discountRate - paymentAmount
    : 0
  // Single money formatter so every amount in the dialog carries the same
  // currency symbol (the previous mix of formatCurrency/formatLocalCurrencyAmount
  // showed "99" next to "¥100" in the same box).
  const fmtAmount = (value: number) =>
    formatLocalCurrencyAmount(value, {
      digitsLarge: 2,
      digitsSmall: 2,
      abbreviate: false,
    })

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className='max-sm:w-[calc(100vw-1.5rem)] sm:max-w-md'>
        <AlertDialogHeader>
          <AlertDialogTitle className='text-xl font-semibold'>
            {t('Select payment method')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('Recharge Quota')}{' '}
            <span className='text-foreground font-medium tabular-nums'>
              {formatNumber(topupAmount)}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className='space-y-4 py-2'>
          {/* Payment method selection (reference: choose inside the dialog) */}
          {paymentMethods && paymentMethods.length > 0 ? (
            <RadioGroup
              value={paymentMethod?.type ?? ''}
              onValueChange={(value) => {
                const next = paymentMethods.find((m) => m.type === value)
                if (next) onSelectMethod?.(next)
              }}
              className='grid gap-3'
            >
              {paymentMethods.map((method) => {
                const selected = method.type === paymentMethod?.type
                const disabled = (method.min_topup ?? 0) > topupAmount
                return (
                  <Label
                    key={method.type}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors',
                      selected ? 'border-primary bg-accent' : 'hover:bg-accent',
                      disabled && 'cursor-not-allowed opacity-50'
                    )}
                  >
                    <RadioGroupItem value={method.type} disabled={disabled} />
                    {getPaymentIcon(
                      method.type,
                      'h-6 w-6',
                      method.icon,
                      method.name
                    )}
                    <span className='flex-1 text-sm font-medium'>
                      {method.name}
                    </span>
                    {selected &&
                      (calculating ? (
                        <Skeleton className='h-5 w-16' />
                      ) : (
                        <span className='text-muted-foreground text-sm tabular-nums'>
                          {fmtAmount(paymentAmount)}
                        </span>
                      ))}
                  </Label>
                )
              })}
            </RadioGroup>
          ) : (
            <div className='flex items-center gap-3 rounded-lg border p-3'>
              {getPaymentIcon(
                paymentMethod?.type,
                'h-6 w-6',
                paymentMethod?.icon,
                paymentMethod?.name
              )}
              <span className='flex-1 text-sm font-medium'>
                {paymentMethod?.name}
              </span>
              {calculating ? (
                <Skeleton className='h-5 w-16' />
              ) : (
                <span className='text-muted-foreground text-sm tabular-nums'>
                  {fmtAmount(paymentAmount)}
                </span>
              )}
            </div>
          )}

          {/* Payment breakdown */}
          <div className='bg-muted space-y-1.5 rounded-lg px-4 py-3 text-xs'>
            <div className='flex items-center justify-between'>
              <span className='text-muted-foreground'>
                {t('Actual Payment Amount')}
              </span>
              <span className='font-semibold tabular-nums'>
                {fmtAmount(paymentAmount)}
              </span>
            </div>
            <div className='flex items-center justify-between'>
              <span className='text-muted-foreground'>
                {t('Estimated Credit')}
              </span>
              <span className='tabular-nums'>{formatNumber(topupAmount)}</span>
            </div>
            <div className='flex items-center justify-between'>
              <span className='text-muted-foreground'>{t('Handling Fee')}</span>
              <span className='tabular-nums'>{fmtAmount(0)}</span>
            </div>
            {hasDiscount && !calculating && (
              <div className='flex items-center justify-between'>
                <span className='text-muted-foreground'>{t('You save')}</span>
                <span className='font-semibold text-green-600 tabular-nums'>
                  {fmtAmount(discountAmount)}
                </span>
              </div>
            )}
          </div>
        </div>

        <AlertDialogFooter className='grid grid-cols-2 gap-2 sm:flex'>
          <AlertDialogCancel disabled={processing}>
            {t('Cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={processing || calculating}
          >
            {processing && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {t('Confirm and Pay')} {fmtAmount(paymentAmount)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

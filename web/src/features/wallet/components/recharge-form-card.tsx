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
import {
  ExternalLink,
  Landmark,
  Loader2,
  Receipt,
  WalletCards,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TitledCard } from '@/components/ui/titled-card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import {
  formatCurrency,
  getDiscountLabel,
  getEffectivePayMethods,
  getPaymentIcon,
  getMinTopupAmount,
  calculatePresetPricing,
} from '../lib'
import type {
  PresetAmount,
  TopupInfo,
  CreemProduct,
  WaffoPayMethod,
} from '../types'
import { CreemProductsSection } from './creem-products-section'

interface RechargeFormCardProps {
  topupInfo: TopupInfo | null
  presetAmounts: PresetAmount[]
  selectedPreset: number | null
  onSelectPreset: (preset: PresetAmount) => void
  topupAmount: number
  onTopupAmountChange: (amount: number) => void
  paymentAmount: number
  calculating: boolean
  onContinuePayment: () => void
  continueProcessing?: boolean
  paymentLoading: string | null
  redemptionCode: string
  onRedemptionCodeChange: (code: string) => void
  onRedeem: () => void
  redeeming: boolean
  topupLink?: string
  loading?: boolean
  priceRatio?: number
  usdExchangeRate?: number
  onOpenBilling?: () => void
  creemProducts?: CreemProduct[]
  enableCreemTopup?: boolean
  onCreemProductSelect?: (product: CreemProduct) => void
  enableWaffoTopup?: boolean
  waffoPayMethods?: WaffoPayMethod[]
  waffoMinTopup?: number
  onWaffoMethodSelect?: (method: WaffoPayMethod, index: number) => void
  enableWaffoPancakeTopup?: boolean
}

const RECHARGE_SKELETON_IDS = [
  'preset-1',
  'preset-2',
  'preset-3',
  'preset-4',
  'preset-5',
  'preset-6',
  'preset-7',
  'preset-8',
]

export function RechargeFormCard({
  topupInfo,
  presetAmounts,
  selectedPreset,
  onSelectPreset,
  topupAmount,
  onTopupAmountChange,
  paymentAmount,
  calculating,
  onContinuePayment,
  continueProcessing,
  paymentLoading,
  redemptionCode,
  onRedemptionCodeChange,
  onRedeem,
  redeeming,
  topupLink,
  loading,
  priceRatio = 1,
  usdExchangeRate = 1,
  onOpenBilling,
  creemProducts,
  enableCreemTopup,
  onCreemProductSelect,
  enableWaffoTopup,
  waffoPayMethods,
  waffoMinTopup,
  onWaffoMethodSelect,
  enableWaffoPancakeTopup,
}: RechargeFormCardProps) {
  const { t } = useTranslation()
  const [localAmount, setLocalAmount] = useState(topupAmount.toString())
  const [activeTab, setActiveTab] = useState<'online' | 'redeem'>('online')

  useEffect(() => {
    // Empty string must survive, otherwise the field can never be cleared
    setLocalAmount((prev) =>
      prev === '' && topupAmount === 0 ? prev : topupAmount.toString()
    )
  }, [topupAmount])

  const handleAmountChange = (value: string) => {
    setLocalAmount(value)
    const numValue = Number.parseInt(value) || 0
    if (numValue >= 0) {
      onTopupAmountChange(numValue)
    }
  }

  const hasConfigurableTopup =
    topupInfo?.enable_online_topup ||
    topupInfo?.enable_stripe_topup ||
    enableWaffoTopup ||
    enableWaffoPancakeTopup
  const hasAnyTopup = hasConfigurableTopup || enableCreemTopup
  const hasStandardPaymentMethods = getEffectivePayMethods(topupInfo).length > 0
  const hasWaffoPaymentMethods =
    Array.isArray(waffoPayMethods) && waffoPayMethods.length > 0
  const minTopup = getMinTopupAmount(topupInfo)
  const redemptionEnabled = topupInfo?.enable_redemption !== false
  const canContinue =
    hasStandardPaymentMethods &&
    topupAmount >= minTopup &&
    !calculating &&
    !continueProcessing
  // The summary aside carries the payable figure, so the CTA reads as a plain
  // action the way the reference purchase page does.
  const standardPaymentButton = hasStandardPaymentMethods ? (
    <Button
      size='lg'
      className='w-full'
      disabled={!canContinue}
      onClick={onContinuePayment}
    >
      {continueProcessing ? (
        <Loader2 className='h-4 w-4 animate-spin' />
      ) : (
        <Landmark className='h-4 w-4' />
      )}
      {t('Continue Payment')}
    </Button>
  ) : null
  const noPaymentMethodsAlert =
    hasStandardPaymentMethods || hasWaffoPaymentMethods ? null : (
      <Alert>
        <AlertDescription>
          {t('No payment methods available. Please contact administrator.')}
        </AlertDescription>
      </Alert>
    )
  const currentDiscount = topupInfo?.discount?.[topupAmount]
  const discountLabel =
    currentDiscount == null ? '' : getDiscountLabel(currentDiscount, t)
  const showSummaryAside = Boolean(
    hasConfigurableTopup && standardPaymentButton
  )

  if (loading) {
    return (
      <Card data-card-hover='false' className='gap-0 overflow-hidden py-0'>
        <CardHeader className='border-b p-3 !pb-3 sm:p-5 sm:!pb-5'>
          <Skeleton className='h-6 w-32' />
          <Skeleton className='mt-2 h-4 w-48' />
        </CardHeader>
        <CardContent className='space-y-4 p-3 sm:space-y-6 sm:p-5'>
          <Skeleton className='h-8 w-full' />
          <div className='space-y-3'>
            <Skeleton className='h-3 w-16' />
            <div className='grid grid-cols-2 gap-1.5 sm:gap-3 md:grid-cols-4'>
              {RECHARGE_SKELETON_IDS.map((id) => (
                <Skeleton key={id} className='h-[72px] rounded-lg' />
              ))}
            </div>
          </div>
          <div className='space-y-3'>
            <Skeleton className='h-3 w-28' />
            <Skeleton className='h-[42px] w-full' />
          </div>
          <Skeleton className='h-10 w-full' />
        </CardContent>
      </Card>
    )
  }

  return (
    <TitledCard
      title={t('Add Funds')}
      description={t('Choose an amount to top up your account')}
      icon={<WalletCards className='h-4 w-4' />}
      disableHoverEffect
      action={
        onOpenBilling ? (
          <Button
            variant='outline'
            size='sm'
            onClick={onOpenBilling}
            className='w-full gap-2 sm:w-auto'
          >
            <Receipt className='h-4 w-4' />
            {t('Order History')}
          </Button>
        ) : null
      }
      contentClassName='space-y-4 sm:space-y-6'
    >
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as 'online' | 'redeem')}
      >
        <TabsList className='w-full'>
          <TabsTrigger value='online'>{t('Online Recharge')}</TabsTrigger>
          {redemptionEnabled && (
            <TabsTrigger value='redeem'>{t('Redeem Code')}</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value='online' className='@container mt-4 sm:mt-6'>
          {hasAnyTopup ? (
            <div
              className={cn(
                'grid gap-4 sm:gap-6',
                showSummaryAside &&
                  '@4xl:grid-cols-[minmax(0,1fr)_minmax(17rem,19rem)] @4xl:items-start'
              )}
            >
              <div className='space-y-4 sm:space-y-6'>
                {hasConfigurableTopup && (
                  <>
                    {presetAmounts.length > 0 && (
                      <div className='space-y-2.5 sm:space-y-3'>
                        <Label className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
                          {t('Amount')}
                        </Label>
                        <div className='grid grid-cols-2 gap-1.5 sm:gap-3 md:grid-cols-4'>
                          {presetAmounts.map((preset) => {
                            const discount =
                              preset.discount ||
                              topupInfo?.discount?.[preset.value] ||
                              1.0
                            const {
                              displayValue,
                              actualPrice,
                              savedAmount,
                              hasDiscount,
                            } = calculatePresetPricing(
                              preset.value,
                              priceRatio,
                              discount,
                              usdExchangeRate
                            )
                            return (
                              <Button
                                key={preset.value}
                                variant='outline'
                                className={cn(
                                  'flex min-h-16 flex-col items-start rounded-lg px-3 py-2.5 text-left whitespace-normal sm:min-h-[72px] sm:p-4',
                                  selectedPreset === preset.value
                                    ? 'border-brand bg-brand/10 text-brand dark:border-brand dark:bg-brand/10'
                                    : 'border-border'
                                )}
                                onClick={() => onSelectPreset(preset)}
                              >
                                <div className='flex w-full items-center justify-between'>
                                  <div className='text-base font-semibold sm:text-lg'>
                                    {formatNumber(displayValue)}
                                  </div>
                                  {hasDiscount && (
                                    <div className='text-success text-xs font-medium'>
                                      {getDiscountLabel(discount, t)}
                                    </div>
                                  )}
                                </div>
                                <div className='text-muted-foreground mt-1.5 w-full text-xs sm:mt-2'>
                                  {t('Pay {{amount}}', {
                                    amount: formatCurrency(actualPrice),
                                  })}
                                  {hasDiscount && savedAmount > 0 && (
                                    <span className='text-success'>
                                      {' '}
                                      •{' '}
                                      {t('Save {{amount}}', {
                                        amount: formatCurrency(savedAmount),
                                      })}
                                    </span>
                                  )}
                                </div>
                              </Button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    <div className='space-y-2.5 sm:space-y-3'>
                      <Label
                        htmlFor='topup-amount'
                        className='text-muted-foreground text-xs font-medium tracking-wider uppercase'
                      >
                        {t('Custom Amount')}
                      </Label>
                      <Input
                        id='topup-amount'
                        type='number'
                        value={localAmount}
                        onChange={(e) => handleAmountChange(e.target.value)}
                        min={minTopup}
                        placeholder={`Minimum ${minTopup}`}
                        className='h-9 text-base sm:h-10 sm:text-lg'
                      />
                    </div>

                    {noPaymentMethodsAlert}

                    {enableWaffoTopup &&
                      hasWaffoPaymentMethods &&
                      onWaffoMethodSelect && (
                        <div className='space-y-2.5 sm:space-y-3'>
                          <Label className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
                            {t('Waffo Payment')}
                          </Label>
                          <div className='grid grid-cols-2 gap-1.5 sm:gap-3 lg:grid-cols-3'>
                            {waffoPayMethods?.map((method, index) => {
                              const loadingKey = `waffo-${index}`
                              const methodKey = [
                                method.name,
                                method.payMethodType,
                                method.payMethodName,
                              ]
                                .filter(Boolean)
                                .join(':')
                              const waffoMin = waffoMinTopup || 0
                              const belowMin = waffoMin > topupAmount
                              const disabledReason = belowMin
                                ? t('Minimum topup amount: {{amount}}', {
                                    amount: waffoMin,
                                  })
                                : undefined
                              const disabledLabel = belowMin
                                ? `${t('Minimum:')} ${waffoMin}`
                                : undefined

                              let methodIcon = getPaymentIcon('waffo')
                              if (paymentLoading === loadingKey) {
                                methodIcon = (
                                  <Loader2 className='h-4 w-4 animate-spin' />
                                )
                              } else if (method.icon) {
                                methodIcon = (
                                  <img
                                    src={method.icon}
                                    alt={method.name}
                                    className='h-4 w-4 object-contain'
                                  />
                                )
                              }

                              const button = (
                                <Button
                                  key={methodKey}
                                  variant='outline'
                                  onClick={() =>
                                    onWaffoMethodSelect(method, index)
                                  }
                                  disabled={belowMin || !!paymentLoading}
                                  title={disabledReason}
                                  aria-label={
                                    disabledReason
                                      ? `${method.name}. ${disabledReason}`
                                      : method.name
                                  }
                                  className='min-h-14 min-w-0 justify-start gap-2 rounded-lg px-3 py-2 text-left'
                                >
                                  {methodIcon}
                                  <span className='flex min-w-0 flex-col items-start gap-0.5'>
                                    <span className='max-w-full truncate'>
                                      {method.name}
                                    </span>
                                    {disabledLabel && (
                                      <span className='text-muted-foreground max-w-full truncate text-[11px] leading-4 font-normal'>
                                        {disabledLabel}
                                      </span>
                                    )}
                                  </span>
                                </Button>
                              )

                              return belowMin ? (
                                <TooltipProvider key={methodKey}>
                                  <Tooltip>
                                    <TooltipTrigger render={button} />
                                    <TooltipContent>
                                      {disabledReason}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : (
                                button
                              )
                            })}
                          </div>
                        </div>
                      )}
                  </>
                )}

                {enableCreemTopup &&
                  Array.isArray(creemProducts) &&
                  creemProducts.length > 0 &&
                  onCreemProductSelect && (
                    <div className='space-y-2.5 border-t pt-4 sm:space-y-3 sm:pt-6'>
                      <Label className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
                        {t('Creem Payment')}
                      </Label>
                      <CreemProductsSection
                        products={creemProducts}
                        onProductSelect={onCreemProductSelect}
                      />
                    </div>
                  )}
              </div>

              {showSummaryAside && (
                <aside className='bg-muted/40 space-y-3 rounded-xl border p-4 @4xl:sticky @4xl:top-4'>
                  <p className='text-sm font-semibold'>{t('Summary')}</p>
                  <dl className='space-y-2 text-sm'>
                    <div className='flex items-baseline justify-between gap-4'>
                      <dt className='text-muted-foreground'>{t('Amount')}</dt>
                      <dd className='tabular-nums'>
                        {formatNumber(topupAmount)}
                      </dd>
                    </div>
                    {discountLabel && (
                      <div className='flex items-baseline justify-between gap-4'>
                        <dt className='text-muted-foreground'>
                          {t('Discount')}
                        </dt>
                        <dd className='text-success'>{discountLabel}</dd>
                      </div>
                    )}
                    <div className='flex items-baseline justify-between gap-4 border-t pt-2'>
                      <dt className='text-muted-foreground'>{t('Total')}</dt>
                      <dd className='text-brand text-lg font-semibold tabular-nums'>
                        {calculating ? (
                          <Skeleton className='h-6 w-20' />
                        ) : (
                          formatCurrency(paymentAmount)
                        )}
                      </dd>
                    </div>
                  </dl>
                  {standardPaymentButton}
                </aside>
              )}
            </div>
          ) : (
            <Alert>
              <AlertDescription>
                {t(
                  'Online topup is not enabled. Please use redemption code or contact administrator.'
                )}
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>

        {redemptionEnabled && (
          <TabsContent value='redeem' className='mt-4 space-y-3 sm:mt-6'>
            <div className='grid grid-cols-[minmax(0,1fr)_auto] gap-2'>
              <Input
                id='redemption-code'
                value={redemptionCode}
                onChange={(e) => onRedemptionCodeChange(e.target.value)}
                placeholder={t('Enter your redemption code')}
                className='h-9 min-w-0'
              />
              <Button
                onClick={onRedeem}
                disabled={redeeming}
                variant='outline'
                className='h-9 px-4'
              >
                {redeeming && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                {t('Redeem')}
              </Button>
            </div>
            {topupLink && (
              <p className='text-muted-foreground text-xs'>
                {t('Need a redemption code?')}{' '}
                <a
                  href={topupLink}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='inline-flex items-center gap-1 underline-offset-4 hover:underline'
                >
                  {t('Get one here')}
                  <ExternalLink className='h-3 w-3' />
                </a>
              </p>
            )}
          </TabsContent>
        )}
      </Tabs>

      {!redemptionEnabled && (
        <Alert className='border-t'>
          <AlertDescription>
            {t(
              'Redemption codes are disabled until the administrator confirms compliance terms.'
            )}
          </AlertDescription>
        </Alert>
      )}
    </TitledCard>
  )
}

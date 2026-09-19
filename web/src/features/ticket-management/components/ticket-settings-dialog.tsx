/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

import { getTicketSettings, updateTicketSettings } from '../api'

type TicketSettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TicketSettingsDialog(props: TicketSettingsDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [enabled, setEnabled] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const settingsQuery = useQuery({
    queryKey: ['ticket-settings'],
    queryFn: async () => {
      const result = await getTicketSettings()
      if (!result.success || !result.data) {
        throw new Error(result.message || 'Failed to load ticket settings')
      }
      return result.data
    },
    enabled: props.open,
  })

  useEffect(() => {
    if (settingsQuery.data) setEnabled(settingsQuery.data.enabled)
  }, [settingsQuery.data])

  const handleSave = async () => {
    if (!settingsQuery.data) return
    setIsSaving(true)
    try {
      const result = await updateTicketSettings(
        enabled,
        settingsQuery.data.version
      )
      if (!result.success) {
        toast.error(result.message || t('Failed to save ticket settings'))
        await queryClient.invalidateQueries({ queryKey: ['ticket-settings'] })
        return
      }
      toast.success(t('Ticket settings saved'))
      await queryClient.invalidateQueries({ queryKey: ['ticket-settings'] })
      props.onOpenChange(false)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Ticket settings')}</DialogTitle>
          <DialogDescription>
            {t(
              'Control whether users can create and reply to support tickets.'
            )}
          </DialogDescription>
        </DialogHeader>
        {settingsQuery.isError ? (
          <Alert variant='destructive'>
            <AlertTitle>{t('Failed to load ticket settings')}</AlertTitle>
            <AlertDescription>
              {settingsQuery.error instanceof Error
                ? settingsQuery.error.message
                : t('Please try again.')}
            </AlertDescription>
          </Alert>
        ) : (
          <div className='flex items-center justify-between gap-4 rounded-lg border p-4'>
            <div className='space-y-1'>
              <Label htmlFor='ticket-system-enabled'>
                {t('Enable ticket support')}
              </Label>
              <p className='text-muted-foreground text-sm'>
                {t(
                  'When disabled, existing tickets remain available to staff.'
                )}
              </p>
            </div>
            <Switch
              id='ticket-system-enabled'
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled={settingsQuery.isLoading || isSaving}
            />
          </div>
        )}
        <DialogFooter>
          <Button variant='outline' onClick={() => props.onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              settingsQuery.isLoading ||
              settingsQuery.isError ||
              !settingsQuery.data ||
              isSaving ||
              enabled === settingsQuery.data.enabled
            }
          >
            {isSaving && (
              <Loader2 className='animate-spin' data-icon='inline-start' />
            )}
            {t('Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

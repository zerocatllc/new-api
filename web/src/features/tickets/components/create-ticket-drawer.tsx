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
import { zodResolver } from '@hookform/resolvers/zod'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import {
  buildMyTicketAttachmentDownloadUrl,
  createTicket,
  uploadMyTicketAttachment,
} from '../api'
import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
} from '../constants'
import {
  TicketAttachmentField,
  type TicketAttachmentFieldHandle,
} from './ticket-attachment-field'
import { useTickets } from './tickets-provider'

const createTicketSchema = z.object({
  category: z.enum(TICKET_CATEGORIES),
  priority: z.enum(TICKET_PRIORITIES),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
})

type CreateTicketFormValues = z.infer<typeof createTicketSchema>

const DEFAULT_VALUES: CreateTicketFormValues = {
  category: 'general',
  priority: 'normal',
  subject: '',
  body: '',
}

type CreateTicketDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateTicketDrawer({
  open,
  onOpenChange,
}: CreateTicketDrawerProps) {
  const { t } = useTranslation()
  const { triggerRefresh, attachmentsEnabled } = useTickets()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>([])
  const attachmentFieldRef = useRef<TicketAttachmentFieldHandle>(null)

  const form = useForm<CreateTicketFormValues>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: DEFAULT_VALUES,
  })
  let submitLabel = t('Create Ticket')
  if (isSubmitting) submitLabel = t('Submitting...')
  if (isUploading) submitLabel = t('Uploading...')

  const onSubmit = async (values: CreateTicketFormValues) => {
    setIsSubmitting(true)
    try {
      const result = await createTicket({
        category: values.category,
        priority: values.priority,
        subject: values.subject,
        body: values.body,
        client_request_id: crypto.randomUUID(),
        attachment_urls: attachmentUrls.length ? attachmentUrls : undefined,
      })
      if (result.success) {
        toast.success(t('Ticket created'))
        onOpenChange(false)
        form.reset(DEFAULT_VALUES)
        setAttachmentUrls([])
        triggerRefresh()
      } else {
        toast.error(result.message || t('Failed to create ticket'))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && (isSubmitting || isUploading)) return
        onOpenChange(v)
        if (!v) {
          form.reset(DEFAULT_VALUES)
          setAttachmentUrls([])
        }
      }}
    >
      <DialogContent className='flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl'>
        <DialogHeader className='border-b px-5 py-4 pr-12 sm:px-6'>
          <DialogTitle>{t('New Ticket')}</DialogTitle>
          <DialogDescription>
            {t('Describe the issue and include any files support may need.')}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            id='create-ticket-form'
            onSubmit={form.handleSubmit(onSubmit)}
            className='min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6'
          >
            <div className='space-y-5'>
              <FormField
                control={form.control}
                name='subject'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Subject')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t('Brief summary of your issue')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='category'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Category')}</FormLabel>
                    <Select
                      items={TICKET_CATEGORIES.map((value) => ({
                        value,
                        label: t(TICKET_CATEGORY_LABELS[value]),
                      }))}
                      value={field.value}
                      onValueChange={(v) => v !== null && field.onChange(v)}
                    >
                      <FormControl>
                        <SelectTrigger className='w-full'>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent alignItemWithTrigger={false}>
                        <SelectGroup>
                          {TICKET_CATEGORIES.map((value) => (
                            <SelectItem key={value} value={value}>
                              {t(TICKET_CATEGORY_LABELS[value])}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='priority'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Priority')}</FormLabel>
                    <Select
                      items={TICKET_PRIORITIES.map((value) => ({
                        value,
                        label: t(TICKET_PRIORITY_LABELS[value]),
                      }))}
                      value={field.value}
                      onValueChange={(v) => v !== null && field.onChange(v)}
                    >
                      <FormControl>
                        <SelectTrigger className='w-full'>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent alignItemWithTrigger={false}>
                        <SelectGroup>
                          {TICKET_PRIORITIES.map((value) => (
                            <SelectItem key={value} value={value}>
                              {t(TICKET_PRIORITY_LABELS[value])}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='body'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Description')}</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={6}
                        placeholder={t('Describe your issue in detail')}
                        onPaste={(event) => {
                          const files = [...event.clipboardData.files].filter(
                            (file) => file.type.startsWith('image/')
                          )
                          if (files.length === 0) return
                          event.preventDefault()
                          void attachmentFieldRef.current?.uploadFiles(files)
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {attachmentsEnabled && (
                <div className='flex flex-col gap-2'>
                  <Label>{t('Attachments')}</Label>
                  <TicketAttachmentField
                    ref={attachmentFieldRef}
                    urls={attachmentUrls}
                    onChange={setAttachmentUrls}
                    upload={uploadMyTicketAttachment}
                    buildDownloadHref={buildMyTicketAttachmentDownloadUrl}
                    disabled={isSubmitting}
                    onUploadingChange={setIsUploading}
                  />
                  <p className='text-muted-foreground text-xs'>
                    {t('You can select multiple files or paste an image here.')}
                  </p>
                </div>
              )}
            </div>
          </form>
        </Form>
        <DialogFooter className='m-0 rounded-none px-5 py-4 sm:px-6'>
          <DialogClose
            render={
              <Button
                variant='outline'
                disabled={isSubmitting || isUploading}
              />
            }
          >
            {t('Cancel')}
          </DialogClose>
          <Button
            form='create-ticket-form'
            type='submit'
            disabled={isSubmitting || isUploading}
          >
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

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
import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
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
  TicketAttachmentField,
  type TicketAttachmentFieldHandle,
} from '@/features/tickets/components/ticket-attachment-field'
import { searchUsers } from '@/features/users/api'

import {
  adminCreateTicket,
  buildTicketAttachmentDownloadUrlAdmin,
  uploadTicketAttachmentAdmin,
} from '../api'
import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
} from '../constants'
import { useTicketManagement } from './ticket-management-provider'

const schema = z.object({
  user_id: z.number().int().positive(),
  category: z.enum(TICKET_CATEGORIES),
  priority: z.enum(TICKET_PRIORITIES),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
})

type Values = z.infer<typeof schema>

const defaults: Values = {
  user_id: 0,
  category: 'general',
  priority: 'normal',
  subject: '',
  body: '',
}

export function AdminCreateTicketDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const { triggerRefresh } = useTicketManagement()
  const userListboxId = useId()
  const [userSearch, setUserSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [attachments, setAttachments] = useState<string[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const attachmentRef = useRef<TicketAttachmentFieldHandle>(null)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  })

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedSearch(userSearch.trim()),
      250
    )
    return () => window.clearTimeout(timer)
  }, [userSearch])

  const users = useQuery({
    queryKey: ['ticket-user-search', debouncedSearch],
    enabled: open && debouncedSearch.length > 0,
    queryFn: () =>
      searchUsers({ keyword: debouncedSearch, p: 1, page_size: 8 }),
  })

  const reset = () => {
    form.reset(defaults)
    setUserSearch('')
    setAttachments([])
  }

  const submit = async (values: Values) => {
    setIsSubmitting(true)
    try {
      const result = await adminCreateTicket({
        ...values,
        client_request_id: crypto.randomUUID(),
        attachment_urls: attachments.length ? attachments : undefined,
      })
      if (!result.success) {
        toast.error(result.message || t('Failed to create ticket'))
        return
      }
      toast.success(t('Ticket created'))
      reset()
      onOpenChange(false)
      triggerRefresh({ stats: true })
    } finally {
      setIsSubmitting(false)
    }
  }

  const busy = isUploading || isSubmitting
  let submitLabel = t('Create Ticket')
  if (isSubmitting) submitLabel = t('Submitting...')
  if (isUploading) submitLabel = t('Uploading...')

  return (
    <Dialog open={open} onOpenChange={(value) => !busy && onOpenChange(value)}>
      <DialogContent className='flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl'>
        <DialogHeader className='border-b px-6 py-4 pr-12'>
          <DialogTitle>{t('Create Ticket for User')}</DialogTitle>
          <DialogDescription>
            {t('Open a support case on behalf of a user.')}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            id='admin-create-ticket'
            onSubmit={form.handleSubmit(submit)}
            className='min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5'
          >
            <FormField
              control={form.control}
              name='user_id'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Requester')}</FormLabel>
                  <FormControl>
                    <div className='relative'>
                      <Input
                        value={userSearch}
                        placeholder={t('Search by username, name or email')}
                        autoComplete='off'
                        role='combobox'
                        aria-expanded={Boolean(
                          debouncedSearch && field.value === 0
                        )}
                        aria-controls={userListboxId}
                        aria-autocomplete='list'
                        onChange={(event) => {
                          setUserSearch(event.target.value)
                          field.onChange(0)
                        }}
                      />
                      {debouncedSearch && field.value === 0 && (
                        <div
                          role='listbox'
                          id={userListboxId}
                          className='bg-popover absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-md border p-1 shadow-md'
                        >
                          {(users.data?.data?.items ?? []).map((user) => (
                            <button
                              key={user.id}
                              type='button'
                              role='option'
                              aria-selected={false}
                              className='hover:bg-accent flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm'
                              onClick={() => {
                                field.onChange(user.id)
                                setUserSearch(
                                  `${user.display_name || user.username} (#${user.id})`
                                )
                              }}
                            >
                              <span>{user.display_name || user.username}</span>
                              <span className='text-muted-foreground'>
                                #{user.id} · {user.username}
                              </span>
                            </button>
                          ))}
                          {!users.isFetching &&
                            (users.data?.data?.items.length ?? 0) === 0 && (
                              <div className='text-muted-foreground px-3 py-2 text-sm'>
                                {t('No users found')}
                              </div>
                            )}
                        </div>
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='subject'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Subject')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className='grid gap-4 sm:grid-cols-2'>
              {(['category', 'priority'] as const).map((name) => {
                const values =
                  name === 'category' ? TICKET_CATEGORIES : TICKET_PRIORITIES
                const labels =
                  name === 'category'
                    ? TICKET_CATEGORY_LABELS
                    : TICKET_PRIORITY_LABELS
                return (
                  <FormField
                    key={name}
                    control={form.control}
                    name={name}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t(name === 'category' ? 'Category' : 'Priority')}
                        </FormLabel>
                        <Select
                          items={values.map((value) => ({
                            value,
                            label: t(labels[value as keyof typeof labels]),
                          }))}
                          value={field.value}
                          onValueChange={(value) =>
                            value && field.onChange(value)
                          }
                        >
                          <FormControl>
                            <SelectTrigger className='w-full'>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent alignItemWithTrigger={false}>
                            <SelectGroup>
                              {values.map((value) => (
                                <SelectItem key={value} value={value}>
                                  {t(labels[value as keyof typeof labels])}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )
              })}
            </div>
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
                      onPaste={(event) => {
                        const files = [...event.clipboardData.files].filter(
                          (file) => file.type.startsWith('image/')
                        )
                        if (files.length) {
                          event.preventDefault()
                          void attachmentRef.current?.uploadFiles(files)
                        }
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className='space-y-2'>
              <Label>{t('Attachments')}</Label>
              <TicketAttachmentField
                ref={attachmentRef}
                urls={attachments}
                onChange={setAttachments}
                upload={uploadTicketAttachmentAdmin}
                buildDownloadHref={buildTicketAttachmentDownloadUrlAdmin}
                disabled={isSubmitting}
                onUploadingChange={setIsUploading}
              />
            </div>
          </form>
        </Form>
        <DialogFooter className='m-0 rounded-none px-6 py-4'>
          <DialogClose render={<Button variant='outline' disabled={busy} />}>
            {t('Cancel')}
          </DialogClose>
          <Button form='admin-create-ticket' type='submit' disabled={busy}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

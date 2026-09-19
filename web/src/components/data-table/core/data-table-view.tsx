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
import type { Row, Table as TanstackTable } from '@tanstack/react-table'
import * as React from 'react'

import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

import {
  getPinnedColumnMap,
  getResolvedColumnClassNameFromMap,
  getResolvedColumnStyleFromMap,
} from './column-pinning'
import { DataTableColgroup } from './data-table-colgroup'
import { DataTableHeader } from './data-table-header'
import { DataTableRow } from './data-table-row'
import { TableEmpty } from './table-empty'
import { getTableSizeStyle } from './table-sizing'
import { TableSkeleton } from './table-skeleton'
import type {
  DataTableColumnClassName,
  DataTableColumnStyle,
  DataTablePinnedColumn,
  DataTableViewProps,
} from './types'

export type {
  DataTableColumnClassName,
  DataTablePinnedColumn,
  DataTableRenderRowHelpers,
  DataTableViewProps,
} from './types'
export { DataTableRow } from './data-table-row'
export { DataTableRowActionMenu } from './row-action-menu'

export function DataTableView<TData>(props: DataTableViewProps<TData>) {
  const rows = props.rows ?? props.table.getRowModel().rows
  const colSpan = React.useMemo(
    () => props.table.getVisibleLeafColumns().length,
    [props.table]
  )
  const { getColumnClassName, getColumnStyle } = useResolvedColumnRendering(
    props.table,
    props.getColumnClassName,
    props.pinnedColumns
  )

  return (
    <div
      className={cn('overflow-hidden', props.containerClassName)}
      {...props.containerProps}
    >
      {props.splitHeader ? (
        <SplitHeaderTableView
          props={props}
          rows={rows}
          colSpan={colSpan}
          getColumnClassName={getColumnClassName}
          getColumnStyle={getColumnStyle}
        />
      ) : (
        <UnifiedTableView
          props={props}
          rows={rows}
          colSpan={colSpan}
          getColumnClassName={getColumnClassName}
          getColumnStyle={getColumnStyle}
        />
      )}
    </div>
  )
}

function UnifiedTableView<TData>({
  props,
  rows,
  colSpan,
  getColumnClassName,
  getColumnStyle,
}: {
  props: DataTableViewProps<TData>
  rows: Row<TData>[]
  colSpan: number
  getColumnClassName: DataTableColumnClassName
  getColumnStyle: DataTableColumnStyle
}) {
  const tableSizing = getTableSizing(props)

  return (
    <div className={props.tableContainerClassName}>
      <Table className={props.tableClassName} style={tableSizing.style}>
        {tableSizing.colgroup}
        <DataTableHeader
          table={props.table}
          applyHeaderSize={props.applyHeaderSize}
          className={props.tableHeaderClassName}
          rowClassName={props.tableHeaderRowClassName}
          getColumnClassName={getColumnClassName}
          getColumnStyle={getColumnStyle}
        />
        {renderTableBody(
          props,
          rows,
          colSpan,
          getColumnClassName,
          getColumnStyle
        )}
      </Table>
    </div>
  )
}

function SplitHeaderTableView<TData>({
  props,
  rows,
  colSpan,
  getColumnClassName,
  getColumnStyle,
}: {
  props: DataTableViewProps<TData>
  rows: Row<TData>[]
  colSpan: number
  getColumnClassName: DataTableColumnClassName
  getColumnStyle: DataTableColumnStyle
}) {
  const tableSizing = getTableSizing(props)

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col',
        props.tableContainerClassName
      )}
    >
      <div
        className={cn(
          'min-h-0 flex-1 overflow-auto',
          '**:data-[slot=table-header]:[--table-header-bg:var(--table-header)]',
          '**:data-[slot=table-header]:bg-(--table-header-bg)',
          props.splitHeaderScrollClassName,
          props.bodyContainerClassName
        )}
      >
        <table
          data-slot='table'
          className={cn(
            'w-full caption-bottom text-sm tabular-nums [&_td]:text-sm [&_th]:text-sm',
            props.tableClassName
          )}
          style={tableSizing.style}
        >
          {tableSizing.colgroup}
          <DataTableHeader
            table={props.table}
            applyHeaderSize={props.applyHeaderSize}
            className={cn('sticky top-0 z-10', props.tableHeaderClassName)}
            rowClassName={props.tableHeaderRowClassName}
            getColumnClassName={getColumnClassName}
            getColumnStyle={getColumnStyle}
          />
          {renderTableBody(
            props,
            rows,
            colSpan,
            getColumnClassName,
            getColumnStyle
          )}
        </table>
      </div>
    </div>
  )
}

function useResolvedColumnRendering<TData>(
  table: TanstackTable<TData>,
  getColumnClassName?: DataTableColumnClassName,
  pinnedColumns?: DataTablePinnedColumn[]
) {
  const allPinnedColumns = React.useMemo(() => {
    const metaPinnedColumns = getMetaPinnedColumns(table)
    return mergePinnedColumns(pinnedColumns, metaPinnedColumns)
  }, [table, pinnedColumns])

  const pinnedColumnById = React.useMemo(
    () => getPinnedColumnMap(allPinnedColumns),
    [allPinnedColumns]
  )

  return React.useMemo(
    () => ({
      getColumnClassName: getResolvedColumnClassNameFromMap(
        getColumnClassName,
        pinnedColumnById
      ),
      getColumnStyle: getResolvedColumnStyleFromMap(pinnedColumnById),
    }),
    [getColumnClassName, pinnedColumnById]
  )
}

// Derive pinned columns from per-column `meta.pinned` and assign each one a
// cumulative offset (summed width of the sibling pinned columns nearer the
// edge) so columns pinned to the same side stack rather than collapse onto the
// same edge and overlap. In the overflow case — the only one where sticky
// activates — every column renders at exactly its `size` px (see table-sizing),
// so summing `getSize()` yields the correct offset.
function getMetaPinnedColumns<TData>(
  table: TanstackTable<TData>
): DataTablePinnedColumn[] {
  const leafColumns = table.getVisibleLeafColumns()
  const pinned: DataTablePinnedColumn[] = []

  let rightOffset = 0
  for (let i = leafColumns.length - 1; i >= 0; i--) {
    const column = leafColumns[i]
    if (column.columnDef.meta?.pinned !== 'right') continue
    pinned.push({ columnId: column.id, side: 'right', offset: rightOffset })
    rightOffset += column.getSize()
  }

  let leftOffset = 0
  for (const column of leafColumns) {
    if (column.columnDef.meta?.pinned !== 'left') continue
    pinned.push({ columnId: column.id, side: 'left', offset: leftOffset })
    leftOffset += column.getSize()
  }

  return pinned
}

function mergePinnedColumns(
  explicitPinnedColumns: DataTablePinnedColumn[] | undefined,
  metaPinnedColumns: DataTablePinnedColumn[]
): DataTablePinnedColumn[] | undefined {
  if (!metaPinnedColumns.length) {
    return explicitPinnedColumns
  }

  if (!explicitPinnedColumns?.length) {
    return metaPinnedColumns
  }

  const explicitColumnIds = new Set(
    explicitPinnedColumns.map((column) => column.columnId)
  )

  return [
    ...explicitPinnedColumns,
    ...metaPinnedColumns.filter(
      (column) => !explicitColumnIds.has(column.columnId)
    ),
  ]
}

function getTableSizing<TData>(props: DataTableViewProps<TData>): {
  colgroup?: React.ReactNode
  style?: React.CSSProperties
} {
  if (props.colgroup) {
    return { colgroup: props.colgroup }
  }

  if (!props.splitHeader && !props.applyHeaderSize) {
    return {}
  }

  return {
    colgroup: <DataTableColgroup table={props.table} />,
    style: getTableSizeStyle(props.table),
  }
}

function renderTableBody<TData>(
  props: DataTableViewProps<TData>,
  rows: Row<TData>[],
  colSpan: number,
  getColumnClassName: DataTableColumnClassName,
  getColumnStyle: DataTableColumnStyle
) {
  return (
    <TableBody className={props.tableBodyClassName}>
      {renderTableBodyContent(
        props,
        rows,
        colSpan,
        getColumnClassName,
        getColumnStyle
      )}
    </TableBody>
  )
}

function renderTableBodyContent<TData>(
  props: DataTableViewProps<TData>,
  rows: Row<TData>[],
  colSpan: number,
  getColumnClassName: DataTableColumnClassName,
  getColumnStyle: DataTableColumnStyle
) {
  if (props.isLoading) {
    return (
      <TableSkeleton
        table={props.table}
        keyPrefix={props.skeletonKeyPrefix}
        rowHeight={props.skeletonRowHeight}
      />
    )
  }

  if (rows.length === 0) {
    return renderEmptyState(props, colSpan)
  }

  return rows.map((row) =>
    props.renderRow
      ? props.renderRow(row, {
          getCellClassName: (columnId, className) =>
            cn(getColumnClassName(columnId, 'cell'), className),
          getCellStyle: (columnId) => getColumnStyle(columnId, 'cell'),
        })
      : renderDefaultRow(props, row, getColumnClassName, getColumnStyle)
  )
}

function renderEmptyState<TData>(
  props: DataTableViewProps<TData>,
  colSpan: number
) {
  if (props.emptyContent) {
    return (
      <TableRow>
        <TableCell colSpan={colSpan} className={props.emptyCellClassName}>
          {props.emptyContent}
        </TableCell>
      </TableRow>
    )
  }

  return (
    <TableEmpty
      colSpan={colSpan}
      title={props.emptyTitle}
      description={props.emptyDescription}
      icon={props.emptyIcon}
    >
      {props.emptyAction}
    </TableEmpty>
  )
}

function renderDefaultRow<TData>(
  props: DataTableViewProps<TData>,
  row: Row<TData>,
  getColumnClassName: DataTableColumnClassName,
  getColumnStyle: DataTableColumnStyle
) {
  return (
    <DataTableRow
      key={row.id}
      row={row}
      className={cn(props.tableBodyRowClassName, props.getRowClassName?.(row))}
      getColumnClassName={getColumnClassName}
      getColumnStyle={getColumnStyle}
      cellRenderColumns={props.table.options.columns}
    />
  )
}

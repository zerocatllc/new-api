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
// 公式注入防护：以 = + - @ \t \r 开头的字符串单元格加单引号前缀，
// 防止导出文件在 Excel/Sheets 中被当作公式执行。防护在 RFC 4180
// 引号转义之前应用；number 类型单元格视为可信数值，不加前缀。
const FORMULA_LEADING = /^[=+\-@\t\r]/
const NEEDS_QUOTING = /[",\r\n]/

function guardCell(cell: string | number): string {
  if (typeof cell === 'number') {
    return String(cell)
  }
  return FORMULA_LEADING.test(cell) ? `'${cell}` : cell
}

export function escapeCsvRow(cells: (string | number)[]): string {
  return cells
    .map(guardCell)
    .map((cell) =>
      NEEDS_QUOTING.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell
    )
    .join(',')
}

export function buildCsv(
  header: string[],
  rows: (string | number)[][]
): string {
  return [escapeCsvRow(header), ...rows.map((row) => escapeCsvRow(row))].join(
    '\n'
  )
}

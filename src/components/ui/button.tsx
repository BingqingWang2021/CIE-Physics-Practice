/* 极简 shadcn 风格垫片：保留 API（size / className），样式走 app.css。 */
import type { ButtonHTMLAttributes } from 'react'

const cx = (...xs: (string | false | undefined)[]) => xs.filter(Boolean).join(' ')

export function Button({ className, size, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { size?: 'sm' | 'lg' }) {
  return <button className={cx('ui-btn', size === 'lg' && 'ui-btn-lg', className)} {...p} />
}

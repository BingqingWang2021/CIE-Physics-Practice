/* 极简 shadcn 风格垫片：本项目用纸感自定义 CSS 而非 Tailwind，
   这里只保留组件 API 与 className 合并，具体样式见 app.css 的登录区。 */
import type { HTMLAttributes, ButtonHTMLAttributes } from 'react'

const cx = (...xs: (string | undefined)[]) => xs.filter(Boolean).join(' ')

export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('ui-card', className)} {...p} />
}
export function CardHeader({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('ui-card-header', className)} {...p} />
}
export function CardTitle({ className, ...p }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cx('ui-card-title', className)} {...p} />
}
export function CardContent({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('ui-card-content', className)} {...p} />
}

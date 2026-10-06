/* .swrow / .txt / .sw 这些类名全靠 tool.css 生效，结构一动就散架。 */
import Tool from '../lib/tool.js'

export default function SwitchRow({ label, desc, on, onChange }: {
  label: string; desc?: string; on: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div className="swrow">
      <div className="txt">
        <div className="t">{label}</div>
        {desc ? <div className="d">{desc}</div> : null}
      </div>
      <button className={'sw' + (on ? ' on' : '')} type="button" role="switch"
              aria-checked={String(on) as 'true' | 'false'}
              onClick={() => { Tool.haptic(8); Tool.sound.tick(); onChange(!on) }} />
    </div>
  )
}

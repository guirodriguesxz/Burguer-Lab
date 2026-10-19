import { useId, useState } from 'react'

/** Campo de senha com botão para mostrar/ocultar (o rótulo fica fora do <label> do botão, para o leitor de tela). */
export default function PasswordInput({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete: string
}) {
  const [visible, setVisible] = useState(false)
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <span className="pw">
        <input id={id} type={visible ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required />
        <button type="button" className="pw-toggle" onClick={() => setVisible(!visible)} aria-pressed={visible} aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}>
          {visible ? 'Ocultar' : 'Mostrar'}
        </button>
      </span>
    </div>
  )
}

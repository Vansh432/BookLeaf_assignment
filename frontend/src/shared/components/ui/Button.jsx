import { buttonClass } from './buttonStyles.js'
import Icon from './Icon.jsx'
import Spinner from './Spinner.jsx'

function Button({ variant = 'primary', icon, isLoading = false, className = '', children, disabled, ...props }) {
  return (
    <button type="button" className={buttonClass(variant, className)} disabled={disabled || isLoading} {...props}>
      {isLoading ? <Spinner className="size-4" /> : icon && <Icon name={icon} className="size-4" />}
      {children}
    </button>
  )
}

export default Button

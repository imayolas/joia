import { AppEngineType } from '@/components/apps/appsTypes'
import {
  SelectField,
  type SelectFieldProps,
} from '@/components/ui/forms/SelectField'

const options = [
  { value: AppEngineType.OpenaiAssistant, label: 'OpenAI' },
  { value: AppEngineType.Basic, label: 'Basic' },
]

export const AppConfigForGPTSelectEngineFormField = ({
  ...selectProps
}: Omit<SelectFieldProps, 'options'>) => {
  return <SelectField {...selectProps} options={options} />
}

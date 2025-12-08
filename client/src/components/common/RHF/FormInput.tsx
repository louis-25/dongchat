import ErrorMessage from "@/components/ui/ErrorMessage";
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label";
import { useFormContext } from "react-hook-form"
import { FieldError } from "react-hook-form"

interface IFormInput {
    name: string;
    label?: string;
    placeholder?: string;
    type?: "text" | "password" | "number" | "textarea" | "tel";
    disabled?: boolean;
    required?: boolean;
}

const FormInput = ({ name, label, placeholder, type, disabled, required }: IFormInput) => {
    const { register, formState: { errors } } = useFormContext();
    const error = errors[name] as FieldError;

    return (
        <div className="space-y-2">
            {label && <Label htmlFor={name}>{label}</Label>}
            <Input
                id={name}
                {...register(name)}
                placeholder={placeholder}
                type={type}
                disabled={disabled}
                required={required}
            />
            <ErrorMessage error={error} />
        </div>
    )
}

export default FormInput;
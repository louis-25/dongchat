"use client"

import { toast } from "sonner"

const useToast = () => {
    const success = (message: string) => toast.success(message)
    const error = (message: string) => toast.error(message)
    const info = (message: string) => toast.info(message)
    const warning = (message: string) => toast.warning(message)
    const dismiss = () => toast.dismiss()
    return { success, error, info, warning, dismiss }
}

export default useToast

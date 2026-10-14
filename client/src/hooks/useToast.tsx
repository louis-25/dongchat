"use client"

import { toast } from "sonner"

// 렌더마다 같은 함수를 돌려준다. useCallback·useEffect 의존성에 넣어도 effect가 반복되지 않는다.
const toastApi = {
    success: (message: string) => toast.success(message),
    error: (message: string) => toast.error(message),
    info: (message: string) => toast.info(message),
    warning: (message: string) => toast.warning(message),
    dismiss: () => toast.dismiss(),
}

const useToast = () => toastApi

export default useToast

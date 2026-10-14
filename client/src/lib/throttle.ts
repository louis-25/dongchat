// 마지막 허용 이후 ms가 지나야 다시 true. 불안정한 연결에서 재시도마다 같은 확인 요청이 쌓이지 않게 한다.
export const createThrottle = (ms: number, now: () => number = Date.now) => {
  let last = -Infinity;
  return (): boolean => {
    const t = now();
    if (t - last < ms) return false;
    last = t;
    return true;
  };
};

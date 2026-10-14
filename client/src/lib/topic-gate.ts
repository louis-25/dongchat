// 같은 키(Realtime 토픽)는 이전 해제가 끝난 뒤에만 새로 연다.
// realtime-js의 channel(topic)은 해제 중인 같은 토픽 채널을 그대로 돌려주므로, 기다리지 않으면
// StrictMode 재마운트·나갔다 다시 들어온 방에서 새 구독이 조용히 사라진다.
export type Close = () => Promise<unknown>;

export const createTopicGate = () => {
  const closing = new Map<string, Promise<unknown>>();
  return (key: string, open: () => Close): (() => void) => {
    let close: Close | null = null;
    let cancelled = false;
    void (closing.get(key) ?? Promise.resolve()).then(() => {
      if (!cancelled) close = open();
    });
    return () => {
      cancelled = true;
      if (!close) return;
      const done = close().catch(() => undefined);
      closing.set(key, done);
      void done.then(() => {
        if (closing.get(key) === done) closing.delete(key);
      });
    };
  };
};

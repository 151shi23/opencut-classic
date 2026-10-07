import { useEffect, useRef } from "react";

export function useRafLoop(callback: ({ time }: { time: number }) => void) {
	const requestRef = useRef<number>(0);
	const previousTimeRef = useRef<number | null>(null);

	useEffect(() => {
		const loop = ({ time }: { time: number }) => {
			const previousTime = previousTimeRef.current;
			previousTimeRef.current = time;
			requestRef.current = requestAnimationFrame((nextTime) =>
				loop({ time: nextTime }),
			);

			if (previousTime === null) return;

			try {
				callback({ time: time - previousTime });
			} catch {
				// 单帧回调抛错不能让循环停摆：下一帧已经排好，预览还能自己恢复。
			}
		};

		requestRef.current = requestAnimationFrame((time) => loop({ time }));
		return () => cancelAnimationFrame(requestRef.current);
	}, [callback]);
}

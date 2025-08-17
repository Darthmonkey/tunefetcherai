/// <reference types="vite/client" />

interface EventSource {
  new(url: string | URL, eventSourceInitDict?: EventSourceInit): EventSource;
  readonly CONNECTING: 0;
  readonly OPEN: 1;
  readonly CLOSED: 2;
  readyState: number;
  url: string;
  onopen: ((this: EventSource, ev: Event) => any) | null;
  onmessage: ((this: EventSource, ev: MessageEvent) => any) | null;
  onerror: ((this: EventSource, ev: Event) => any) | null;
  close(): void;
  addEventListener<K extends keyof EventSourceEventMap>(type: K, listener: (this: EventSource, ev: EventSourceEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
  removeEventListener<K extends keyof EventSourceEventMap>(type: K, listener: (this: EventSource, ev: EventSourceEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}

interface EventSourceEventMap {
  "message": MessageEvent;
  "open": Event;
  "error": Event;
}

declare var EventSource: {
  new(url: string | URL, eventSourceInitDict?: EventSourceInit): EventSource;
  readonly CONNECTING: 0;
  readonly OPEN: 1;
  readonly CLOSED: 2;
};
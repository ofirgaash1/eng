// Minimal Node.js type stubs to satisfy Vite's ambient references.
// These definitions intentionally cover only the pieces used during
// TypeScript analysis of the build tooling and should not be relied on
// for application runtime typings.

declare namespace NodeJS {
  interface EventEmitter {
    addListener(event: string | symbol, listener: (...args: any[]) => void): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
    once(event: string | symbol, listener: (...args: any[]) => void): this;
    removeListener(event: string | symbol, listener: (...args: any[]) => void): this;
  }
}

type Buffer = Uint8Array;
declare const Buffer: {
  from(input: ArrayBuffer | string, encoding?: string): Buffer;
};

declare module "node:events" {
  export class EventEmitter implements NodeJS.EventEmitter {
    addListener(event: string | symbol, listener: (...args: any[]) => void): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
    once(event: string | symbol, listener: (...args: any[]) => void): this;
    removeListener(event: string | symbol, listener: (...args: any[]) => void): this;
  }
  export { EventEmitter as default };
}

declare module "node:http" {
  export type OutgoingHttpHeaders = Record<string, string | string[] | number>;
  export interface ClientRequestArgs {
    headers?: OutgoingHttpHeaders;
    [key: string]: any;
  }
  export class IncomingMessage implements NodeJS.EventEmitter {
    addListener(event: string | symbol, listener: (...args: any[]) => void): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
    once(event: string | symbol, listener: (...args: any[]) => void): this;
    removeListener(event: string | symbol, listener: (...args: any[]) => void): this;
    headers: OutgoingHttpHeaders;
    url?: string;
  }
  export class ServerResponse implements NodeJS.EventEmitter {
    addListener(event: string | symbol, listener: (...args: any[]) => void): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
    once(event: string | symbol, listener: (...args: any[]) => void): this;
    removeListener(event: string | symbol, listener: (...args: any[]) => void): this;
    writeHead(statusCode: number, headers?: OutgoingHttpHeaders): void;
    end(data?: any): void;
  }
  export class ClientRequest implements NodeJS.EventEmitter {
    addListener(event: string | symbol, listener: (...args: any[]) => void): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
    once(event: string | symbol, listener: (...args: any[]) => void): this;
    removeListener(event: string | symbol, listener: (...args: any[]) => void): this;
    end(data?: any): void;
  }
  export class Agent {}
  export class Server implements NodeJS.EventEmitter {
    addListener(event: string | symbol, listener: (...args: any[]) => void): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
    once(event: string | symbol, listener: (...args: any[]) => void): this;
    removeListener(event: string | symbol, listener: (...args: any[]) => void): this;
    listen(port: number, hostname?: string, backlog?: number, listeningListener?: () => void): this;
    close(callback?: (err?: Error) => void): this;
  }
  export function createServer(listener: (req: IncomingMessage, res: ServerResponse) => void): Server;
}

declare module "node:https" {
  import type { OutgoingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
  export interface ServerOptions {
    key?: string | Buffer | Array<Buffer | string>;
    cert?: string | Buffer | Array<Buffer | string>;
  }
  export class Server {
    listen(port: number, hostname?: string, backlog?: number, listeningListener?: () => void): this;
    close(callback?: (err?: Error) => void): this;
  }
  export type HttpsServerOptions = ServerOptions;
  export { Server as HttpsServer };
}

declare module "node:http2" {
  export class Http2SecureServer {
    close(callback?: (err?: Error) => void): this;
  }
}

declare module "node:fs" {
  export type Stats = any;
  export type PathLike = string;
  export const promises: Record<string, (...args: any[]) => Promise<any>>;
  export function readFile(path: PathLike, options?: any): Buffer | string;
  export function writeFile(path: PathLike, data: Buffer | string, options?: any): void;
  export interface FSWatcher extends NodeJS.EventEmitter {
    close(): void;
  }
}

declare module "node:net" {
  export class Server implements NodeJS.EventEmitter {
    addListener(event: string | symbol, listener: (...args: any[]) => void): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
    once(event: string | symbol, listener: (...args: any[]) => void): this;
    removeListener(event: string | symbol, listener: (...args: any[]) => void): this;
    listen(port: number, hostname?: string, backlog?: number, listeningListener?: () => void): this;
    close(callback?: (err?: Error) => void): this;
  }
  export class Socket implements NodeJS.EventEmitter {
    addListener(event: string | symbol, listener: (...args: any[]) => void): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
    once(event: string | symbol, listener: (...args: any[]) => void): this;
    removeListener(event: string | symbol, listener: (...args: any[]) => void): this;
  }
}

declare module "node:url" {
  export class URL {
    constructor(url: string, base?: string | URL);
    href: string;
  }
  export function parse(urlStr: string): URL;
  export interface Url {
    href: string;
  }
}

declare module "node:stream" {
  export interface Stream extends NodeJS.EventEmitter {
    addListener(event: string | symbol, listener: (...args: any[]) => void): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
    once(event: string | symbol, listener: (...args: any[]) => void): this;
    removeListener(event: string | symbol, listener: (...args: any[]) => void): this;
  }
  export interface DuplexOptions {
    allowHalfOpen?: boolean;
    readableObjectMode?: boolean;
    writableObjectMode?: boolean;
  }
  export class Duplex implements Stream {
    addListener(event: string | symbol, listener: (...args: any[]) => void): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
    once(event: string | symbol, listener: (...args: any[]) => void): this;
    removeListener(event: string | symbol, listener: (...args: any[]) => void): this;
    constructor(options?: DuplexOptions);
  }
}

declare module "node:tls" {
  export interface SecureContextOptions {
    cert?: string | Buffer | Array<Buffer | string>;
    key?: string | Buffer | Array<Buffer | string>;
  }
}

declare module "node:zlib" {
  export interface ZlibOptions {
    level?: number;
  }
}

declare module "node:*" {
  const mod: any;
  export = mod;
}

declare module "electrobun/view" {
  import type { ElectrobunRPCSchema, RPCWithTransport } from "electrobun/bun";

  type RequestHandlers<Requests> = {
    [K in keyof Requests]?: Requests[K] extends { params: infer Params; response: infer Response }
      ? (params: Params) => Response | Promise<Response>
      : never;
  };

  type MessageHandlers<Messages> = {
    [K in keyof Messages]?: (payload: Messages[K]) => void;
  };

  type RPCConfig<Schema extends ElectrobunRPCSchema, Side extends keyof Schema> = {
    maxRequestTime?: number;
    handlers: {
      requests?: RequestHandlers<Schema[Side]["requests"]>;
      messages?: MessageHandlers<Schema[Side]["messages"]>;
    };
  };

  export class Electroview<T extends RPCWithTransport> {
    constructor(config: { rpc: T });
    static defineRPC<Schema extends ElectrobunRPCSchema>(
      config: RPCConfig<Schema, "webview">,
    ): RPCWithTransport;
  }
}


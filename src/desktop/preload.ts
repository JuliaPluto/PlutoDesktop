import { Electroview } from "electrobun/view";

import type {
  DesktopRPCSchema,
  ExportNotebookParams,
  NotebookIdParams,
  OpenKind,
  OpenNotebookParams,
  PlutoExportValue,
} from "./rpc";

type Listener = (...args: unknown[]) => void;
type ListenerMap = Map<string, Set<Listener>>;

type DesktopRPC = {
  setTransport(transport: unknown): void;
  request: {
    isBackendLoaded(): Promise<boolean>;
    openNotebook(params?: OpenNotebookParams): Promise<void>;
    shutdownNotebook(params?: NotebookIdParams): Promise<void>;
    moveNotebook(params?: NotebookIdParams): Promise<string | null>;
    exportNotebook(params: ExportNotebookParams): Promise<void>;
  };
  addMessageListener(
    channel: "set-block-screen-text",
    listener: (payload: string | null) => void,
  ): void;
};

const listeners: ListenerMap = new Map();

const emit = (channel: string, ...args: unknown[]) => {
  for (const listener of listeners.get(channel) ?? []) {
    listener(...args);
  }
};

const on = (channel: string, listener: Listener) => {
  const channelListeners = listeners.get(channel) ?? new Set<Listener>();
  channelListeners.add(listener);
  listeners.set(channel, channelListeners);

  return () => {
    channelListeners.delete(listener);
    if (channelListeners.size === 0) listeners.delete(channel);
  };
};

const once = (channel: string, listener: Listener) => {
  const remove = on(channel, (...args) => {
    remove();
    listener(...args);
  });
};

const rpc = Electroview.defineRPC<DesktopRPCSchema>({
  handlers: {
    requests: {},
    messages: {
      "set-block-screen-text": (text) => {
        emit("set-block-screen-text", text);
      },
    },
  },
  maxRequestTime: 30_000,
}) as unknown as DesktopRPC;

new Electroview({ rpc });

const moveNotebook = async (id?: string) => {
  const loc = await rpc.request.moveNotebook({ id });
  emit("PLUTO-MOVE-NOTEBOOK", loc);
};

const sendMessage = (channel: unknown, args: unknown[]) => {
  const [first, second] = args;
  switch (String(channel)) {
    case "PLUTO-OPEN-NOTEBOOK":
      void rpc.request.openNotebook({
        type: isOpenKind(first) ? first : "new",
        pathOrURL: typeof second === "string" ? second : undefined,
      });
      break;
    case "PLUTO-SHUTDOWN-NOTEBOOK":
      void rpc.request.shutdownNotebook({
        id: typeof first === "string" ? first : undefined,
      });
      break;
    case "PLUTO-MOVE-NOTEBOOK":
      void moveNotebook(typeof first === "string" ? first : undefined);
      break;
    case "PLUTO-EXPORT-NOTEBOOK":
      if (typeof first === "string" && isExportValue(second)) {
        void rpc.request.exportNotebook({ id: first, type: second });
      }
      break;
  }
};

Object.defineProperty(window, "plutoDesktop", {
  configurable: false,
  enumerable: true,
  value: {
    ipcRenderer: {
      sendMessage,
      on,
      once,
    },
    isBackendLoaded: () => rpc.request.isBackendLoaded(),
    fileSystem: {
      openNotebook: (type: OpenKind = "new", pathOrURL?: string) => {
        void rpc.request.openNotebook({ type, pathOrURL });
      },
      shutdownNotebook: (id?: string) => {
        void rpc.request.shutdownNotebook({ id });
      },
      moveNotebook: (id?: string) => {
        void moveNotebook(id);
      },
      exportNotebook: (id: string, type: PlutoExportValue) => {
        void rpc.request.exportNotebook({ id, type });
      },
    },
  },
});

function isOpenKind(value: unknown): value is OpenKind {
  return value === "new" || value === "path" || value === "url";
}

function isExportValue(value: unknown): value is PlutoExportValue {
  return value === "file" || value === "html" || value === "state" || value === "pdf";
}

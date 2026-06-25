export type OpenKind = "url" | "path" | "new";

export type PlutoExportValue = "file" | "html" | "state" | "pdf";

export type OpenNotebookParams = {
  type?: OpenKind;
  pathOrURL?: string;
};

export type NotebookIdParams = {
  id?: string;
};

export type ExportNotebookParams = {
  id: string;
  type: PlutoExportValue;
};

export type DesktopRPCSchema = {
  bun: {
    requests: {
      isBackendLoaded: {
        params: undefined;
        response: boolean;
      };
      openNotebook: {
        params: OpenNotebookParams | undefined;
        response: void;
      };
      shutdownNotebook: {
        params: NotebookIdParams | undefined;
        response: void;
      };
      moveNotebook: {
        params: NotebookIdParams | undefined;
        response: string | null;
      };
      exportNotebook: {
        params: ExportNotebookParams;
        response: void;
      };
    };
    messages: Record<never, never>;
  };
  webview: {
    requests: Record<never, never>;
    messages: {
      "set-block-screen-text": string | null;
    };
  };
};


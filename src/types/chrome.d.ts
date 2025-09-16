// Chrome Extension API type declarations
declare namespace chrome {
  namespace runtime {
    function sendMessage(message: any): void;
    const onMessage: {
      addListener(callback: (message: any) => void): void;
      removeListener(callback: (message: any) => void): void;
    };
  }

  namespace tabs {
    function create(options: { url: string }): void;
    function remove(tabId: number): void;
    const onUpdated: {
      addListener(
        callback: (tabId: number, changeInfo: any, tab: any) => void
      ): void;
    };
  }

  namespace storage {
    namespace local {
      function get(keys: string[]): Promise<Record<string, any>>;
      function set(items: Record<string, any>): Promise<void>;
      function remove(keys: string[]): Promise<void>;
    }
  }
}

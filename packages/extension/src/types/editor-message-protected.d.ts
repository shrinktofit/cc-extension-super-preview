declare namespace Editor {
  namespace Module {
    function removeCache(path: string): void;
    function requireFile(path: string): unknown;
  }

  namespace Message {
    namespace __protected__ {
      function addBroadcastListener(message: string, listener: (...args: unknown[]) => void): void;
      function removeBroadcastListener(message: string, listener: (...args: unknown[]) => void): void;
    }
  }
}

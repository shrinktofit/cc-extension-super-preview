declare namespace Editor {
  namespace Message {
    namespace __protected__ {
      function addBroadcastListener(message: string, listener: (...args: unknown[]) => void): void;
      function removeBroadcastListener(message: string, listener: (...args: unknown[]) => void): void;
    }
  }
}

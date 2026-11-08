if (typeof crypto === "undefined" || !crypto.getRandomValues) {
  (globalThis as unknown as { crypto: { getRandomValues: (array: Uint8Array) => Uint8Array } }).crypto = {
    getRandomValues<T extends ArrayBufferView | null>(array: T): T {
      if (!array) return array;
      const view = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      for (let i = 0; i < view.length; i++) view[i] = Math.floor(Math.random() * 256);
      return array;
    },
  };
}

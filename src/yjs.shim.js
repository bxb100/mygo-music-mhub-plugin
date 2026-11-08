if (typeof crypto === "undefined" || !crypto.getRandomValues) {
  globalThis.crypto = {
    getRandomValues(array) {
      for (let i = 0; i < array.length; i++) array[i] = Math.floor(Math.random() * 4294967296);
      return array;
    },
  };
}

import * as Y from "yjs";
import {
  readLibrary,
  createPlaylist,
  appendTracks,
  removeTrack,
  renamePlaylist,
  deletePlaylist,
  moveTrack,
} from "./library.js";

globalThis.MHubLibrary = {
  Doc: Y.Doc,
  encodeStateVector: Y.encodeStateVector,
  encodeStateAsUpdate: Y.encodeStateAsUpdate,
  applyUpdate: Y.applyUpdate,
  readLibrary,
  createPlaylist,
  appendTracks,
  removeTrack,
  renamePlaylist,
  deletePlaylist,
  moveTrack,
};

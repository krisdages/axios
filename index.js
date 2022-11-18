import axios from './lib/axios.js';

// This module is intended to unwrap Axios default export as named.
// Keep top-level export same with static properties
// so that it can keep same with es module or cjs
const {
  Axios,
  AxiosError,
  CanceledError,
  isCancel,
  CancelToken,
  VERSION,
  all,
  Cancel,
  isAxiosError,
  spread,
  toFormData,
  AxiosHeaders,
  formToJSON
} = axios;

export let defaults = axios.defaults;
Object.defineProperty(
    axios,
    "defaults",
    { enumerable: true, get() { return defaults; }, set(v) { defaults = v; } }
);

export {
  axios as default,
  Axios,
  AxiosError,
  CanceledError,
  isCancel,
  CancelToken,
  VERSION,
  all,
  Cancel,
  isAxiosError,
  spread,
  toFormData,
  AxiosHeaders,
  formToJSON
}

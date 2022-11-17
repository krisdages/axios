'use strict';

import utils from './../utils.js';
import settle from './../core/settle.js';
import cookies from './../helpers/cookies.js';
import buildURL from './../helpers/buildURL.js';
import buildFullPath from '../core/buildFullPath.js';
import isURLSameOrigin from './../helpers/isURLSameOrigin.js';
import transitionalDefaults from '../defaults/transitional.js';
import AxiosError from '../core/AxiosError.js';
import CanceledError from '../cancel/CanceledError.js';
import parseProtocol from '../helpers/parseProtocol.js';
import platform from '../platform/index.js';
import AxiosHeaders from '../core/AxiosHeaders.js';

let noFetch = typeof fetch === "undefined";

function isNetworkError(err) {
  if (err == null)
    return false;

  try {
    const message = err.message;
    if (err.name === "TypeError") {
      //Network error messages -
      //Chrome: "Failed to fetch"
      //Firefox: "NetworkError ..."
      //TODO: Verify message for safari.
      return message != null && (message.includes("fetch") || message.includes("NetworkError"));
    }
    //Edge (currently as of 2020 - doesn't throw TypeError despite that being in the spec.)
    //If edge follows the spec, remove this.
    else if (message === "Failed to fetch") {
      return true;
    }
    return false;
  }
  catch (e) {
    return false;
  }
}

export default function fetchAdapter(config) {
  return new Promise(function dispatchFetchRequest(resolve, reject) {
    if (noFetch) {
      noFetch = typeof fetch === "undefined";
      if (noFetch) {
        reject(new AxiosError("window.fetch not available", "ERR_FETCH_UNAVAILABLE", config, null));
        return;
      }
    }

    let request;
    let configSignal = config.signal;
    let configSignalOnAbortWithTimeout;

    const cleanup = () => {
      request = undefined;
      if (configSignal && configSignalOnAbortWithTimeout) {
        configSignal.removeEventListener("abort", configSignalOnAbortWithTimeout);
      }
    }

    let requestData = config.data;
    const requestHeaders = AxiosHeaders.from(config.headers).normalize();

    if (utils.isFormData(requestData) && platform.isStandardBrowserEnv) {
      requestHeaders.setContentType(false); // Let the browser set it
    }

    // HTTP basic authentication
    if (config.auth) {
      const username = config.auth.username || '';
      const password = config.auth.password ? unescape(encodeURIComponent(config.auth.password)) : '';
      requestHeaders.set('Authorization', 'Basic ' + btoa(username + ':' + password));
    }

    const fullPath = buildFullPath(config.baseURL, config.url);

    const protocol = parseProtocol(fullPath);

    if (protocol && platform.protocols.indexOf(protocol) === -1) {
      reject(new AxiosError('Unsupported protocol ' + protocol + ':', AxiosError.ERR_BAD_REQUEST, config));
      return;
    }

    const url = buildURL(fullPath, config.params, config.paramsSerializer);

    let data;
    let dataError = false;
    let timing = {}, perf;
    let { responseType } = config;
    if (!responseType) {
      responseType = "text";
    }
    else if (responseType.toLowerCase() === "arraybuffer") {
      responseType = "arrayBuffer";
    }

    if (config.performance) {
      if (config.performance === true) {
        if (typeof performance !== "undefined") {
          perf = performance;
        }
      }
      else {
        perf = config.performance;
      }
    }

    // Handle the response
    async function handleLoad(response) {
      try {
        // Prepare the response
        const responseHeaders = new AxiosHeaders();
        if (response.headers) {
          for (const [key, val] of response.headers) {
            responseHeaders.set(key, val);
          }
        }

        if (responseType === "none") {
          data = undefined;
          perf = undefined;
        } else if (responseType === "stream") {
          if (perf) {
            timing.responseStart = perf.now();
          }
          data = response.body;
          // if (streamCancelTransformer != null) {
          // 	data = data.pipeThrough(new TransformStream(streamCancelTransformer));
          // }
        } else if (typeof response[responseType] === "function") {
          try {
            if (perf) {
              timing.responseStart = perf.now();
              data = await response[responseType]();
              timing.responseEnd = perf.now();
            } else {
              data = await response[responseType]();
            }
          } catch (err) {
            handleError(err, response);
            return;
          }
        } else {
          dataError = true;
          perf = undefined;
        }

        const axiosResponse = {
          data,
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          config,
          request,
          response
        };

        if (perf) {
          axiosResponse.timing = timing;
        }

        if (dataError) {
          reject(new AxiosError('Unknown responseType ' + responseType, "ERR_UNKNOWN_RESPONSE_TYPE", config, request, axiosResponse));
        }

        settle(resolve, reject, axiosResponse);
      }
      finally {
        // Clean up request
        cleanup();
      }
    }

    // Wrap low level network errors or trigger reject for non-network errors.
    // Promise rejection handler for fetch() and called with rawResponse when error thrown awaiting response data
    function handleError(thrown, rawResponse) {
      try {
        if (thrown instanceof DOMException && thrown.name === "AbortError") {
          const err = new CanceledError(typeof thrown.reason === "string" ? thrown.reason : null, config, request);
          err.response = rawResponse;
          err.abortError = thrown;
          reject(err);
        }
        else if (isNetworkError(thrown)) {
          const err = new AxiosError('Network Error', AxiosError.ERR_NETWORK, config, request, rawResponse);
          err.cause = thrown;
          reject(err);
        }
        else {
          reject(AxiosError.from(
              thrown,
              thrown.name === "SyntaxError" ? AxiosError.ERR_BAD_RESPONSE : null,
              config,
              request,
              rawResponse
          ));
        }
      }
      finally {
        // Clean up request
        cleanup()
      }
    }

    const requestInit = { method: config.method.toUpperCase() };

    // Add xsrf header
    // This is only done if running in a standard browser environment.
    // Specifically not if we're in a web worker, or react-native.
    if (platform.isStandardBrowserEnv) {
      // Add xsrf header
      const xsrfValue = (config.withCredentials || isURLSameOrigin(fullPath))
        && config.xsrfCookieName && cookies.read(config.xsrfCookieName);

      if (xsrfValue) {
        requestHeaders.set(config.xsrfHeaderName, xsrfValue);
      }
    }

    if (requestData !== undefined) {
      requestInit.body = requestData;
    }
    else {
      // Remove Content-Type if data is undefined
      requestHeaders.setContentType(null)
    }

    // Add headers to the request
    const headers = new Headers();
    utils.forEach(requestHeaders.toJSON(), function setRequestHeader(val, key) {
        headers.set(key, val);
    });
    requestInit.headers = headers;

    // Add withCredentials to request if needed
    if (!utils.isUndefined(config.withCredentials)) {
      requestInit.withCredentials = !!config.withCredentials;
    }

    requestInit.signal = configSignal;

    const hasTimeout = typeof config.timeout === "number" && config.timeout > 0;
    let fetchFinally;
    let timeoutHandle;

    if (hasTimeout) {
      const abort = (rejection) => {
        const req = request;
        // Clean up request
        cleanup()
        try {
          if (signal.aborted)
            return;
        } catch (e) { void e; }

        if (rejection === "timeout") {
          let timeoutErrorMessage = 'timeout of ' + config.timeout + 'ms exceeded';
          const transitional = config.transitional || transitionalDefaults;
          if (config.timeoutErrorMessage) {
            timeoutErrorMessage = config.timeoutErrorMessage;
          }
          rejection = new AxiosError(
              timeoutErrorMessage,
              transitional.clarifyTimeoutError ? AxiosError.ETIMEDOUT : AxiosError.ECONNABORTED,
              config,
              req
          );
        }
        reject(rejection);
        abortController.abort();
      }

      // Handle cancellation
      const abortController = new AbortController();
      const signal = requestInit.signal = abortController.signal;

      timeoutHandle = setTimeout(() => { abort("timeout"); }, config.timeout);
      fetchFinally = () => {
        if (timeoutHandle !== undefined) {
          try {
            clearTimeout(timeoutHandle)
          }
          catch (e) { void e; }
        }
      }

      //A separate AbortSignal is used for the timeout so that the timeout only applies to the receipt of the response.
      // A response stream may be consumed after the timeout.
      //An external AbortSignal passed in the config object will abort the entire request,
      // including any response stream in progress.
      if (configSignal) {
        configSignalOnAbortWithTimeout = () => {
          configSignalOnAbortWithTimeout = undefined;
          abort(configSignal.reason);
        }
        configSignal.addEventListener("abort", configSignalOnAbortWithTimeout, ONCE);
      }
    }

    // Send the request
    request = new Request(url.toString(), requestInit);
    fetch(request).finally(fetchFinally).then(handleLoad, handleError);
  });
}

const ONCE = Object.freeze({ once: true });

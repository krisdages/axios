import { setup } from './__fetch';
import _axios from '../../index.js';

setup();

window.axios = _axios;

// Jasmine config
jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000;
jasmine.getEnv().defaultTimeoutInterval = 20000;

// Get Ajax request using an increasing timeout to retry
window.getAjaxRequest = (function () {
  let attempts = 0;
  const MAX_ATTEMPTS = 5;
  const ATTEMPT_DELAY_FACTOR = 5;

  function getAjaxRequest() {
    return new Promise(function (resolve, reject) {
      attempts = 0;
      attemptGettingAjaxRequest(resolve, reject);
    });
  }

  function attemptGettingAjaxRequest(resolve, reject) {
    const delay = attempts * attempts * ATTEMPT_DELAY_FACTOR;

    if (attempts++ > MAX_ATTEMPTS) {
      reject(new Error('No request was found'));
      return;
    }

    setTimeout(function () {
      const request = jasmine.Ajax.requests.mostRecent();
      if (request) {
        resolve(request);
      } else {
        attemptGettingAjaxRequest(resolve, reject);
      }
    }, delay);
  }

  return getAjaxRequest;
})();

window.getRequestHeader = (request, key) => {
  return request.requestHeaders[key] ?? request.requestHeaders[key.toLowerCase()];
}

const adapters = [
    { description: "fetch -", adapter: _axios.defaults.allAdapters.fetch },
    { description: "XHR -", adapter: _axios.defaults.allAdapters.xhr },
]
window.forEachAdapter = (specDescription, fn) => {
    let originalAdapter = axios.defaults.adapter;
    for (const { description, adapter } of adapters) {
      describe(`${description} - ${specDescription}`, function() {
        beforeEach(function () {
          axios.defaults.adapter = adapter;
        });
        afterEach(function () {
          axios.defaults.adapter = originalAdapter;
        });
        fn(adapter);
      });
    }
}

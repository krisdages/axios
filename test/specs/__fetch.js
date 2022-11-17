import * as fetchPolyfill from 'whatwg-fetch';

console.clear = () => {};

// replace native fetch with polyfill
const original = {};
original.fetch = window.fetch;
original.DOMException = window.DOMException;
original.Headers = window.Headers;
original.Request = window.Request;
original.Response = window.Response;

export function setup() {
  const installAjax = jasmine.Ajax.install.bind(jasmine.Ajax);
  const uninstallAjax = jasmine.Ajax.uninstall.bind(jasmine.Ajax);
  jasmine.Ajax.install = () => {
    window.fetch = fetchPolyfill.fetch;
    window.DOMException = fetchPolyfill.DOMException;
    window.Headers = fetchPolyfill.Headers;
    window.Request = fetchPolyfill.Request;
    window.Response = fetchPolyfill.Response;
    installAjax();
  };
  jasmine.Ajax.uninstall = () => {
    window.fetch = original.fetch;
    window.DOMException = original.DOMException;
    window.Headers = original.Headers;
    window.Request = original.Request;
    window.Response = original.Response;
    uninstallAjax();
  };
}

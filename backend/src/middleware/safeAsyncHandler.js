'use strict';

const METHODS = ['use', 'all', 'get', 'post', 'put', 'patch', 'delete', 'options', 'head'];
let patched = false;

function isPromiseLike(value) {
  return Boolean(value) && typeof value.then === 'function' && typeof value.catch === 'function';
}

function safeAsyncHandler(handler) {
  if (typeof handler !== 'function') return handler;
  if (handler.length === 4) return handler;

  return function wrappedAsyncHandler(req, res, next) {
    try {
      const result = handler(req, res, next);
      if (isPromiseLike(result)) {
        result.catch(next);
      }
      return result;
    } catch (error) {
      return next(error);
    }
  };
}

function wrapHandlers(args = []) {
  return args.map((arg) => {
    if (Array.isArray(arg)) return wrapHandlers(arg);
    return safeAsyncHandler(arg);
  });
}

function patchExpressAsyncHandling(express) {
  if (patched || !express?.Router) return;
  const routerProto = express.Router && express.Router.prototype;
  if (!routerProto) return;

  METHODS.forEach((method) => {
    const original = routerProto[method];
    if (typeof original !== 'function') return;
    routerProto[method] = function patchedRouterMethod(...args) {
      return original.apply(this, wrapHandlers(args));
    };
  });

  patched = true;
}

module.exports = {
  patchExpressAsyncHandling,
  safeAsyncHandler,
};

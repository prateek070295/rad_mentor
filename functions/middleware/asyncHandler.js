/**
 * Wrap an async Express handler and funnel rejections to next().
 * @param {import("express").RequestHandler} handler
 * @returns {import("express").RequestHandler}
 */
const asyncHandler = (handler) => {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
};

export default asyncHandler;

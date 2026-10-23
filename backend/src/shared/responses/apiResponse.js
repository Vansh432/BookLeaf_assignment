export const sendSuccess = (res, { statusCode = 200, message = 'Operation successful', data = {} } = {}) =>
  res.status(statusCode).json({ status: true, message, data });

export const sendFailure = (res, { statusCode = 500, message = 'Something went wrong', errors = [] } = {}) =>
  res.status(statusCode).json({ status: false, message, errors });

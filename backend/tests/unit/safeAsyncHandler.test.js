const { safeAsyncHandler } = require('../../src/middleware/safeAsyncHandler');

describe('safeAsyncHandler', () => {
  it('forwards rejected async errors to next', async () => {
    const next = jest.fn();
    const handler = safeAsyncHandler(async () => {
      throw new Error('boom');
    });

    handler({}, {}, next);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0].message).toBe('boom');
  });

  it('catches sync thrown errors', () => {
    const next = jest.fn();
    const handler = safeAsyncHandler(() => {
      throw new Error('sync');
    });
    handler({}, {}, next);
    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0].message).toBe('sync');
  });
});

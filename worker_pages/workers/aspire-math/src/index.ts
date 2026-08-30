export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== '/add') {
      return new Response('Not found', { status: 404 });
    }

    const firstParameter = url.searchParams.get('a');
    const secondParameter = url.searchParams.get('b');
    const firstValue = firstParameter === null ? NaN : Number(firstParameter);
    const secondValue = secondParameter === null ? NaN : Number(secondParameter);

    if (!Number.isFinite(firstValue) || !Number.isFinite(secondValue)) {
      return Response.json(
        { error: 'Query parameters a and b must be valid numbers' },
        { status: 500 }
      );
    }

    return Response.json(
      { a: firstValue, b: secondValue, result: firstValue + secondValue },
      { status: 200 }
    );
  }
};

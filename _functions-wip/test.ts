export async function onRequest(context: EventContext): Promise<Response> {
  return new Response('Test OK', { status: 200 });
}

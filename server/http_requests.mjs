export async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

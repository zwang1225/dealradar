const ENDPOINT = "https://api.lcbo.dev/graphql";

export async function lcboQuery(query, variables = {}) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (body.errors) {
    throw new Error(`LCBO API error: ${JSON.stringify(body.errors)}`);
  }
  return body.data;
}

// Walks a `pagination:{first,after}` connection to completion, calling
// `fetchPage(after)` for each page and `onEdge(node)` for each item.
// Stays well under the API's 60 req/60s rate limit for our small,
// deals-scoped queries, so no throttling needed here.
export async function paginateAll(fetchPage, getConnection, onEdge) {
  let after = null;
  let hasNextPage = true;
  while (hasNextPage) {
    const data = await fetchPage(after);
    const connection = getConnection(data);
    for (const edge of connection.edges) {
      onEdge(edge.node);
    }
    hasNextPage = connection.pageInfo.hasNextPage;
    after = connection.pageInfo.endCursor;
  }
}

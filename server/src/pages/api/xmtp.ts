import type { APIRoute } from "astro";

const AGENT_URL = import.meta.env.AGENT_URL || "http://localhost:3001";

export const POST: APIRoute = async ({ request }) => {
  try {
    const { message, userFid } = await request.json();

    const response = await fetch(`${AGENT_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, userFid }),
    });

    const data = await response.json();
    return new Response(JSON.stringify({ response: data.response }), {
      status: 200,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Failed to connect to agent" }),
      { status: 500 }
    );
  }
};

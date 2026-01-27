import { NextRequest, NextResponse } from "next/server";
import { getApiUrl } from "../../../../lib/api-config";

// Force dynamic rendering for this route
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function fetchWithRetry(
  url: string,
  retries: number = 3,
  delay: number = 1000,
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
        },
        // Add timeout
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });
      return response;
    } catch (error) {
      console.warn(`Attempt ${i + 1} failed for ${url}:`, error);

      // If this is the last retry, throw the error
      if (i === retries - 1) {
        throw error;
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("All retry attempts failed");
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Construir la URL del backend con los parámetros de búsqueda
    const backendUrl = new URL(`${getApiUrl()}/public/leads`);
    searchParams.forEach((value, key) => {
      backendUrl.searchParams.set(key, value);
    });

    console.log("Fetching leads from:", backendUrl.toString());
    const response = await fetchWithRetry(backendUrl.toString());

    if (!response.ok) {
      console.error(
        `Backend returned ${response.status}: ${response.statusText}`,
      );
      return NextResponse.json(
        { error: `Backend error: ${response.status} ${response.statusText}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    console.log(
      "Successfully fetched leads:",
      data.meta || { total: data.data?.length || 0 },
    );
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in leads API:", error);

    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes("ECONNREFUSED")) {
        return NextResponse.json(
          {
            error:
              "API service is not available. Please ensure the backend service is running on port 3003.",
          },
          { status: 503 },
        );
      }

      if (error.name === "TimeoutError") {
        return NextResponse.json(
          {
            error:
              "Request timeout. The backend service is taking too long to respond.",
          },
          { status: 504 },
        );
      }
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const body = await request.json();
    console.log("Creating new lead with data:", {
      ...body,
      phone: body.phone ? "***" : undefined,
    });

    // Validate required fields
    if (!body.phone) {
      return NextResponse.json(
        { error: "Phone number is required" },
        { status: 400 },
      );
    }

    // Forward the request to the backend service
    const backendUrl = `${getApiUrl()}/public/leads`;
    const response = await fetch(backendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: "Unknown error" }));
      console.error(`Backend returned ${response.status}:`, errorData);

      return NextResponse.json(errorData, { status: response.status });
    }

    const newLead = await response.json();
    console.log("Successfully created lead:", {
      id: newLead.id,
      name: newLead.name,
    });

    return NextResponse.json(newLead, { status: 201 });
  } catch (error) {
    console.error("Error in create lead API:", error);

    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes("ECONNREFUSED")) {
        return NextResponse.json(
          {
            error:
              "API service is not available. Please ensure the backend service is running on port 3003.",
          },
          { status: 503 },
        );
      }

      if (error.name === "TimeoutError") {
        return NextResponse.json(
          {
            error:
              "Request timeout. The backend service is taking too long to respond.",
          },
          { status: 504 },
        );
      }
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

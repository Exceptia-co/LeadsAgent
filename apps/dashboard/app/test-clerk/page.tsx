"use client";

import { useUser } from "@clerk/nextjs";

export default function TestClerkPage() {
  const { user, isLoaded, isSignedIn } = useUser();

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">🔍 Clerk Diagnostic Page</h1>

      <div className="space-y-4">
        <div className="bg-gray-100 p-4 rounded">
          <h2 className="font-semibold">Clerk Hook Status:</h2>
          <p>IsLoaded: {isLoaded ? "✅ True" : "❌ False"}</p>
          <p>IsSignedIn: {isSignedIn ? "✅ True" : "❌ False"}</p>
        </div>

        <div className="bg-gray-100 p-4 rounded">
          <h2 className="font-semibold">User Object:</h2>
          <pre className="text-sm overflow-auto max-h-40">
            {JSON.stringify(user, null, 2)}
          </pre>
        </div>

        <div className="bg-gray-100 p-4 rounded">
          <h2 className="font-semibold">Environment Variables:</h2>
          <p>
            Publishable Key Present:{" "}
            {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? "✅ Yes" : "❌ No"}
          </p>
          <p>
            Key Preview:{" "}
            {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.substring(0, 20)}...
          </p>
        </div>

        <div className="bg-gray-100 p-4 rounded">
          <h2 className="font-semibold">Current Timestamp:</h2>
          <p>{new Date().toISOString()}</p>
        </div>
      </div>

      <div className="mt-8">
        <a
          href="/sign-in"
          className="bg-green-500 text-white px-4 py-2 rounded mr-4"
        >
          Go to Sign In
        </a>
        <a
          href="/dashboard"
          className="bg-green-500 text-white px-4 py-2 rounded"
        >
          Go to Dashboard
        </a>
      </div>
    </div>
  );
}

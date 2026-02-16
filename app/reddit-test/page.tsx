"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

interface CommentResponse {
  success: boolean;
  method?: "api" | "playwright";
  commentId?: string;
  error?: string;
}

export default function RedditTestPage() {
  const [postInput, setPostInput] = useState("");
  const [commentId, setCommentId] = useState("");
  const [text, setText] = useState("");
  const [usePlaywright, setUsePlaywright] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CommentResponse | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/reddit/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId: postInput.trim(),
          commentId: commentId.trim() || undefined,
          text: text.trim(),
          usePlaywright,
        }),
      });
      const data: CommentResponse = await response.json();
      setResult(
        response.ok ? data : { ...data, success: false, error: data.error ?? `HTTP ${response.status}` }
      );
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : "Request failed",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Reddit Auto-Commenter</h1>
        <p className="text-gray-600 mb-6">
          Post a reply on a Reddit post or comment. Uses OAuth API first; Playwright fallback if you set REDDIT_SESSION_COOKIE.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4 bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
          <div>
            <label htmlFor="post" className="block text-sm font-medium text-gray-700 mb-1">
              Post URL or Post ID *
            </label>
            <input
              id="post"
              type="text"
              value={postInput}
              onChange={(e) => setPostInput(e.target.value)}
              placeholder="e.g. https://reddit.com/r/.../comments/abc123/... or abc123"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label htmlFor="commentId" className="block text-sm font-medium text-gray-700 mb-1">
              Comment ID (optional)
            </label>
            <input
              id="commentId"
              type="text"
              value={commentId}
              onChange={(e) => setCommentId(e.target.value)}
              placeholder="Leave empty to reply to the post; set to reply to a specific comment"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="text" className="block text-sm font-medium text-gray-700 mb-1">
              Comment text *
            </label>
            <textarea
              id="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="Your reply (markdown supported)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="playwright"
              type="checkbox"
              checked={usePlaywright}
              onChange={(e) => setUsePlaywright(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="playwright" className="text-sm text-gray-700">
              Force Playwright (browser) — requires REDDIT_SESSION_COOKIE
            </label>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Posting…
              </>
            ) : (
              "Post comment"
            )}
          </button>
        </form>

        {result && (
          <div
            className={`mt-6 rounded-lg border p-4 ${
              result.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
            }`}
          >
            <p className={`font-medium ${result.success ? "text-green-800" : "text-red-800"}`}>
              {result.success ? "Comment posted" : "Failed"}
            </p>
            {result.success && (
              <p className="mt-1 text-sm text-green-700">
                Method: <strong>{result.method}</strong>
                {result.commentId && ` · Comment ID: ${result.commentId}`}
              </p>
            )}
            {result.error && <p className="mt-1 text-sm text-red-700">{result.error}</p>}
          </div>
        )}

        <div className="mt-8 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
          <p className="font-medium text-gray-800 mb-2">Setup</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Create a script app at reddit.com/prefs/apps</li>
            <li>Set REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD in .env.local</li>
            <li>Optional (Playwright fallback): set REDDIT_SESSION_COOKIE from DevTools → Application → Cookies → reddit.com → reddit_session</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";

interface ProfileData {
  profilePictureUrl: string | null;
  username: string;
  fullName: string | null;
  biography: string | null;
  website: string | null;
  isVerified: boolean;
  category: string | null;
  postCount: number | null;
  followerCount: number | null;
  followingCount: number | null;
}

interface Comment {
  author: string;
  text: string;
}

interface Post {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  caption: string | null;
  date: string | null;
  likeCount: number | null;
  commentCount: number | null;
  comments: Comment[];
}

interface ScrapeResult {
  profile: ProfileData;
  posts: Post[];
}

export default function TestInstagramScraper() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/test/instagram-scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Scraping failed");
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-8 mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🧪 Instagram Scraper Test
          </h1>
          <p className="text-gray-600 mb-6">
            Enter an Instagram username to scrape profile data, posts, and comments
          </p>

          <form onSubmit={handleSubmit} className="flex gap-4">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter Instagram username (without @)"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
            >
              {loading ? "Scraping..." : "Scrape"}
            </button>
          </form>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold text-red-800 mb-2">❌ Error</h2>
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {result && (
          <div className="space-y-8">
            {/* Profile Data */}
            <div className="bg-white rounded-lg shadow-md p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Profile Data</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {result.profile.profilePictureUrl && (
                  <div className="md:col-span-2">
                    <img
                      src={`/api/proxy-image?url=${encodeURIComponent(result.profile.profilePictureUrl)}`}
                      alt="Profile"
                      className="w-32 h-32 rounded-full object-cover"
                    />
                  </div>
                )}
                <div>
                  <label className="text-sm font-semibold text-gray-500">Username</label>
                  <p className="text-gray-900 flex items-center gap-2">
                    {result.profile.username}
                    {result.profile.isVerified && (
                      <span className="text-blue-500" title="Verified">✓</span>
                    )}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-500">Full Name</label>
                  <p className="text-gray-900">{result.profile.fullName || "N/A"}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-500">Verification Status</label>
                  <p className="text-gray-900">{result.profile.isVerified ? "✓ Verified" : "Not Verified"}</p>
                </div>
                {result.profile.category && (
                  <div>
                    <label className="text-sm font-semibold text-gray-500">Category</label>
                    <p className="text-gray-900">{result.profile.category}</p>
                  </div>
                )}
                <div>
                  <label className="text-sm font-semibold text-gray-500">Posts</label>
                  <p className="text-gray-900">{result.profile.postCount?.toLocaleString() || "N/A"}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-500">Followers</label>
                  <p className="text-gray-900">{result.profile.followerCount?.toLocaleString() || "N/A"}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-500">Following</label>
                  <p className="text-gray-900">{result.profile.followingCount?.toLocaleString() || "N/A"}</p>
                </div>
                {result.profile.website && (
                  <div>
                    <label className="text-sm font-semibold text-gray-500">Website</label>
                    <p className="text-gray-900">
                      <a 
                        href={result.profile.website.startsWith("http") ? result.profile.website : `https://${result.profile.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {result.profile.website}
                      </a>
                    </p>
                  </div>
                )}
                {result.profile.biography && (
                  <div className="md:col-span-2">
                    <label className="text-sm font-semibold text-gray-500">Biography</label>
                    <p className="text-gray-900 whitespace-pre-wrap">{result.profile.biography}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Posts */}
            <div className="bg-white rounded-lg shadow-md p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Last 5 Posts ({result.posts.length})
              </h2>
              <div className="space-y-8">
                {result.posts.map((post, index) => (
                  <div key={index} className="border-b border-gray-200 pb-8 last:border-b-0">
                    <div className="mb-4">
                      <div className="flex items-center gap-4 mb-2">
                        <a
                          href={post.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline text-sm"
                        >
                          Open post ↗
                        </a>
                        {post.date && (
                          <span className="text-gray-500 text-sm">
                            {new Date(post.date).toLocaleString()}
                          </span>
                        )}
                        {post.likeCount != null && (
                          <span className="text-gray-500 text-sm">❤️ {post.likeCount.toLocaleString()} likes</span>
                        )}
                        {post.commentCount != null && (
                          <span className="text-gray-500 text-sm">💬 {post.commentCount.toLocaleString()} comments</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">Post ID: {post.id}</p>
                    </div>

                    {/* Thumbnail */}
                    <div className="mb-4">
                      {post.thumbnailUrl ? (
                        <img
                          src={post.thumbnailUrl}
                          alt={`Post ${index + 1} thumbnail`}
                          className="w-full max-w-xl rounded-lg object-cover"
                        />
                      ) : (
                        <p className="text-sm text-gray-500">No thumbnail found.</p>
                      )}
                    </div>

                    {/* Caption */}
                    {post.caption && (
                      <div className="mb-4">
                        <p className="text-gray-900 whitespace-pre-wrap">{post.caption}</p>
                      </div>
                    )}

                    {/* Comments */}
                    {post.comments.length > 0 && (
                      <div className="mt-4 pl-4 border-l-2 border-gray-200">
                        <h4 className="font-semibold text-gray-700 mb-2">
                          Comments ({post.comments.length})
                        </h4>
                        <div className="space-y-3">
                          {post.comments.map((comment, commentIndex) => (
                            <div key={commentIndex} className="text-sm">
                              <span className="font-semibold text-gray-900">{comment.author}</span>
                              <span className="text-gray-700 ml-2">{comment.text}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


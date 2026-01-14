"use client";

import { useState } from "react";

interface InstagramComment {
  author: string;
  text: string;
  timestamp: Date | null;
  likeCount: number | null;
  isAuthorVerified: boolean;
}

interface InstagramPost {
  id: string;
  type: 'image' | 'video' | 'carousel';
  timestamp: Date | null;
  likeCount: number | null;
  viewCount: number | null;
  commentCount: number | null;
  caption: string | null;
  location: string | null;
  taggedUsers: string[];
  imageUrls: string[];
  videoUrl: string | null;
  comments: InstagramComment[];
}

interface InstagramProfile {
  username: string;
  fullName: string | null;
  bio: string | null;
  followerCount: number | null;
  followingCount: number | null;
  postCount: number | null;
  isVerified: boolean;
  isPrivate: boolean;
  profilePicUrl: string | null;
  website: string | null;
  businessCategory: string | null;
  recentPosts: InstagramPost[];
}

export default function TestInstagramScraper() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InstagramProfile | null>(null);
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

  const formatDate = (date: Date | null): string => {
    if (!date) return "N/A";
    try {
      return new Date(date).toLocaleString();
    } catch {
      return "N/A";
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
                {result.profilePicUrl && (
                  <div className="md:col-span-2">
                    <img
                      src={result.profilePicUrl}
                      alt="Profile"
                      className="w-32 h-32 rounded-full object-cover"
                    />
                  </div>
                )}
                <div>
                  <label className="text-sm font-semibold text-gray-500">Username</label>
                  <p className="text-gray-900">@{result.username}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-500">Full Name</label>
                  <p className="text-gray-900">{result.fullName || "N/A"}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-500">Verification Status</label>
                  <p className="text-gray-900">
                    {result.isVerified ? "✅ Verified" : "❌ Not Verified"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-500">Account Type</label>
                  <p className="text-gray-900">
                    {result.isPrivate ? "🔒 Private" : "🌐 Public"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-500">Followers</label>
                  <p className="text-gray-900">
                    {result.followerCount?.toLocaleString() || "N/A"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-500">Following</label>
                  <p className="text-gray-900">
                    {result.followingCount?.toLocaleString() || "N/A"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-500">Posts</label>
                  <p className="text-gray-900">
                    {result.postCount?.toLocaleString() || "N/A"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-500">Business Category</label>
                  <p className="text-gray-900">{result.businessCategory || "N/A"}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-500">Website</label>
                  <p className="text-gray-900">
                    {result.website ? (
                      <a href={result.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        {result.website}
                      </a>
                    ) : (
                      "N/A"
                    )}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm font-semibold text-gray-500">Bio</label>
                  <p className="text-gray-900 whitespace-pre-wrap">
                    {result.bio || "N/A"}
                  </p>
                </div>
              </div>
            </div>

            {/* Posts */}
            <div className="bg-white rounded-lg shadow-md p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Recent Posts ({result.recentPosts.length})
              </h2>
              <div className="space-y-8">
                {result.recentPosts.map((post, index) => (
                  <div key={post.id || index} className="border-b border-gray-200 pb-8 last:border-b-0">
                    <div className="mb-4">
                      <div className="flex items-center gap-4 mb-2 flex-wrap">
                        <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold capitalize">
                          {post.type}
                        </span>
                        {post.timestamp && (
                          <span className="text-gray-500 text-sm">{formatDate(post.timestamp)}</span>
                        )}
                        {post.likeCount != null && (
                          <span className="text-gray-500 text-sm">❤️ {post.likeCount.toLocaleString()} likes</span>
                        )}
                        {post.viewCount != null && (
                          <span className="text-gray-500 text-sm">👁️ {post.viewCount.toLocaleString()} views</span>
                        )}
                        {post.commentCount != null && (
                          <span className="text-gray-500 text-sm">💬 {post.commentCount.toLocaleString()} comments</span>
                        )}
                      </div>
                      {post.location && (
                        <p className="text-gray-600 text-sm">📍 {post.location}</p>
                      )}
                      {post.taggedUsers.length > 0 && (
                        <p className="text-gray-600 text-sm">
                          Tagged: {post.taggedUsers.map(u => `@${u}`).join(", ")}
                        </p>
                      )}
                    </div>

                    {/* Media */}
                    <div className="mb-4">
                      {post.videoUrl ? (
                        <video
                          src={post.videoUrl}
                          controls
                          className="max-w-full rounded-lg"
                        />
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {post.imageUrls.map((url, imgIndex) => (
                            <img
                              key={imgIndex}
                              src={url}
                              alt={`Post ${index + 1} - Image ${imgIndex + 1}`}
                              className="w-full h-auto rounded-lg object-cover"
                            />
                          ))}
                        </div>
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
                              <div className="flex items-start gap-2">
                                <span className="font-semibold text-gray-900">
                                  {comment.author}
                                  {comment.isAuthorVerified && <span className="ml-1">✓</span>}
                                </span>
                                <span className="text-gray-600">{comment.text}</span>
                              </div>
                              <div className="flex items-center gap-3 mt-1 ml-4 text-xs text-gray-500">
                                {comment.timestamp && <span>{formatDate(comment.timestamp)}</span>}
                                {comment.likeCount != null && comment.likeCount > 0 && (
                                  <span>❤️ {comment.likeCount}</span>
                                )}
                              </div>
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

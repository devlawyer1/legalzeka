// ============================================================
// Emsal Atlası - API Client
// Backend ile iletişim katmanı
// ============================================================

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

/**
 * Genel API istek fonksiyonu.
 * Otomatik olarak JWT token ekler ve hata yönetimi yapar.
 */
async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;

  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  // Token varsa ekle
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("accessToken");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    // 401 Unauthorized ise çıkış yap ve login'e at (Login/Register hariç)
    const isAuthRoute = endpoint.includes('/auth/login') || endpoint.includes('/auth/register');
    if (response.status === 401 && !isAuthRoute) {
      if (typeof window !== "undefined") {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("user");
        localStorage.removeItem("subscription");
        window.location.href = "/auth";
      }
    }

    const error = new Error(data.message || "Bir hata oluştu");
    error.status = response.status;
    error.code = data.code;
    error.data = data;
    throw error;
  }

  return data;
}

// ======================== Auth ========================

export async function register({ firstName, lastName, email, password, passwordConfirm }) {
  const data = await request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ firstName, lastName, email, password, passwordConfirm }),
  });

  // Token'ları kaydet
  if (data.data?.tokens) {
    localStorage.setItem("accessToken", data.data.tokens.accessToken);
    localStorage.setItem("refreshToken", data.data.tokens.refreshToken);
    localStorage.setItem("user", JSON.stringify(data.data.user));
  }

  return data;
}

export async function login({ email, password }) {
  const data = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  // Token'ları kaydet
  if (data.data?.tokens) {
    localStorage.setItem("accessToken", data.data.tokens.accessToken);
    localStorage.setItem("refreshToken", data.data.tokens.refreshToken);
    localStorage.setItem("user", JSON.stringify(data.data.user));
    if (data.data.subscription) {
      localStorage.setItem("subscription", JSON.stringify(data.data.subscription));
    }
  }

  return data;
}

export async function getMe() {
  return request("/auth/me");
}

export function logout() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("user");
  localStorage.removeItem("subscription");
  window.location.href = "/auth";
}

export function getStoredUser() {
  if (typeof window === "undefined") return null;
  const user = localStorage.getItem("user");
  return user ? JSON.parse(user) : null;
}

export function updateStoredUser(userData) {
  if (typeof window === "undefined") return;
  localStorage.setItem("user", JSON.stringify(userData));
}

export async function updateProfile(data) {
  return request("/auth/profile", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function updatePassword(data) {
  return request("/auth/password", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function isAuthenticated() {
  if (typeof window === "undefined") return false;
  const token = localStorage.getItem("accessToken");
  const user = localStorage.getItem("user");
  return !!(token && user);
}

// ======================== Search ========================

export async function searchKeyword(query, page = 1, limit = 20) {
  return request(`/search?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`);
}

export async function searchSemantic(query) {
  return request("/search/semantic", {
    method: "POST",
    body: JSON.stringify({ query }),
  });
}

export async function askAI(query) {
  return request("/search/ask", {
    method: "POST",
    body: JSON.stringify({ query }),
  });
}

// ======================== Subscriptions ========================

export async function getPlans() {
  return request("/subscriptions/plans");
}

export async function getMySubscription() {
  return request("/subscriptions/my");
}

// ======================== History ========================

export async function getHistory() {
  return request("/history");
}

export async function deleteHistory(id) {
  return request(`/history/${id}`, {
    method: "DELETE",
  });
}

export async function clearHistory() {
  return request("/history", {
    method: "DELETE",
  });
}

// ======================== Chat ========================

export async function createConversation() {
  return request("/chat/conversations", { method: "POST" });
}

export async function getConversations() {
  return request("/chat/conversations");
}

export async function getConversationMessages(conversationId) {
  return request(`/chat/conversations/${conversationId}/messages`);
}

export async function sendChatMessage(conversationId, message) {
  return request(`/chat/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function deleteConversation(conversationId) {
  return request(`/chat/conversations/${conversationId}`, {
    method: "DELETE",
  });
}

// ======================== Notes ========================

export function getNotes() {
  if (typeof window === "undefined") return [];
  const notes = localStorage.getItem("user_notes");
  return notes ? JSON.parse(notes) : [];
}

export function addNote(content, source = "manual") {
  if (typeof window === "undefined") return null;
  const notes = getNotes();
  const newNote = {
    id: Date.now().toString(),
    content,
    source, // 'manual' or 'ai'
    createdAt: new Date().toISOString()
  };
  notes.unshift(newNote);
  localStorage.setItem("user_notes", JSON.stringify(notes));
  return newNote;
}

export function updateNote(id, content) {
  if (typeof window === "undefined") return;
  let notes = getNotes();
  const index = notes.findIndex(n => n.id === id);
  if (index !== -1) {
    notes[index].content = content;
    notes[index].updatedAt = new Date().toISOString();
    localStorage.setItem("user_notes", JSON.stringify(notes));
  }
}

export function deleteNote(id) {
  if (typeof window === "undefined") return;
  let notes = getNotes();
  notes = notes.filter(n => n.id !== id);
  localStorage.setItem("user_notes", JSON.stringify(notes));
}

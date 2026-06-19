// ============================================================
// Emsal Atlası - API Client
// Backend ile iletişim katmanı
// ============================================================

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

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

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (err) {
    const error = new Error("Sunucuya bağlanılamadı. Lütfen sunucunun çalıştığından emin olun.");
    error.status = 503;
    throw error;
  }

  let data;
  let responseText = "";
  try {
    responseText = await response.text();
    data = JSON.parse(responseText);
  } catch (err) {
    const errorMsg = responseText ? responseText.substring(0, 150) : "Boş yanıt";
    const error = new Error("Sunucudan geçersiz yanıt alındı. " + errorMsg);
    error.status = response.status;
    throw error;
  }

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

    const error = new Error(data.message || data.error || "Bir hata oluştu");
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

export async function searchKeyword(query, page = 1, limit = 20, filters = {}) {
  const queryParams = new URLSearchParams({
    q: query,
    page: page.toString(),
    limit: limit.toString(),
  });
  
  if (filters.mahkeme) queryParams.append("mahkeme", filters.mahkeme);
  if (filters.hukuk_dali) queryParams.append("hukuk_dali", filters.hukuk_dali);
  if (filters.yilMin) queryParams.append("yilMin", filters.yilMin);
  if (filters.yilMax) queryParams.append("yilMax", filters.yilMax);

  return request(`/search?${queryParams.toString()}`);
}

export async function searchSemantic(query, filters = {}) {
  return request("/search/semantic", {
    method: "POST",
    body: JSON.stringify({ query, ...filters }),
  });
}

export async function askAI(query, filters = {}) {
  return request("/search/ask", {
    method: "POST",
    body: JSON.stringify({ query, ...filters }),
  });
}

// ======================== Workdesk ========================

export async function getWorkdeskOverview(firmId) {
  return request(`/workdesk/overview?firmId=${firmId}`);
}

// ======================== Analysis (AI Tools) ========================

async function requestFormData(endpoint, formData) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {};

  if (typeof window !== "undefined") {
    const token = localStorage.getItem("accessToken");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: formData,
    });
  } catch (err) {
    const error = new Error("Sunucuya bağlanılamadı. Lütfen sunucunun çalıştığından emin olun.");
    error.status = 503;
    throw error;
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    const error = new Error("Sunucudan geçersiz yanıt alındı.");
    error.status = response.status;
    throw error;
  }
  if (!response.ok) {
    if (response.status === 401) {
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
    throw error;
  }
  return data;
}

export async function analyzeDevilsAdvocate(formData) {
  return requestFormData("/analysis/devils-advocate", formData);
}

export async function analyzeContract(formData) {
  return requestFormData("/analysis/contract-review", formData);
}

// ======================== Legal Workflows (Expert Agents) ========================

export async function getLegalWorkflowCatalog() {
  return request("/legal-workflows");
}

export async function getLegalWorkflowProfile() {
  return request("/legal-workflows/profile");
}

export async function updateLegalWorkflowProfile(data) {
  return request("/legal-workflows/profile", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function runLegalWorkflow(formData) {
  return requestFormData("/legal-workflows/run", formData);
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

// ======================== Collections ========================

export async function getCollections() {
  return request("/collections");
}

export async function createCollection(data) {
  return request("/collections", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteCollection(id) {
  return request(`/collections/${id}`, {
    method: "DELETE",
  });
}

export async function getCollectionItems(id) {
  return request(`/collections/${id}/items`);
}

export async function addItemToCollection(collectionId, emsal_karar_id) {
  return request(`/collections/${collectionId}/items`, {
    method: "POST",
    body: JSON.stringify({ emsal_karar_id }),
  });
}

export async function removeItemFromCollection(collectionId, emsal_karar_id) {
  return request(`/collections/${collectionId}/items/${emsal_karar_id}`, {
    method: "DELETE",
  });
}

export async function removeFromCollection(collectionId, itemId) {
  return request(`/collections/${collectionId}/items/${itemId}`, {
    method: "DELETE",
  });
}

// ======================== Cases ========================

export async function getCases(firmId) {
  return request(`/cases?firmId=${firmId}`);
}

export async function createCase(firmId, data) {
  return request("/cases", {
    method: "POST",
    body: JSON.stringify({ firmId, ...data }),
  });
}

export async function updateCase(firmId, caseId, data) {
  return request(`/cases/${caseId}`, {
    method: "PUT",
    body: JSON.stringify({ firmId, ...data }),
  });
}

export async function deleteCase(firmId, caseId) {
  return request(`/cases/${caseId}?firmId=${firmId}`, {
    method: "DELETE",
  });
}

// ======================== Newsletter ========================

export async function subscribeToNewsletter(email, categories = ["Tümü"]) {
  return request("/newsletter/subscribe", {
    method: "POST",
    body: JSON.stringify({ email, categories }),
  });
}

export async function unsubscribeFromNewsletter(email) {
  return request("/newsletter/unsubscribe", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

// ======================== UYAP ========================

export async function triggerUyapSync(firmId, { tcKimlik, password }) {
  return request("/uyap/sync", {
    method: "POST",
    body: JSON.stringify({ firmId, tcKimlik, password }),
  });
}

export async function getUyapSyncLogs(firmId, limit = 20) {
  return request(`/uyap/sync/logs?firmId=${firmId}&limit=${limit}`);
}

export async function getUyapSyncStatus(firmId) {
  return request(`/uyap/sync/status?firmId=${firmId}`);
}

export async function getUyapNotifications(firmId, { unreadOnly = false, limit = 50 } = {}) {
  const params = new URLSearchParams({ firmId, limit: limit.toString() });
  if (unreadOnly) params.append("unreadOnly", "true");
  return request(`/uyap/notifications?${params.toString()}`);
}

export async function getUyapUnreadCount(firmId) {
  return request(`/uyap/notifications/unread-count?firmId=${firmId}`);
}

export async function markUyapNotificationRead(firmId, notificationId) {
  return request(`/uyap/notifications/${notificationId}/read?firmId=${firmId}`, {
    method: "PUT",
  });
}

export async function markAllUyapNotificationsRead(firmId) {
  return request(`/uyap/notifications/read-all?firmId=${firmId}`, {
    method: "PUT",
  });
}

export async function getUyapCases(firmId) {
  return request(`/uyap/cases?firmId=${firmId}`);
}

export async function getUyapDocuments(firmId, filters = {}) {
  const params = new URLSearchParams({ firmId });
  if (filters.caseId) params.append("caseId", filters.caseId);
  if (filters.type && filters.type !== "all") params.append("type", filters.type);
  return request(`/uyap/documents?${params.toString()}`);
}

export async function downloadUyapDocument(firmId, documentId) {
  return request(`/uyap/documents/${documentId}/download?firmId=${firmId}`);
}

export async function analyzeUyapDocument(firmId, documentId) {
  return request(`/uyap/documents/${documentId}/analyze`, {
    method: "POST",
    body: JSON.stringify({ firmId }),
  });
}

// ==========================================
// Firm Management
// ==========================================
export async function getMyFirms() {
  return request("/firms");
}

export async function createFirm(data) {
  return request("/firms", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getFirmDetails(firmId) {
  return request(`/firms/${firmId}`);
}

export async function getFirmMembers(firmId) {
  return request(`/firms/${firmId}/members`);
}

export async function getFirmInvitations(firmId) {
  return request(`/firms/${firmId}/invitations`);
}

export async function inviteFirmMember(firmId, data) {
  return request(`/firms/${firmId}/invite`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateFirmMemberRole(firmId, userId, firmRole) {
  return request(`/firms/${firmId}/members/${userId}/role`, {
    method: "PUT",
    body: JSON.stringify({ firmRole }),
  });
}

export async function removeFirmMember(firmId, userId) {
  return request(`/firms/${firmId}/members/${userId}`, {
    method: "DELETE",
  });
}

export async function updateFirm(firmId, data) {
  return request(`/firms/${firmId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// ==========================================
// Firm Templates (RAG)
// ==========================================
export async function getFirmTemplates(firmId) {
  return request(`/firms/${firmId}/templates`);
}

export async function createFirmTemplate(firmId, data) {
  return request(`/firms/${firmId}/templates`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteFirmTemplate(firmId, id) {
  return request(`/firms/${firmId}/templates/${id}`, {
    method: "DELETE",
  });
}

export async function generateDraftFromTemplates(firmId, prompt, caseData) {
  return request(`/firms/${firmId}/templates/generate-draft`, {
    method: "POST",
    body: JSON.stringify({ prompt, caseData }),
  });
}

// ==========================================
// Tasks
// ==========================================
export async function getTasks(firmId) {
  return request(`/tasks?firmId=${firmId}`);
}

export async function createTask(firmId, data) {
  return request("/tasks", {
    method: "POST",
    body: JSON.stringify({ firmId, ...data }),
  });
}

export async function updateTask(firmId, id, data) {
  return request(`/tasks/${id}`, {
    method: "PUT",
    body: JSON.stringify({ firmId, ...data }),
  });
}

export async function deleteTask(firmId, id) {
  return request(`/tasks/${id}?firmId=${firmId}`, {
    method: "DELETE",
  });
}

// ==========================================
// Internal Chat
// ==========================================
export async function getInternalMessages(firmId, limit = 50, offset = 0) {
  return request(`/internal-chat?firmId=${firmId}&limit=${limit}&offset=${offset}`);
}

export async function sendInternalMessage(firmId, icerik) {
  return request("/internal-chat", {
    method: "POST",
    body: JSON.stringify({ firmId, icerik }),
  });
}

// ==========================================
// Petitions
// ==========================================
export async function getPetitions(firmId, caseId) {
  return request(`/cases/${caseId}/petitions`);
}

export async function createPetition(firmId, caseId, data) {
  return request(`/cases/${caseId}/petitions`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function generateAiPetition(firmId, caseId, data) {
  return request(`/cases/${caseId}/petitions/generate`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deletePetition(firmId, caseId, id) {
  return request(`/cases/${caseId}/petitions/${id}`, {
    method: "DELETE",
  });
}

export async function getPetitionComparisons(firmId, caseId) {
  return request(`/cases/${caseId}/petitions/comparisons`);
}

export async function compareAiPetitions(firmId, caseId, data) {
  return request(`/cases/${caseId}/petitions/compare`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ==========================================
// Deadline Alerts
// ==========================================
export async function getActiveDeadlines(firmId) {
  return request(`/deadlines/active?firmId=${firmId}`);
}

export async function getAllDeadlines(firmId, { limit = 50, offset = 0 } = {}) {
  return request(`/deadlines/all?firmId=${firmId}&limit=${limit}&offset=${offset}`);
}

export async function getUrgentDeadlineCount(firmId) {
  return request(`/deadlines/urgent-count?firmId=${firmId}`);
}

export async function createDeadline(data) {
  return request("/deadlines", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function acknowledgeDeadline(id) {
  return request(`/deadlines/${id}/acknowledge`, { method: "PUT" });
}

export async function deleteDeadline(id) {
  return request(`/deadlines/${id}`, { method: "DELETE" });
}

// ==========================================
// Case Timeline
// ==========================================
export async function getCaseTimeline(caseId) {
  return request(`/cases/${caseId}/timeline`);
}

export async function getCaseWorkspace(caseId) {
  return request(`/cases/${caseId}/workspace`);
}

export async function getCaseDocuments(caseId) {
  return request(`/cases/${caseId}/documents`);
}

export async function uploadCaseDocument(caseId, formData) {
  return requestFormData(`/cases/${caseId}/documents`, formData);
}

export async function analyzeCaseDocument(caseId, documentId) {
  return request(`/cases/${caseId}/documents/${documentId}/analyze`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

// ==========================================
// Law Versioning (Time-Travel)
// ==========================================
export async function searchLaws(query, date) {
  const params = new URLSearchParams({ q: query });
  if (date) params.append("date", date);
  return request(`/laws/search?${params.toString()}`);
}

export async function getLawHistory(lawNumber, articleNumber) {
  const path = articleNumber
    ? `/laws/${lawNumber}/history/${encodeURIComponent(articleNumber)}`
    : `/laws/${lawNumber}/history`;
  return request(path);
}

export async function getLawAtDate(lawNumber, articleNumber, date) {
  const encodedArticle = articleNumber ? encodeURIComponent(articleNumber) : '';
  return request(`/laws/${lawNumber}/${encodedArticle}/at?date=${date}`);
}

export async function getLawList() {
  return request("/laws/list");
}
export async function getCorporateTree(firmId) {
  return request(`/firms/${firmId}/corporate/tree`);
}

export async function createCorporateEntity(firmId, data) {
  return request(`/firms/${firmId}/corporate/tree`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getTickets(firmId) {
  return request(`/firms/${firmId}/corporate/tickets`);
}

export async function createTicket(firmId, data) {
  return request(`/firms/${firmId}/corporate/tickets`, {

    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateTicketStatus(firmId, id, status) {
  return request(`/firms/${firmId}/corporate/tickets/${id}/status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}

// ==========================================
// Tevkil Pazarı (Yetki Devri)
// ==========================================

export async function createTevkilAd(data) {
  return request("/tevkil/ads", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getTevkilAds() {
  return request("/tevkil/ads");
}

export async function getMyTevkilAds() {
  return request("/tevkil/my-ads");
}

export async function applyToTevkilAd(ad_id, message) {
  return request("/tevkil/apply", {
    method: "POST",
    body: JSON.stringify({ ad_id, message }),
  });
}

export async function getMyTevkilApplications() {
  return request("/tevkil/my-applications");
}

export async function handleTevkilApplication(application_id, action) {
  return request("/tevkil/handle-application", {
    method: "POST",
    body: JSON.stringify({ application_id, action }),
  });
}

export async function improveTevkilDescriptionAI(description) {
  return request("/tevkil/improve-description", {
    method: "POST",
    body: JSON.stringify({ description }),
  });
}

import { request } from "./api";

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
